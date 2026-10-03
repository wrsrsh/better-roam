import { clone } from './clone';
import { AdapterError, asError } from './transport';
import { SearchIndex } from './search';
import { integer, lookup, normalize, pattern, position, style, text } from './model';
import type { AdapterOptions, BatchCommand, BatchResult, BlockInput, BlockPatch, Entity, EntityRef, Order, PageInput, ReadOptions, ReadResult, Request, Response, Scope, SearchHit, SearchOptions, SubscriptionEvent, Transport, WriteOptions, WriteReceipt } from './types';

type Context = { scope: Scope; epoch: number };
type CacheEntry = { value: Entity | null; time: number };
const sameScope = (a: Scope | null, b: Scope | null) => JSON.stringify(a) === JSON.stringify(b);
const writeMethods = ['createPage', 'ensurePage', 'renamePage', 'deletePage', 'createBlock', 'updateBlock', 'moveBlock', 'deleteBlock', 'importMarkdown', 'undo', 'redo'] as const;
const readMethods = ['status', 'getEntity', 'getPage', 'getBlock', 'getChildren', 'listPages', 'getBacklinks', 'query', 'dailyNote', 'refreshSearch', 'search', 'watch', 'unwatch', 'openOriginal', 'batch', 'invalidate'] as const;

export class RoamAdapter {
  private current: Scope | null = null;
  private epoch = 0;
  private revision = 0;
  private disposed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, CacheEntry>();
  private watches = new Map<string, { cleanup: () => Promise<unknown>; active: boolean }>();
  private searchIndex: SearchIndex | null = null;
  private indexTime = 0;
  private indexRevision = 0;
  private sequence = 0;
  private timeoutMs: number;
  private cacheTtlMs: number;
  private cacheEntries: number;
  constructor(private transport: Transport, private options: AdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.cacheTtlMs = options.cacheTtlMs ?? 1000;
    this.cacheEntries = options.cacheEntries ?? 128;
    integer(this.timeoutMs, 'timeoutMs', 1, 120000);
    integer(this.cacheTtlMs, 'cacheTtlMs', 0, 60000);
    integer(this.cacheEntries, 'cacheEntries', 1, 10000);
  }

  private context(): Context {
    if (this.disposed) throw new AdapterError('DISPOSED', 'Adapter has been disposed.');
    const scope = this.transport.scope();
    if (!sameScope(this.current, scope)) {
      this.current = scope; this.epoch++; this.invalidate();
      this.searchIndex = null; this.indexTime = 0;
      this.tail = Promise.resolve();
      for (const id of [...this.watches.keys()]) void this.unwatch(id).catch(() => {});
    }
    if (!scope || !this.transport.supports('data.pull')) throw new AdapterError('NOT_READY', 'Open an authenticated Roam graph first.');
    return { scope: clone(scope), epoch: this.epoch };
  }
  private assertContext(ctx: Context, writing = false) {
    let current: Context;
    try { current = this.context(); } catch {
      throw new AdapterError('SCOPE_CHANGED', 'Graph or account is no longer available.', writing ? 'unknown' : 'not-applied');
    }
    if (ctx.epoch !== current.epoch || !sameScope(ctx.scope, current.scope))
      throw new AdapterError('SCOPE_CHANGED', 'Graph or account changed during the operation.', writing ? 'unknown' : 'not-applied');
  }
  private async timed<T>(promise: Promise<T>, onTimeout: () => AdapterError): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), this.timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  private async readCall(ctx: Context, method: string, args: unknown[]): Promise<any> {
    this.assertContext(ctx);
    try {
      const result = await this.timed(Promise.resolve(this.transport.call(method, args)), () => new AdapterError('TIMEOUT', 'Roam read timed out.'));
      this.assertContext(ctx);
      return result;
    } catch (error) { throw asError(error); }
  }
  private result<T>(ctx: Context, value: T, time = Date.now(), cached = false): ReadResult<T> {
    return { scope: clone(ctx.scope), value: clone(value), observedAt: time, source: cached ? 'memory-cache' : 'roam-client' };
  }
  private async pull(ctx: Context, ref: EntityRef, depth = 0) {
    return normalize(await this.readCall(ctx, 'data.pull', [pattern(depth), lookup(ref)]), depth);
  }
  private async require(ctx: Context, uid: string, kind?: Entity['kind']) {
    const entity = await this.pull(ctx, { uid });
    if (!entity || (kind && entity.kind !== kind)) throw new AdapterError('NOT_FOUND', 'The requested entity does not exist.');
    return entity;
  }
  private async apply(ctx: Context, method: string, args: unknown[]) {
    this.assertContext(ctx);
    const value: any = await this.transport.call(method, args);
    // Newer Roam builds report failed deletes; older ones return null.
    if (value?.deleted === false) throw new AdapterError('NOT_DELETED', 'Roam reported that nothing was deleted.');
    if (value?.success === false) throw new AdapterError('UPSTREAM_ERROR', 'Roam rejected the operation.', 'unknown');
    this.assertContext(ctx, true);
    return value;
  }
  private write<T>(work: (ctx: Context) => Promise<T>): Promise<WriteReceipt<T>> {
    const ctx = this.context();
    const operationId = `op-${++this.sequence}`;
    let started = false, expired = false;
    const operation = this.tail.then(async () => {
      if (expired) throw new AdapterError('TIMEOUT', 'Queued operation expired before execution.');
      this.assertContext(ctx);
      started = true;
      this.invalidate();
      try {
        const value = await work(ctx);
        this.assertContext(ctx, true);
        return { operationId, scope: clone(ctx.scope), value, status: 'applied-in-client' as const, serverSynced: 'unknown' as const };
      } catch (error) { throw asError(error, true); }
      finally { this.invalidate(); }
    });
    // A caller timeout must NOT release this barrier: Roam may still be writing.
    this.tail = operation.catch(() => {});
    return this.timed(operation, () => {
      expired = true;
      return new AdapterError('TIMEOUT', started ? 'Write outcome is unknown; reread before retrying.' : 'Write expired in the queue.', started ? 'unknown' : 'not-applied');
    });
  }
  invalidate() { this.cache.clear(); this.revision++; }
  status() {
    let scope: Scope | null = null;
    try { scope = this.context().scope; } catch (error) {
      if (!(error instanceof AdapterError) || error.code !== 'NOT_READY') throw error;
    }
    return {
      ready: !!scope, scope, serverSynced: 'unknown',
      capabilities: Object.fromEntries(['data.q', 'data.pull', 'data.pull_many', 'data.addPullWatch', 'data.removePullWatch',
        'data.page.create', 'data.page.update', 'data.page.delete', 'data.block.create', 'data.block.update', 'data.block.move',
        'data.block.delete', 'data.block.fromMarkdown', 'data.undo', 'data.redo', 'ui.mainWindow.openBlock'].map(path => [path, this.transport.supports(path)])),
    };
  }
  async getEntity(ref: EntityRef, options: ReadOptions = {}): Promise<ReadResult<Entity | null>> {
    const ctx = this.context(); const depth = options.depth ?? 0;
    const key = JSON.stringify([lookup(ref), pattern(depth)]);
    const cached = this.cache.get(key);
    if (!options.fresh && cached && Date.now() - cached.time < this.cacheTtlMs) return this.result(ctx, cached.value, cached.time, true);
    const revision = this.revision;
    const value = await this.pull(ctx, ref, depth);
    if (revision !== this.revision) throw new AdapterError('STALE_READ', 'Graph changed while reading; refresh the view.');
    const time = Date.now();
    if (this.cache.size >= this.cacheEntries) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { value: clone(value), time });
    return this.result(ctx, value, time);
  }
  async getPage(ref: EntityRef, options: ReadOptions = {}) {
    const result = await this.getEntity(ref, { depth: 2, ...options });
    if (result.value && result.value.kind !== 'page') throw new AdapterError('INVALID_ARGUMENT', 'Requested entity is not a page.');
    return result;
  }
  async getBlock(uid: string, options: ReadOptions = {}) {
    const result = await this.getEntity({ uid }, options);
    if (result.value && result.value.kind !== 'block') throw new AdapterError('INVALID_ARGUMENT', 'Requested entity is not a block.');
    return result;
  }
  async getChildren(uid: string, options: ReadOptions = {}) {
    const result = await this.getEntity({ uid }, { ...options, depth: 1 });
    return { ...result, value: result.value?.children ?? [] };
  }
  async query(datalog: string, inputs: unknown[] = []): Promise<ReadResult<unknown>> {
    text(datalog, 'query'); if (!Array.isArray(inputs)) throw new AdapterError('INVALID_ARGUMENT', 'inputs must be an array.');
    const ctx = this.context(); const revision = this.revision;
    const value = await this.readCall(ctx, 'data.q', [datalog, ...clone(inputs)]);
    if (revision !== this.revision) throw new AdapterError('STALE_READ', 'Graph changed while querying.');
    return this.result(ctx, value);
  }
  async listPages({ offset = 0, limit = 100 }: { offset?: number; limit?: number } = {}) {
    integer(offset, 'offset', 0, Number.MAX_SAFE_INTEGER); integer(limit, 'limit', 1, 1000);
    const result = await this.query('[:find ?uid ?title :where [?p :node/title ?title] [?p :block/uid ?uid]]');
    const pages = (result.value as string[][]).map(([uid, title]) => ({ uid: uid!, title: title! })).sort((a, b) => a.title.localeCompare(b.title) || a.uid.localeCompare(b.uid));
    return { ...result, value: { total: pages.length, items: pages.slice(offset, offset + limit) } };
  }
  async getBacklinks(uid: string, { offset = 0, limit = 100 }: { offset?: number; limit?: number } = {}) {
    text(uid, 'uid'); integer(offset, 'offset', 0, Number.MAX_SAFE_INTEGER); integer(limit, 'limit', 1, 1000);
    const result = await this.query(`[:find (pull ?source ${pattern(0)}) :in $ ?uid :where [?target :block/uid ?uid] [?source :block/refs ?target]]`, [uid]);
    const entities = (result.value as unknown[][]).map(row => normalize(row[0], 0)).filter((x): x is Entity => x !== null).sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0) || a.uid.localeCompare(b.uid));
    return { ...result, value: { total: entities.length, items: entities.slice(offset, offset + limit) } };
  }
  createPage(input: PageInput) {
    text(input?.title, 'title'); input = clone(input); if (input.uid !== undefined) text(input.uid, 'uid');
    const properties = style({ childrenViewType: input.childrenViewType });
    return this.write(async ctx => {
      if (await this.pull(ctx, { title: input.title })) throw new AdapterError('ALREADY_EXISTS', 'A page with that title already exists.');
      const uid = input.uid ?? await this.readCall(ctx, 'util.generateUID', []);
      text(uid, 'generated uid');
      if (await this.pull(ctx, { uid })) throw new AdapterError('ALREADY_EXISTS', 'The requested UID already exists.');
      await this.apply(ctx, 'data.page.create', [{ page: { uid, title: input.title, ...properties } }]);
      return { uid };
    });
  }
  ensurePage(title: string) {
    text(title, 'title');
    return this.write(async ctx => {
      const existing = await this.pull(ctx, { title });
      if (existing) return { uid: existing.uid, created: false };
      const uid = await this.readCall(ctx, 'util.generateUID', []); text(uid, 'generated uid');
      await this.apply(ctx, 'data.page.create', [{ page: { uid, title } }]);
      return { uid, created: true };
    });
  }
  renamePage(uid: string, title: string) {
    text(uid, 'uid'); text(title, 'title');
    return this.write(async ctx => {
      await this.require(ctx, uid, 'page');
      const other = await this.pull(ctx, { title });
      if (other && other.uid !== uid) throw new AdapterError('ALREADY_EXISTS', 'Renaming would merge pages; explicit merge support is not enabled.');
      return this.apply(ctx, 'data.page.update', [{ page: { uid, title }, 'merge-pages': false }]);
    });
  }
  deletePage(uid: string) {
    text(uid, 'uid');
    return this.write(async ctx => { await this.require(ctx, uid, 'page'); return this.apply(ctx, 'data.page.delete', [{ page: { uid } }]); });
  }
  createBlock(parentUid: string, input: BlockInput, order: Order = 'last') {
    text(parentUid, 'parentUid'); text(input?.text, 'text', true); input = clone(input); position(order);
    if (input.uid !== undefined) text(input.uid, 'uid');
    const properties = style(input);
    return this.write(async ctx => {
      await this.require(ctx, parentUid);
      const uid = input.uid ?? await this.readCall(ctx, 'util.generateUID', []); text(uid, 'generated uid');
      if (await this.pull(ctx, { uid })) throw new AdapterError('ALREADY_EXISTS', 'The requested UID already exists.');
      await this.apply(ctx, 'data.block.create', [{ location: { 'parent-uid': parentUid, order }, block: { uid, ...properties } }]);
      return { uid };
    });
  }
  updateBlock(uid: string, patch: BlockPatch, options: WriteOptions = {}) {
    text(uid, 'uid'); const properties = style(patch);
    if (!Object.keys(properties).length) throw new AdapterError('INVALID_ARGUMENT', 'Block patch is empty.');
    options = clone(options);
    if (options.expectedText !== undefined) text(options.expectedText, 'expectedText', true);
    return this.write(async ctx => {
      const current = await this.require(ctx, uid, 'block');
      if (options.expectedText !== undefined && current.text !== options.expectedText)
        throw new AdapterError('CONFLICT', 'Block changed since the draft was started. Preserve the draft and refresh.');
      return this.apply(ctx, 'data.block.update', [{ block: { uid, ...properties } }]);
    });
  }
  moveBlock(uid: string, parentUid: string, order: Order = 'last') {
    text(uid, 'uid'); text(parentUid, 'parentUid'); position(order);
    if (uid === parentUid) throw new AdapterError('INVALID_ARGUMENT', 'A block cannot be its own parent.');
    return this.write(async ctx => {
      await this.require(ctx, uid, 'block'); const parent = await this.require(ctx, parentUid);
      if (parent.parentUids.includes(uid)) throw new AdapterError('INVALID_ARGUMENT', 'Moving into a descendant would create a cycle.');
      return this.apply(ctx, 'data.block.move', [{ location: { 'parent-uid': parentUid, order }, block: { uid } }]);
    });
  }
  deleteBlock(uid: string) {
    text(uid, 'uid');
    return this.write(async ctx => { await this.require(ctx, uid, 'block'); return this.apply(ctx, 'data.block.delete', [{ block: { uid } }]); });
  }
  importMarkdown(parentUid: string, markdown: string, order: Order = 'last') {
    text(parentUid, 'parentUid'); text(markdown, 'markdown'); position(order);
    return this.write(async ctx => {
      await this.require(ctx, parentUid);
      return this.apply(ctx, 'data.block.fromMarkdown', [{ location: { 'parent-uid': parentUid, order }, 'markdown-string': markdown }]);
    });
  }
  undo() { return this.write(ctx => this.apply(ctx, 'data.undo', [])); }
  redo() { return this.write(ctx => this.apply(ctx, 'data.redo', [])); }
  async dailyNote(date: string) {
    text(date, 'date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AdapterError('INVALID_ARGUMENT', 'Use a local calendar date in YYYY-MM-DD format.');
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const value = new Date(y, m - 1, d, 12);
    if (value.getFullYear() !== y || value.getMonth() !== m - 1 || value.getDate() !== d) throw new AdapterError('INVALID_ARGUMENT', 'Invalid calendar date.');
    const ctx = this.context();
    const uid = await this.readCall(ctx, 'util.dateToPageUid', [value]);
    const title = await this.readCall(ctx, 'util.dateToPageTitle', [value]);
    return this.result(ctx, { uid, title });
  }
  async openOriginal(uid: string) {
    text(uid, 'uid'); const ctx = this.context();
    return this.readCall(ctx, 'ui.mainWindow.openBlock', [{ block: { uid } }]);
  }
  async refreshSearch() {
    const ctx = this.context(); const revision = this.revision;
    const result = await this.readCall(ctx, 'data.q', ['[:find ?uid ?text ?kind :where (or-join [?e ?text ?kind] (and [?e :node/title ?text] [(ground "page") ?kind]) (and [?e :block/string ?text] [(ground "block") ?kind])) [?e :block/uid ?uid]]']);
    this.assertContext(ctx);
    if (revision !== this.revision) throw new AdapterError('STALE_READ', 'Graph changed while indexing.');
    this.searchIndex = new SearchIndex(result as [string, string, 'page' | 'block'][]);
    this.indexTime = Date.now(); this.indexRevision = revision;
    return { count: this.searchIndex.size, indexedAt: this.indexTime };
  }
  search(query: string, { limit = 30, kind = 'all' }: SearchOptions = {}) {
    this.context(); text(query, 'query', true); integer(limit, 'limit', 1, 1000);
    if (!['page', 'block', 'all'].includes(kind)) throw new AdapterError('INVALID_ARGUMENT', 'Invalid search kind.');
    if (!this.searchIndex) throw new AdapterError('INDEX_NOT_READY', 'Build the search index first.');
    return { ...this.searchIndex.search(query, limit, kind), indexedAt: this.indexTime, stale: this.indexRevision !== this.revision || Date.now() - this.indexTime > this.cacheTtlMs };
  }

  async watch(uid: string, depth = 1): Promise<string> {
    text(uid, 'uid'); const selector = pattern(depth); const ctx = this.context();
    if (!this.transport.watch) throw new AdapterError('UNSUPPORTED', 'This transport does not support subscriptions.');
    if (this.watches.size >= 128) throw new AdapterError('LIMIT_REACHED', 'Too many active subscriptions.');
    const id = `watch-${++this.sequence}`;
    const record = { active: true, cleanup: async (): Promise<unknown> => undefined };
    this.watches.set(id, record);
    try {
      const registration = this.transport.watch(selector, `[:block/uid ${JSON.stringify(uid)}]`, (_before, after) => {
        if (!record.active) return;
        try { this.assertContext(ctx); } catch { return; }
        this.invalidate();
        const event: SubscriptionEvent = { scope: clone(ctx.scope), uid, value: normalize(after, depth), observedAt: Date.now() };
        // Subscriber exceptions must not escape into Roam's transaction processing.
        try { this.options.onEvent?.(event); } catch { /* consumer owns its errors */ }
      }).then(async cleanup => {
        record.cleanup = cleanup;
        if (!record.active) { await cleanup(); throw new AdapterError('SCOPE_CHANGED', 'Subscription registration was cancelled.'); }
        return cleanup;
      });
      record.cleanup = await this.timed(registration, () => {
        record.active = false; this.watches.delete(id);
        return new AdapterError('TIMEOUT', 'Subscription registration timed out.');
      });
      if (!record.active) { await record.cleanup(); throw new AdapterError('SCOPE_CHANGED', 'Subscription was cancelled during registration.'); }
      this.assertContext(ctx);
      return id;
    } catch (error) { await this.unwatch(id).catch(() => {}); throw asError(error); }
  }
  async unwatch(id: string) {
    text(id, 'subscription id'); const record = this.watches.get(id);
    if (!record) return;
    record.active = false; this.watches.delete(id); await record.cleanup();
  }
  async batch(commands: BatchCommand[]): Promise<BatchResult> {
    if (!Array.isArray(commands) || commands.length > 100) throw new AdapterError('INVALID_ARGUMENT', 'A batch must contain at most 100 commands.');
    commands = clone(commands);
    const ctx = this.context(); const completed: WriteReceipt[] = [];
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]!;
      try {
        this.assertContext(ctx);
        if (!(writeMethods as readonly string[]).includes(command.method)) throw new AdapterError('INVALID_ARGUMENT', 'Batches contain only known write commands.');
        const response = await this.request({ id: `batch-${i}`, ...command });
        if (!response.ok) return { completed, failedIndex: i, error: response.error };
        completed.push(response.value as WriteReceipt);
      } catch (error) { return { completed, failedIndex: i, error: asError(error).toJSON() }; }
    }
    return { completed, failedIndex: null };
  }
  async request(request: Request): Promise<Response> {
    const id = typeof request?.id === 'string' ? request.id : '';
    try {
      if (!request || !id || ![...readMethods, ...writeMethods].includes(request.method as any)) throw new AdapterError('UNKNOWN_METHOD', 'Unknown adapter method.');
      if (request.args !== undefined && !Array.isArray(request.args)) throw new AdapterError('INVALID_ARGUMENT', 'args must be an array.');
      const method = this[request.method as keyof this] as (...args: unknown[]) => unknown;
      const value = await method.apply(this, clone(request.args ?? []));
      return { id, ok: true, value: value ?? null };
    } catch (error) { return { id, ok: false, error: asError(error).toJSON() }; }
  }
  async dispose() {
    this.disposed = true; this.epoch++; this.cache.clear(); this.searchIndex = null;
    await Promise.allSettled([...this.watches.keys()].map(id => this.unwatch(id)));
  }
}

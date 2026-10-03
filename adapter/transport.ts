import { clone } from './clone';
import type { Scope, Transport } from './types';

export class AdapterError extends Error {
  constructor(public code: string, message: string, public outcome: 'not-applied' | 'unknown' = 'not-applied') {
    super(message); this.name = 'AdapterError';
  }
  toJSON() { return { code: this.code, message: this.message, outcome: this.outcome }; }
}

export function asError(error: unknown, writing = false): AdapterError {
  if (error instanceof AdapterError) return error;
  // Do not forward arbitrary upstream messages: they can contain graph text.
  return new AdapterError('UPSTREAM_ERROR', 'Roam could not complete the operation.', writing ? 'unknown' : 'not-applied');
}

const aliases: Record<string, string> = {
  'data.pull': 'pull', 'data.q': 'q', 'data.pull_many': 'pull_many',
  'data.page.create': 'createPage', 'data.page.update': 'updatePage', 'data.page.delete': 'deletePage',
  'data.block.create': 'createBlock', 'data.block.update': 'updateBlock',
  'data.block.move': 'moveBlock', 'data.block.delete': 'deleteBlock',
};

export function createWebviewTransport(getApi: () => any, getRouteGraph: () => string | null): Transport {
  function resolve(path: string): { owner: any; fn: (...args: unknown[]) => unknown } | null {
    const api = getApi();
    for (const candidate of [path, aliases[path]].filter(Boolean) as string[]) {
      const parts = candidate.split('.');
      let owner = api;
      for (const part of parts.slice(0, -1)) owner = owner?.[part];
      const fn = owner?.[parts.at(-1)!];
      if (typeof fn === 'function') return { owner, fn };
    }
    return null;
  }
  return {
    scope(): Scope | null {
      let api: any;
      try { api = getApi(); } catch { return null; }
      const graph = api?.graph?.name;
      // During graph navigation Roam can still expose the previous graph's API.
      if (typeof graph !== 'string' || graph !== getRouteGraph()) return null;
      let user: unknown = null;
      try { user = typeof api?.user?.uid === 'function' ? api.user.uid() : null; } catch { return null; }
      return { graph, user: typeof user === 'string' ? user : null };
    },
    async watch(pattern, entity, callback) {
      const add = resolve('data.addPullWatch');
      const remove = resolve('data.removePullWatch');
      if (!add || !remove) throw new AdapterError('UNSUPPORTED', 'Roam pull watches are unavailable.');
      // Capture both bound functions before registration; graph changes must never
      // remove another graph's subscriptions or another extension's callbacks.
      await add.fn.apply(add.owner, [pattern, entity, callback]);
      return async () => remove.fn.apply(remove.owner, [pattern, entity, callback]);
    },
    supports: path => resolve(path) !== null,
    call(path, args) {
      const method = resolve(path);
      if (!method) throw new AdapterError('UNSUPPORTED', `Roam does not expose ${path}.`);
      return method.fn.apply(method.owner, args);
    },
  };
}

/** Structural bridge to @roam-research/roam-tools-local's RoamClient.
 * Authentication, version negotiation and port discovery stay in the official SDK.
 * Capability lists are explicit because that transport cannot introspect functions.
 */
export function createActionClientTransport(
  client: { call<T = unknown>(action: string, args?: unknown[]): Promise<{success: boolean; result?: T; error?: unknown}> },
  scope: Scope,
  methods: readonly string[],
): Transport {
  const identity = clone(scope);
  const available = new Set(methods);
  return {
    scope: () => clone(identity),
    supports: path => available.has(path),
    async call(path, args) {
      if (!available.has(path)) throw new AdapterError('UNSUPPORTED', `Transport does not expose ${path}.`);
      const response = await client.call(path, args);
      if (!response.success) throw new AdapterError('UPSTREAM_ERROR', 'Official Roam client rejected the operation.', 'unknown');
      return response.result;
    },
  };
}

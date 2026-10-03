export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type EntityRef = { uid: string } | { title: string };
export type Order = number | 'first' | 'last';
export interface BlockStyle {
  open?: boolean;
  heading?: 0 | 1 | 2 | 3;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  childrenViewType?: 'bullet' | 'numbered' | 'document';
}
export interface Entity extends BlockStyle {
  uid: string;
  kind: 'page' | 'block';
  title?: string;
  text?: string;
  order?: number;
  pageUid?: string;
  parentUids: string[];
  referenceUids: string[];
  children: Entity[];
  childUids: string[];
  childrenLoaded: boolean;
  createdAt?: number;
  editedAt?: number;
  // Retain unrecognized attributes so unsupported Roam features aren't erased.
  attributes: Record<string, unknown>;
}
export interface Scope { graph: string; user: string | null; }
export interface ReadResult<T> {
  scope: Scope; value: T; observedAt: number; source: 'roam-client' | 'memory-cache';
}
export interface WriteReceipt<T = unknown> {
  operationId: string; scope: Scope; value: T;
  status: 'applied-in-client'; serverSynced: 'unknown';
}
export interface ReadOptions { fresh?: boolean; depth?: number; }
export interface PageInput { title: string; uid?: string; childrenViewType?: BlockStyle['childrenViewType']; }
export interface BlockInput extends BlockStyle { uid?: string; text: string; }
export interface BlockPatch extends BlockStyle { text?: string; }
export interface WriteOptions { expectedText?: string; }
export interface SearchHit { uid: string; kind: 'page' | 'block'; text: string; score: number; }
export interface SearchOptions { limit?: number; kind?: 'page' | 'block' | 'all'; }
export interface SubscriptionEvent { scope: Scope; uid: string; value: Entity | null; observedAt: number; }
export interface BatchCommand { method: string; args?: unknown[]; }
export interface BatchResult { completed: WriteReceipt[]; failedIndex: number | null; error?: ErrorInfo; }
export interface ErrorInfo { code: string; message: string; outcome: 'not-applied' | 'unknown'; }

// Only the transport touches Roam's untyped, version-dependent API.
export interface Transport {
  scope(): Scope | null;
  watch?(pattern: string, entity: string, callback: (before: unknown, after: unknown) => void): Promise<() => Promise<unknown>>;
  supports(path: string): boolean;
  call(path: string, args: unknown[]): unknown | Promise<unknown>;
}
export interface AdapterOptions {
  timeoutMs?: number; cacheTtlMs?: number; cacheEntries?: number;
  onEvent?: (event: SubscriptionEvent) => void;
}
export interface Request { id: string; method: string; args?: unknown[]; }
export type Response = { id: string; ok: true; value: unknown } | { id: string; ok: false; error: ErrorInfo };

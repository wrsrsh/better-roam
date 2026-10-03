import { clone } from './clone';
import { AdapterError } from './transport';
import type { Entity, EntityRef, BlockPatch, Order } from './types';

export function text(value: unknown, name: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()))
    throw new AdapterError('INVALID_ARGUMENT', `${name} must be ${allowEmpty ? 'a string' : 'a nonempty string'}.`);
}
export function integer(value: unknown, name: string, min = 0, max = 10000): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new AdapterError('INVALID_ARGUMENT', `${name} must be an integer between ${min} and ${max}.`);
}
export function lookup(ref: EntityRef): [string, string] {
  if (!ref || typeof ref !== 'object' || ('uid' in ref) === ('title' in ref))
    throw new AdapterError('INVALID_ARGUMENT', 'Provide exactly one of uid or title.');
  if ('uid' in ref) { text(ref.uid, 'uid'); return [':block/uid', ref.uid]; }
  text(ref.title, 'title'); return [':node/title', ref.title];
}
export function position(order: Order): Order {
  if (order !== 'first' && order !== 'last') integer(order, 'order');
  return order;
}
export function style(patch: BlockPatch): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') throw new AdapterError('INVALID_ARGUMENT', 'Invalid block patch.');
  const result: Record<string, unknown> = {};
  if (patch.text !== undefined) { text(patch.text, 'text', true); result.string = patch.text; }
  if (patch.open !== undefined) {
    if (typeof patch.open !== 'boolean') throw new AdapterError('INVALID_ARGUMENT', 'open must be boolean.');
    result.open = patch.open;
  }
  if (patch.heading !== undefined) { integer(patch.heading, 'heading', 0, 3); result.heading = patch.heading; }
  for (const [input, output, choices] of [
    ['textAlign', 'text-align', ['left', 'center', 'right', 'justify']],
    ['childrenViewType', 'children-view-type', ['bullet', 'numbered', 'document']],
  ] as const) {
    const value = patch[input];
    if (value !== undefined) {
      if (!(choices as readonly string[]).includes(value)) throw new AdapterError('INVALID_ARGUMENT', `Invalid ${input}.`);
      result[output] = value;
    }
  }
  return result;
}
const fields = ':block/uid :node/title :block/string :block/order :block/open :block/heading :block/text-align :block/children-view-type :create/time :edit/time {:block/page [:block/uid]} {:block/parents [:block/uid]} {:block/refs [:block/uid]}';
export function pattern(depth = 0): string {
  integer(depth, 'depth', 0, 20);
  return `[${fields} {:block/children ${depth ? pattern(depth - 1) : '[:block/uid :block/order]'}}]`;
}
export function normalize(raw: any, depth = 20): Entity | null {
  if (!raw || typeof raw !== 'object') return null;
  const get = (key: string) => raw[`:${key}`] ?? raw[key];
  const uid = get('block/uid');
  if (typeof uid !== 'string') return null;
  const uids = (key: string) => (get(key) ?? []).map((x: any) => x[':block/uid'] ?? x['block/uid']).filter((x: unknown) => typeof x === 'string');
  const title = get('node/title');
  return {
    uid, kind: typeof title === 'string' ? 'page' : 'block',
    title, text: get('block/string'), order: get('block/order'), open: get('block/open'),
    heading: get('block/heading'), textAlign: get('block/text-align'), childrenViewType: get('block/children-view-type'),
    pageUid: get('block/page')?.[':block/uid'] ?? get('block/page')?.['block/uid'],
    parentUids: uids('block/parents'), referenceUids: uids('block/refs'),
    createdAt: get('create/time'), editedAt: get('edit/time'),
    childUids: [...(get('block/children') ?? [])].sort((a: any,b: any) => (a[':block/order'] ?? a['block/order'] ?? 0) - (b[':block/order'] ?? b['block/order'] ?? 0)).map((x: any) => x[':block/uid'] ?? x['block/uid']).filter((x: unknown) => typeof x === 'string'),
    childrenLoaded: depth > 0,
    children: depth > 0 ? (get('block/children') ?? []).map((child: unknown) => normalize(child, depth - 1)).filter(Boolean)
      .sort((a: Entity, b: Entity) => (a.order ?? 0) - (b.order ?? 0) || a.uid.localeCompare(b.uid)) : [],
    attributes: clone(raw),
  };
}

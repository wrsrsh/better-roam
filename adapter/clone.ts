// Safari 15.0 (macOS 12.0) predates structuredClone. The adapter handles data,
// never DOM nodes or functions; preserve Dates used by Roam's daily-note helpers.
export function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  const seen = new WeakMap<object, unknown>();
  const copy = (item: any): any => {
    if (item === null || typeof item !== 'object') return item;
    if (item instanceof Date) return new Date(item.getTime());
    if (seen.has(item)) return seen.get(item);
    const result: any = Array.isArray(item) ? [] : Object.create(null);
    seen.set(item, result);
    for (const key of Object.keys(item)) Object.defineProperty(result, key, {
      value: copy(item[key]), enumerable: true, writable: true, configurable: true,
    });
    return result;
  };
  return copy(value);
}

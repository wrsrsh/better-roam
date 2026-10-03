# Roam API adapter

A renderer-independent layer for a custom Roam editor. It exposes structured
pages and blocks, isolates graph sessions, serializes writes, and makes failures
explicit. The Tauri build injects it into the authenticated Roam webview; it does
not read graph contents or build a search index until called.

The visible app is still Roam. This is the data boundary for a future interface,
not a completed replacement editor or synchronization engine.

## Use from the Roam webview

```js
const response = await window.__roamDesktopAPI.request({
  id: 'read-1',
  method: 'getPage',
  args: [{title: 'Projects'}, {depth: 2}]
});
if (response.ok) {
  const {value: page, observedAt, source} = response.value;
} else {
  // Stable error code; messages omit private upstream payloads.
  const {code, outcome} = response.error;
}
```

The host can await `request` using WebKit's asynchronous JavaScript evaluation.
There is no new native IPC permission, socket, token store, or exposed filesystem
access. A separate frontend window still needs a host-owned request/reply bridge;
this module does not make cross-window access automatic.

TypeScript consumers can import `RoamAdapter` and the types from `adapter/index.ts`.
The bundled ESM library is generated at `adapter/dist/index.mjs`.

## API surface

| Area | Methods |
| --- | --- |
| Lifecycle | `status`, `invalidate`, `dispose` |
| Structured reads | `getEntity`, `getPage`, `getBlock`, `getChildren` |
| Discovery | `listPages`, `getBacklinks`, `query`, `dailyNote` |
| Page writes | `createPage`, `ensurePage`, `renamePage`, `deletePage` |
| Block writes | `createBlock`, `updateBlock`, `moveBlock`, `deleteBlock` |
| Composition | `importMarkdown`, `batch`, `undo`, `redo` |
| Local search | `refreshSearch`, `search` |
| Observations | `watch`, `unwatch` |
| Original UI | `openOriginal` |

See method signatures in `adapter.ts` and the exported domain types in `types.ts`.
The JSON dispatcher allows the listed methods except `dispose`, which belongs to
the host lifecycle. It never resolves arbitrary Roam API paths supplied by callers.

Entities keep UID, kind, title/text, ordered children, child UIDs, parent UIDs,
reference UIDs, page UID, timestamps, and display properties. `childrenLoaded`
distinguishes unrequested descendants from an empty child list. Reads default to
zero child depth, except pages (two levels). Maximum requested depth is 20.
Returned attributes are retained; writes patch specified fields rather than
round-tripping the entire entity. Roam markup stays intact in block text.

`dailyNote('2026-10-03')` resolves a local calendar date to Roam's title and UID;
it does not create the page. `ensurePage` reuses an existing exact title or creates
one. To start writing immediately, create the page, create an empty child block,
and focus that UID in the new editor. These are separate operations, not an
atomic transaction.

## Writes and reconciliation

```js
await adapter.updateBlock('block-uid',
  {text: 'Revised text', heading: 2},
  {expectedText: 'The draft’s original text'}
);
```

The optional expected text catches an already-observed conflict. It is not an
atomic compare-and-swap: another client can race the subsequent write. The caller
owns the draft and must retain it on conflict, timeout, or failure.

All writes from one adapter serialize. A timed-out write holds the queue until
its underlying Roam call settles; the adapter cannot cancel that call. A queued
write that times out before starting never executes later. Reinitializing an
adapter to bypass a stuck queue is unsafe without checking the graph first.

Receipts mean `applied-in-client`; `serverSynced` is always `unknown`. No write
retries occur automatically. A timeout after starting reports an unknown outcome.
Operations are not exactly-once across crashes, adapters, or other Roam clients.
`ensurePage` avoids duplicate creation within this adapter, not concurrent
creation by other clients. Page rename refuses implicit merges. Delete includes
Roam's descendant deletion behavior and is an explicit caller action.

`batch` runs writes sequentially and stops at the first error. It returns completed
receipts and the failed index. It is not atomic, does not roll back, and can
interleave with separately submitted writes. Do not replay the complete batch.
Undo/redo address Roam's shared client history, not an independent editor history.

## Cache and search

The entity cache is bounded, in memory, and short-lived (one second by default).
Local writes and subscribed changes invalidate it. Returned objects are copies.
Scope changes clear both cached entities and search data; late results from a
previous graph/account are rejected. Other-client edits outside watched entities
can remain cached until the TTL expires. Use `fresh: true` when necessary.

`refreshSearch` explicitly reads page titles and block strings into a local
snapshot. `search` performs no API call, using trigram postings for substring
candidates and fuzzy matching over page titles. Results report the index timestamp
and staleness. The caller decides when to rebuild; there is no implicit whole-graph
polling. Very short queries scan more candidates. Initial indexing and Datalog
execution still run in the Roam JS environment and can block it on a large graph;
timeouts cannot preempt synchronous JavaScript. Benchmark before choosing a worker
or native SQLite FTS implementation. There is no disk cache or offline write queue.

## Subscriptions

`watch(uid, depth)` returns an ID; `unwatch(id)` removes only that subscription's
callback. Scope changes and disposal clean up owned watches. Registration timeouts
also clean up registrations that finish late. Callback exceptions cannot escape
into Roam's transaction processing. The browser bundle emits
`roam-desktop:entity-changed` with scope, UID, normalized entity and observation time.
Delete observations carry a null entity. Hosts should subscribe before reading to
avoid a read-then-subscribe gap, and refresh after `STALE_READ`.

## Official Roam tools integration

The primary compatibility reference is Roam's own
[roam-tools](https://github.com/Roam-Research/roam-tools), especially its structured
write payloads, navigation calls, and explicit unsuccessful-delete reports.
The in-webview transport feature-detects namespaced methods and supports older
CRUD/query aliases. It checks both the route and `roamAlphaAPI.graph.name` before
allowing work, preventing calls against a graph still being replaced.

`createActionClientTransport(client, scope, methods)` accepts the official local
client's structural `call(action, args)` interface. Its authentication, discovery,
and protocol-version handling remain in the official SDK. Provide a known
capability list and a separate adapter per authorized graph/account. That bridge
does not support callback subscriptions or automatic session-change detection.
Dispose it when the credential identity changes. The official SDK is not bundled
or configured by this app; the adapter integration point is tested with fixtures.

DOM-dependent extension renderers, files, arbitrary extension execution, graph
administration, and remote durability tracking are not abstracted yet. Expose
those deliberately after their API contracts and permission requirements are
validated; the original Roam interface remains the fallback.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests cover DataScript query execution, normalization, graph/account changes,
conflicts, serialized writes, uncertain outcomes, partial batches, cache isolation,
search, watch lifecycle, and transport compatibility. The DataScript fixture adapts
keyword attributes to its JS interface's string attributes. These tests do not
establish compatibility with every Roam build, live permissions, or server sync.
No automated mutation tests run against a personal graph.

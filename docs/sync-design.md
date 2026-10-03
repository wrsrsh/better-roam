# Custom UI and synchronization

Design decision, not a shipped sync engine. The current app still renders Roam's
own interface and leaves graph persistence to Roam.

## Applying Zero's model

[Zero](https://zero.rocicorp.dev/docs/mutators) uses optimistic client mutations
followed by reconciliation with an authoritative backend. It is not a drop-in
CRDT. Its server integration requires control of the database and mutation
endpoint, which this wrapper does not have for Roam.

For a future custom interface, use this boundary:

```text
Custom UI → local observed state + pending edits → typed Roam API adapter
                         ↑                              ↓
                 observations / rereads ← authenticated Roam webview
                                                        ↓
                                              Roam persistence and sync
```

The hidden webview remains the authenticated graph engine. Do not write to its
private IndexedDB snapshots or transaction logs. Do not add a second network
sync engine alongside Roam.

## State and operations

- Key pages and blocks by Roam UID, scoped to the current account and graph.
- Keep observed API state separate from optimistic edits and unsent drafts.
- Express edits as commands such as update-block, create-block, and move-block.
  Give each local command an ID and retain its base value and local revision.
- Render pending edits immediately. Serialize dependent operations per graph.
- Reconcile using API observations and rereads. Associate asynchronous reads
  with a generation so an older response cannot replace a newer observation.
  Reapply pending edits over observed state without discarding newer drafts.
- Treat API completion as applied in the Roam client, not proof of server sync.
  Do not display a server-synced status without an authoritative signal.
- On an error or ambiguous completion, retain the draft and reread state. Do not
  blindly retry creates or moves: local IDs alone do not guarantee exactly-once
  execution in Roam after a crash.

## Concurrent edits

Stable identifiers and explicit operations are useful distributed-state
principles, but they do not make whole-string block updates conflict-free.
Before submitting a draft, compare its base with the latest observed block.
If the block changed remotely, preserve both versions and ask the user to resolve
the conflict. A reread is not an atomic compare-and-swap; another writer may
still race the subsequent write. State that limitation explicitly.

A Yjs/Automerge document owned only by this app would lose its merge metadata
when projected into ordinary Roam strings. True collaborative text CRDTs require
every writer to participate in a shared protocol. Revisit that only if we own the
backend and clients, or Roam exposes a compatible protocol.

## Cold starts and offline behavior

A future local cache can show previously read pages before Roam finishes loading.
Store a versioned, graph/account-scoped read model with observation timestamps;
make cached state visibly stale until refreshed. Keep it separate from Roam's
storage and invalidate it on account changes. Private graph content should stay
local and must not enter logs, repository files, or release assets.

Start with read-only cached views. Keep offline edits as recoverable drafts,
not automatically replayed mutations. Current Zero itself supports cached
offline reads but [does not support offline writes](https://zero.rocicorp.dev/docs/connection).
It does not supply an offline-write guarantee for this wrapper.

## Implementation order and acceptance cases

1. Build a read-only API adapter and custom page/search views; compare results
   with the same graph in Roam.
2. Add the local read cache; test cold start, graph switching, logout, and schema
   migration without leaking data between graphs or accounts.
3. Add connected optimistic block edits. Test delayed and out-of-order reads,
   API failure, a newer local draft, concurrent remote edits, and permission loss.
4. Add create/move/delete only after testing dependency ordering, deletion during
   an edit, and crash recovery without duplicate blocks or lost drafts.

No stage requires accessing Firebase credentials or reverse engineering Roam's
private wire protocol. Use the supported frontend API inside the existing
authenticated client. A standalone client is a separate project; the official
[backend SDKs](https://github.com/Roam-Research/backend-sdks) are another integration
option, not a replacement for the frontend client's synchronization guarantees.

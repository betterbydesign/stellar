# M1-06 history backend and controls handoff

Scope: runner journal-backed undo/redo, web broker/API, contracts display metadata and capability IDs, and the standalone history toolbar. The canvas agent integrates the toolbar and blocks navigation or inspector changes while the history control reports an active/pending operation. The coordinator owns browser evidence, portable build proof, root verification wiring, and final M1-06 acceptance.

The toolbar contract is `HistoryControls({ projectId, sessionId, sourceRevision, previewGeneration, sessionReady, onMutationStart, onOperationStateChange, onReceipt })`. `onMutationStart` may return a promise and may return false to preserve an inspector draft. `onOperationStateChange` reports an active or unresolved history operation; keep the toolbar mounted while a session exists, including preview failure, so **Check save** remains available.

Runner calls `historyCommand` with `HistoryCommandSchema` through authenticated `POST /api/projects/:projectId/sessions/:sessionId/history`. A response uses `ApplyChangeResponseSchema` and an `undo` or `redo` receipt. Lost responses reconcile via the existing request-outcome route. History GET includes optional display metadata and nullable authoritative `undoEntryId` / `redoEntryId` pointers. The old history response remains protocol-compatible.

Scoped verification: contracts tests, runner tests with real isolated Astro previews, web broker and pure UI tests, typechecks and lints. The real runner tests cover multi-file LIFO, shared token impact, branch invalidation, external drift, duplicate IDs, 21 operations across restart, and interrupted undo before and after replacement. Integrated browser, root scripts/CI, and portable fixture build remain coordinator work.

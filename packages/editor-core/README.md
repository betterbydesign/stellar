# @stellar/editor-core

Pure, bounded source analysis for the M1 Astro editor fixture. The package reads runner-supplied bytes, parses authored Astro nodes and allowlisted CSS, returns revision-scoped source targets, and prepares one guarded CSS declaration patch at a time. It performs no filesystem access or process spawning. The runner owns project registration, authorization, revision persistence, atomic writes, receipts, and history.

```ts
import { createSourceModel, prepareSourceChange } from "@stellar/editor-core";

const model = await createSourceModel({
  snapshot, // Record<projectRelativePath, Uint8Array>
  manifest, projectId, sessionId, requestId, projectRevision, pageId,
});
const result = await prepareSourceChange({ snapshot, manifest, model, request });
```

The snapshot must include the manifest's allowed CSS files, page Astro files, and referenced component/call-site Astro files. The manifest and source revision are validated at runtime. Each element target's `targetId` is also its revision-scoped preview `sourceKey`; `resolveSourceSelection` checks the key and authored anchor against the current model. The preview bridge must separately bind runtime occurrence and frame context. Repeated component instances in M1 remain read-only.

`prepareSourceChange` returns the shared `PrepareChangeResponse`: `ready` with a `ChangeProposal`, `unchanged` for a no-op, or `refused` with a stable contract error. It recomputes the model from the supplied bytes before preparing a patch, so changed source with an old target is refused. Only approved base/mobile local declarations and concrete base token leaves are editable. Missing or duplicate owners, dynamic source, invalid aliases, token scope collisions, and values outside manifest bounds are refused. Token impact is the manifest's declared fixture coverage, not a global dependency analysis.

`applySourcePatch(bytes, patch)` is an in-memory helper that checks the full-file SHA-256 and exact old byte span before returning new bytes. `createInversePatch(patch, appliedBytes)` returns the guarded reverse span only when reversing it reconstructs the original full-file digest. The runner must independently check the current project revision, file allowlist, file bytes and authorization at the moment of its write. An insertion that cannot be proven to produce a distinct CSS declaration, such as adding a declaration after an unterminated prior declaration, is refused.

Astro locations use `@astrojs/compiler` 4.0.0; CSS locations use PostCSS 8.5.28. This implementation is original Stellar code. No Stacki source was copied.

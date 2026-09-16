# Reviewed blueprint projects

M1-07 adds a single local Astro blueprint to the existing Projects and Studio workflow. The blueprint records its identity and version, renderer, design system, editing capabilities, and reviewed source files. This catalog is not a remote template marketplace.

The authenticated web broker exposes the catalog and accepts a strict named creation request. Origin and CSRF checks apply before the broker forwards creation to the loopback runner. The runner validates the operator and request again. Display names never select a source path or executable template.

The registry owns project identity and source-copy registration. A persisted request identity makes retries return the same project. Each project gets its own source and history metadata. Existing `project-a` and `project-b` identities and saved copies remain in place during additive migration.

Creation registers a workspace; preview startup remains a separate Studio operation. A saved project can therefore remain available even when its preview fails to start. The existing source editing and history boundaries apply to newly created projects.

The original reviewed source is unchanged by edits. A created project is an ordinary Astro site and can build independently after Stellar stops. Dependency installation and remote source execution are not part of project creation.

## Integration ownership

The M1-07 server changes affect imports and the Runner class's project dispatch and workspace initialization. Launcher lifecycle, child supervision, lease handling and the server entrypoint belong to the originating task. Preserve both sets of disjoint changes when integrating.

The originating task reported its lifecycle fix separately in `launcher.mjs`, new `managed-child.mjs`, `lease.ts` (`RunnerInUseError` only), new `startup-error.ts`, new `lifecycle.test.ts`, and the `server.ts` startup-error import plus `main()`/entrypoint. None of those lifecycle changes are included in this feature branch. The only expected code overlap is separate imports and disjoint sections within `server.ts`.

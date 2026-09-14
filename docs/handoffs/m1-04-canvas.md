# M1-04 canvas and selection handoff

M1-04 lives on `codex/m1-04-canvas` as local commits `7352225`, `703902a`, `9b48d8b` and `cfc67f9`, plus this final documentation follow-up. It owns `/projects`, `/projects/{projectId}/studio`, the root redirect, Studio state and CSS, the preview bridge, and the trusted Astro development integration. The coordinator integrates these with separately owned inspector, history and runner-origin plumbing. No push or deployment is part of this handoff.

## What works

- Projects uses the authenticated runner list for the two registered working copies and shows connection, empty and retry states. Opening a project starts or rejoins its real runner session and loads Home/Contact from the runner.
- Studio keeps one active page/frame, 390/768/1440 presets, integer custom width 320–1920, Fit/100% view, inspect/interact modes, a source-target list and a contextual inspector slot. Its own layout collapses panels in a narrow browser while the website viewport remains explicit.
- The iframe reports a route-only hello, receives the current server model's anchor-to-key map from the exact app origin, and reports ready/selection/geometry/clear/diagnostic envelopes. The shell validates exact preview origin, iframe window, project, session, generation, frame, page and revision. It resolves a target only against the current server model. A frame message never calls the write API.
- The injected script marks only exact DOM elements bearing manifest anchors, draws layout-neutral hover/selection outlines inside the frame, reports computed CSS values for display only, intercepts clicks/submits in Inspect, and leaves normal navigation active in Interact. Duplicate IDs, unmarked descendants and unknown routes cannot become editable selections.
- Project/page/generation/revision changes immediately lock old editable state. A saved receipt can be reconciled after a session restart; Studio refreshes from the current authenticated session and never treats the old receipt's session ID as a capability. History uncertainty pauses inspector edits and frame interaction. A reachable Refresh preview action handles a lost iframe load without restarting the runner.

## Fixture mapping boundaries

The current source model supplies revision-scoped opaque `targetId` values. The preview script maps these manifest anchors to exact rendered DOM IDs. Home's `home-hero-title`, `home-hero-accent`, `home-hero-actions` and `home-primary-cta`, plus Contact's `contact-panel-title` and `contact-primary-cta`, have supported page-source targets. A target's actual editable properties still come from the source model; having an ID alone does not make every CSS property editable. Home's `home-feature-clarity` and `home-feature-rhythm` and Contact's `contact-method-email` and `contact-method-visit` point into repeated component definitions and remain read-only. `home-process-steps` is read-only dynamic source. Other DOM elements are unmapped and show a diagnostic when clicked. An unmarked child does not silently select an editable parent; the target list provides an explicit parent selection action.

## Verification to date

- Scoped Studio lint, five frame-validator tests, the integration factory test, JavaScript syntax checks, docs checks, and diff whitespace checks passed in the M1-04 worktree.
- Pinned Astro 7.3.2 launched with the explicit editor integration: Home returned HTTP 200 and contained the development bridge bound to `http://127.0.0.1:3210`. A separate ordinary Astro dev launch returned HTTP 200 and contained no editor bridge/protocol/markers. A clean fixture build generated both routes and a recursive scan of `dist` found none of those identifiers.
- The standalone web typecheck before integration reported only missing separately owned Inspector and HistoryControls imports. The coordinator owns the combined typecheck and browser acceptance. The first combined browser run exercised both project cards, four widths, selection, base/mobile style edits, reset, token edit, undo/redo, Contact navigation, reload, runner restart and independent fixture build. A stored-width reload exposed React hydration error #418; the follow-up renders deterministic defaults and restores sessionStorage only after hydration. The expanded browser console rerun is pending the coordinator's result.

## Integration notes

The runner worker must pass its validated exact local app origin to `stellarEditorIntegration({ appOrigin })`. Without it the integration intentionally injects nothing, even in development. The new `@stellar/astro-editor-integration` npm workspace needs the coordinator's root lockfile/scripts update. The shell imports `features/inspector/Inspector.tsx` and `features/history/HistoryControls.tsx` with the agreed prop seams. M1-05 owns style controls and receipt UI; M1-06 owns history behavior and the final full workflow evidence. The source engine, fixture and write broker remain outside M1-04 ownership.

The remaining review gates are the coordinator's expanded browser console, stale-frame/security interactions, production build and full repository verification. The bounded local fixture proof does not implement arbitrary Astro import, HTML editing, hosted isolation, structural drag-and-drop, or deployment.

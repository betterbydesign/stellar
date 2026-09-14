# M1 editor browser evidence

Final run: September 14, 2026. Chromium 153.0.8010.12. Production Next application and actual local Astro runner; temporary working copies, no company accounts or repositories.

- [Workflow video](workflow.webm)
- [Project dashboard](projects-dashboard.png)
- [Desktop Studio](studio-1440.png)
- [390 px website](studio-390.png)
- [Narrow Studio inspector](studio-narrow-inspector.png)
- [Saved source with unavailable preview](saved-source-preview-unavailable.png)
- [Independent edited site](independent-site-build.png)
- [Source changes and durable receipts](source-changes.json)
- [Machine-readable result and source fingerprint](result.json)
- [Complete root verification log](verification.log)

The result records 390/768/1024/1440 website widths, 1600/390 Studio windows, zero browser exceptions, independent source/seed isolation and a successful ordinary build after Stellar stopped. It also records failed compilation/retry, invalid input, rapid duplicate Apply, keyboard and browser Back draft decisions, Interact links/Escape, lost Apply across reload, a committed Undo followed by a 503/lost lookup and reload, retained save during failed preview, and stale Apply/Undo rejection.

The source fingerprint covers application/package/fixture/scripts/test source and package locks; the base commit identifies the checkout before the remaining integration files were committed. Documentation/evidence commits do not change that fingerprint. The startup measurement includes service launch and the project B failure/retry scenario before opening A. Apply timings measure dispatch through the current-frame handshake; computed CSS values were independently asserted and these figures are not production performance guarantees.

The coordinator visually inspected the dashboard and desktop/narrow Studio screenshots. This is local implementation evidence, not user design approval or a remote CI result. See the [integration review](../../../docs/handoffs/m1-editor-review.md).

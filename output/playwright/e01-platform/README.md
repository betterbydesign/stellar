# E01 browser evidence

Date: 2026-09-16. All servers used dynamically assigned loopback ports in the task worktree. No existing service or saved-checkout data was used.

## Built application, unconfigured providers

- `setup-1440.png` and `setup-390.png`: real production Next setup page at desktop/mobile widths. Visually inspected; no clipped content.
- `result.json`: actual HTTP assertions against the built app. Entry pages redirect to platform mode at request time; missing-provider auth/platform routes and local privileged routes return unavailable.
- Browser console had only the pre-existing missing-favicon 404; no setup-page runtime exception.

## Offline component fixture, mocked HTTP

- `offline-recovered-project.png`: the actual project dashboard component, bundled in a temporary fixture that replaces HTTP with synthetic responses. First create persists to fixture session storage and simulates a lost response. Reload preserves original request/name and discovers the synthetic record. Retrying returns the same record and clears the pending intent; observed project count was exactly one.
- `offline-disconnected-project.png`: actual project details component renders the project name and disconnected source state; Open Studio stays disabled.
- Viewer-role fixture hides Create project. At 390px no horizontal overflow was observed.

The fixture visibly labels itself as offline. It does not authenticate a user, call WorkOS, deploy Convex, prove remote persistence or connect a runner. It supplements, and does not replace, the separate convex-test handler tests and pending live acceptance. Temporary fixture code/server and browser session were removed/stopped after capture.

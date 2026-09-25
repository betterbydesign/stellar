# Stellar local project runner

This package runs the two trusted Astro fixture working copies for M1-02. It is a local development adapter, not a sandbox for uploaded or hostile repositories. The separate process owns Astro previews, source revisions, proposal storage and the sole supported CSS write path. The Next.js server brokers authenticated requests; rendered previews receive no runner secret or source-write authority.

## Start and connect

From the repository root, install root and fixture packages using the locked commands, then build and launch:

```sh
npm ci
npm run fixture:install
npm run build
npm run launch --workspace=@stellar/runner
```

The launcher starts the runner at `http://127.0.0.1:4310` and Next.js at `http://127.0.0.1:3210`. It prints a one-time `http://127.0.0.1:3210/connect#<nonce>` URL. Open it on the same machine to establish the developer operator session. The nonce stays in the URL fragment until the app's connection page sends it to its own bootstrap endpoint. The launcher generates a fresh nonce and runner bearer secret on every run, while `.stellar-local/operator-id` keeps the same operator identity for authorized request lookup after restart. Do not share the URL or expose these loopback ports through a tunnel.

The runner itself can be started with `node apps/runner/dist/server.js` when these server-side variables are set: `STELLAR_LOCAL_MODE=1`, `STELLAR_RUNNER_URL=http://127.0.0.1:<port>`, `STELLAR_RUNNER_SECRET` (at least 32 characters), `STELLAR_OPERATOR_ID`, `STELLAR_FIXTURE_SEED`, `STELLAR_DATA_DIR`, `STELLAR_APP_ORIGIN=http://127.0.0.1:<port>`, and `STELLAR_PREVIEW_HOST=localhost`. The ordinary launcher supplies them. The runner refuses non-loopback binding and browser-origin requests. Its `POST /rpc` accepts only a bearer-authenticated broker with the stable operator ID.

For the account-enabled first-use flow, start the launcher with `STELLAR_CONNECTED_MODE=1`. It keeps the runner in local mode, starts the web process in connected mode, and prints a one-time `/platform/setup#<nonce>` URL. Provider and connection-attestation credentials stay in the web process and are not passed to the runner. The runner stores its stable installation identity, expiring one-use connection challenges, revocable tenant connections, and exact account-project-to-registry bindings in `account-connection.json` under the local data directory. Every newly confirmed challenge rotates the tenant connection capability, which also recovers when a prior backend revocation could not reach the runner. An exact confirmation retry returns its original result, and a consumed challenge cannot restore a revoked connection. Reconnecting retains an existing exact project binding and never matches by project name.

## Working copies and recovery

First launch copies the reviewed fixture files into `.stellar-local/copies/a` and `.stellar-local/copies/b`. IDs remain `project-a`/`project-b`; each copy has its own source and metadata. The seed fixture is never edited. Dependencies must already be installed under `fixtures/astro-style-lab/node_modules`; each copy links to that pinned install. The runner compares the copied package, lock, Astro config and Node version files with the seed before executing. It refuses a changed manifest's editing rules, while whitespace-only manifest changes still advance the source revision. It never runs npm install on open.

`.stellar-local/metadata/<copy>/revision.json` records the durable source revision and source fingerprint. The fingerprint covers the manifest and bounded reviewed source tree, including layout files. `.stellar-local/metadata/<copy>/operations/*.json` is the single operation ledger for prepared proposals, write-ahead intents, preimages, postimages and receipts; M1-06 can build inverse/redo operations from it. A per-project queue serializes supported writes, and a data-directory lease prevents a second runner from using the same copies. A 400 ms source watcher and every source operation detect external byte changes. Metadata, dependencies and build output are separate from source.

Apply verifies the stored proposal, project/session/revision scope, allowed CSS file, full expected file digest and exact patch bytes. It persists intent and both images before replacing one file atomically, then persists the new revision and receipt. Matching postimage bytes recover the original receipt after interruption. Matching preimage bytes mean no edit happened; after the old session ends, request lookup reports `unchanged` and a new proposal is required. Third-state bytes report a conflict. An outstanding intent blocks other writes until reconciled. A no-op writes no source file or history entry. Ordinary filesystem rename cannot exclude an uncooperative external writer during the final check/rename interval; the runner retains the journal and detects observed races, but this local adapter does not claim a transaction with arbitrary external editors.

The registry and operation data survive stop, browser restart and runner restart. Close stops the owned Astro process group and source watcher. Reopen keeps source bytes and revision while rotating session and preview generation. A process restart also invalidates old session write capabilities; the same stable operator can look up earlier request outcomes in a new session. To reset deliberately, stop the launcher first and separately remove `.stellar-local`; ordinary shutdown and rollback never delete copies or journals.

Account-enabled commands use `dispatchAccountProject`, which checks the active installation connection and the complete identity-namespace, tenant, account-project and registry-project mapping before invoking the same guarded workspace methods. Caller-supplied names and paths never select source. The web broker remains responsible for checking the current signed-in tenant and project edit grant before every call.

## Lifecycle and preview boundary

| State | Meaning | Recovery |
| --- | --- | --- |
| `registered` | Fixed working copy exists but no session has opened. | Open it. |
| `starting` | Astro worker is launching; no preview is offered yet. | Poll session status. |
| `ready` | Both fixture routes returned successful HTML from this worker. | Edit or close. |
| `failed` | Dependencies, port, compile, timeout or process failure. | Fix the reported local condition, then retry. |
| `stopped` | Owned process and watcher stopped; source preserved. | Reopen. |
| `reconnecting` | Reserved contract state for a future broker reconnection. | Reopen if needed. |

Previews bind `127.0.0.1` but are addressed as `http://localhost:<allocated-port>/`, keeping their hostname and cookies apart from the app. Astro starts through its pinned programmatic API in a dedicated child with fixed options and a minimal environment. The worker denies Vite `/@fs/` access outside the working copy and pinned dependency root. The optional trusted integration seam is `apps/runner/src/preview-integration/index.mjs`: when M1-04 supplies that module, the worker adds its default Astro integration in memory and allows only that integration directory in Vite's filesystem list; ordinary project config is not modified. Runner log tails are bounded and paths are redacted before internal diagnosis; browser status messages come from fixed safe strings.

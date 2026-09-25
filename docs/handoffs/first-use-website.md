# First-use website handoff

Branch: `codex/first-use-website`, based on integrated foundation `c93c803`. Main and saved checkout were not merged, reset or synchronized. No credentials were copied; no services or databases were deployed.

## Delivered

The user requested implementation with agents. SOL/high agents implemented the runner connection/binding, Convex pairing/provisioning and account UI, followed by integration review. Root implemented the connected HTTP gate and Studio integration. See the [PRD](../prds/first-use-website.md), [ExecPlan](../exec-plans/first-use-website.md), [architecture](../architecture/connected-computer.md) and [verification](../evidence/first-use-website/connected-verification.md).

The account-enabled server now connects to the computer's runner through explicit local control and account confirmation. It creates source from a reviewed template, binds the account project to the exact registry entry, opens Studio, saves through existing guarded commands and reopens the same source. Metadata-only records such as Test can finish setup on their original ID. Failed/lost responses retain the operation and pinned template for retry; no source is attached by name. The local-only API gate remains closed in account mode.

Source/history remain on the computer. Current account/project grants and exact backend/runner bindings are checked before every command. New confirmations rotate the tenant's active computer connection; disconnection blocks new account commands without deleting files. Ambiguous connection-store writes disable authority until restart reloads disk. Empty proposal UI remains hidden and provider execution remains disabled.

## Verification and remaining live gate

Full repository verification passed 227 tests, plus production build and original local/editor/projects/proposal regressions. The new connected browser acceptance proves brand-new account bootstrap, explicit pairing, real source creation, guarded save, runner restart/reopen, account return navigation, disconnect/reconnect, metadata completion after a lost response, and an independent edited-site build. Its identity is synthetic and its backend uses real functions inside `convex-test`; this is not live WorkOS/Convex evidence. Independent review found no remaining release-blocking defect in the supported same-computer environment.

Before live use, follow the [setup guide](../user-guide/platform-projects.md): securely configure the account-enabled local web server, deploy the updated Convex schema/functions, set a matching dedicated `STELLAR_CONNECTION_SECRET` on web and Convex, configure the exact `127.0.0.1` callback and run `npm run dev:connected`. Then sign in and validate the real Test record, session expiry, persistent cloud state and revocation. No secrets should be sent in chat. This task did not deploy or modify the existing configured checkout, so merely refreshing that old instance will not enable these changes.

Hosted relay, managed execution, automatic local-project import, account transfer and publishing remain outside this implementation. One active connection per tenant/computer is supported. WorkOS membership synchronization is still separate from Stellar grants. A request already authorized may finish while revocation is in flight.

## Integration and delivery

The first-slice commits `fa132dc` and `bbd0ab7` were pushed after explicit approval of `https://github.com/betterbydesign/stellar`. The connected continuation is committed locally as `3601a78`. Automatic approval review rejected publishing this new source/evidence payload twice, including after the earlier branch approval was retrieved from task history; the reviewer requires a new explicit user instruction identifying this payload and GitHub destination. No remote update occurred for this continuation. Merge/synchronize only with authorization for the saved checkout's then-current state. Preserve its `.vscode`, environment and `.stellar-local` source/history; do not reset or copy credentials automatically.

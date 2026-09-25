# Account websites on this computer

Stellar can connect an account website to real Astro files on the computer running Stellar. Start the connected launcher, confirm your account and computer, choose a reviewed template, then edit in Studio. Files and history stay on that computer.

## Development setup

Use a Stellar-owned WorkOS development application and Convex deployment. Enter secrets through local environment files or secure provider settings; do not put them in chat or Git. This task did not copy existing credentials, deploy the updated backend or change the saved development checkout.

In `apps/web/.env.local`, set `STELLAR_PLATFORM_MODE=1`, `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, a unique random `WORKOS_COOKIE_PASSWORD` of at least 32 characters, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://127.0.0.1:3210/auth/callback`. Keep `STELLAR_LOCAL_MODE` unset or zero. Set `STELLAR_CONNECTION_SECRET` to a separate securely generated random secret of at least 32 characters. Set the same connection secret and WorkOS client ID on the Stellar Convex deployment; do not reuse a provider API key. The WorkOS API key and cookie password belong only on the web server.

The updated Convex schema and functions must be deployed through the authorized development workflow before using connected editing. An older platform deployment lacks these functions. Configure the exact callback URL in WorkOS, `/auth/sign-in` as login entry and `/platform` on that origin as sign-out return. Use `127.0.0.1` consistently for the application; the separate `localhost` preview hostname is deliberate. For a different launcher app port, update the callback to that exact port. Public Next configuration requires a rebuild when changed in a production build.

From the repository root, install pinned dependencies with `npm ci` and `npm run fixture:install`, then run:

```sh
npm run dev:connected
```

The launcher supplies connected mode, starts the runner and account-enabled web server, and prints a one-time `/platform/setup#…` link. Keep the terminal open. Open that exact link on the same computer. Do not share it or tunnel these ports. Connected development uses `.next-connected`, separately from local-editor and ordinary web development output. Source remains in the launcher's `.stellar-local` directory unless an explicit data directory is configured.

## Connect, create and reopen

1. Sign in. A missing personal account is initialized automatically without restoring revoked access. Organization accounts need administrator-provisioned membership.
2. Open the launcher setup link. Choose **Connect this computer**, check the displayed account and installation, then **Confirm connection**. The offer expires after five minutes. A new confirmation replaces any previous connection for that organization/account on this computer.
3. Choose **Prepare a website**, enter a name and choose a reviewed template. Stellar saves a recoverable setup request before creating files. Studio opens after the exact source binding is acknowledged; the preview may still be starting.
4. For an existing metadata record such as Test, open it and choose **Finish website setup**. The original account record is retained. Files are never attached by matching a name.
5. Select a supported element and save a supported style change in Studio. A save receipt confirms source; the preview reports separately when that revision is visible.
6. Return to **Your websites** and reopen the same website. After stopping/restarting the launcher, use its new setup link to restore local control, then reopen. Source and history survive the restart.

**Disconnect this computer** blocks new account commands and leaves files/history intact. While the local operator session remains valid, a new explicit confirmation can reconnect. If the operator session expired or the launcher restarted, open the new launcher link. Only one active tenant connection is supported on a computer; reconnecting from another organization member replaces the old connection.

## Interrupted setup

If preparation times out, retain the tab and choose **Retry website preparation**. Its name/template stay locked so retry resumes the same source allocation. Allow session storage before sending a request. If a response is lost after preparation, retry returns the same website. A preparing account record can also resume its pinned operation. Do not clear browser storage or delete local state to resolve an ambiguous request.

If the one-use launcher link was consumed but its response/cookie was lost, restart the launcher for a fresh setup link. If sign-in expires, sign in again, then return to the pending page. A revoked project or account needs an administrator to restore legitimate access; retry cannot restore it. If the local service or backend is unavailable, resume when it is available. No failure screen means source was deleted.

Old metadata-creation receipts can still be recovered with **Recover saved request**; then finish source setup on that record. The separate [local editor](local-projects.md) remains usable without providers, but its websites are not automatically imported into an account.

## Current limits

This version runs the account-enabled app and source service on the same computer. Remote hosted editing, automatic local-project import, account transfer, invitations UI and publishing are not included. WorkOS organization revocation and Stellar membership remain separate until event synchronization exists. [Browser evidence](../evidence/first-use-website/connected-verification.md) proves real source editing with a synthetic identity; live login, cloud persistence, session expiry and revocation still require acceptance on the configured services.

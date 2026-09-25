# Account projects

Account projects let you save and reopen project names in your own Stellar account. This initial version keeps source workspaces disconnected. Use the local launcher to edit local source and history.

## Development setup

The implementation requires a Stellar-owned WorkOS development application and Convex deployment. No service is created by opening Stellar, and no credentials belong in chat or Git. Enter configuration in the local environment or the provider's secure configuration interface.

For the web app, use `apps/web/.env.local`: enable `STELLAR_PLATFORM_MODE=1`, set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, a unique random `WORKOS_COOKIE_PASSWORD` of at least 32 characters, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` ending in `/auth/callback`, and `NEXT_PUBLIC_CONVEX_URL`. The example file at the repository root lists the names. Keep `STELLAR_LOCAL_MODE` unset or zero. Use HTTPS for hosted origins; HTTP is accepted only for loopback development. Custom WorkOS API endpoint overrides are intentionally unsupported.

Configure the same callback URL in the WorkOS application, `/auth/sign-in` as the login entry and `/platform` on that same origin as sign-out return. Use one hostname consistently: `localhost` and `127.0.0.1` are different origins. Public Next configuration is bundled at build time, so rebuild when changing public provider values. Configure the same `WORKOS_CLIENT_ID` for Convex JWT verification; the WorkOS API key and cookie password belong only to the web server.

Deploying the Convex functions or provisioning either provider requires separately authorized development setup; neither occurred in this task. With that setup complete, run the web app on an available non-default development port, open `/platform` and sign in. [AuthKit setup documentation](https://github.com/workos/authkit-nextjs/blob/main/README.md) and [Convex WorkOS setup](https://docs.convex.dev/auth/authkit) describe provider-specific configuration.

## First use and existing websites

1. Sign in. Stellar sets up a missing personal account automatically. It never restores revoked access. Organization accounts still require an administrator-provisioned account and active membership.
2. Choose **Set up website editing** to read the computer prerequisite. This version does not yet connect account records to local website files, so it no longer offers ordinary metadata-only creation as a website-building action.
3. Existing records such as Test remain listed with **Setup incomplete**. Open one and choose **View setup steps**. Nothing is deleted or attached by name.

An unresolved creation request from the previous version can still be recovered with **Recover saved request**. This uses its original request identity and may recover a saved name; it does not prepare source files. Do not clear session storage to retry an ambiguous request. **Refresh projects** checks current access. Discarding a pending request does not delete any account record.

To create and edit a real local website now, follow [the local editor guide](local-projects.md) using the launcher's connection link. That website remains separate from your account record until authenticated account connection is implemented. The setup screen explains this distinction before promising a usable website.

If your session ends, sign in again. Missing configuration shows a setup screen. A backend outage exposes retry without claiming success. Source files and editing history remain on the computer that created them.

## Current limits

No remote runner pairing, automatic local-project import, hosted Studio, invitations UI or account-to-account transfer is provided. Organization grants are administered through owner-authorized backend functions after setup. WorkOS organization revocation and Stellar membership are separate until event synchronization is implemented. Live provider login, persistence, expiry and reconnect acceptance remain prerequisites listed in the [verification record](../evidence/e01-platform/verification.md).

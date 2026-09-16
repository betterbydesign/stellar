# Account projects

Account projects let you save and reopen project names in your own Stellar account. This initial version keeps source workspaces disconnected. Use the local launcher to edit local source and history.

## Development setup

The implementation requires a Stellar-owned WorkOS development application and Convex deployment. No service is created by opening Stellar, and no credentials belong in chat or Git. Enter configuration in the local environment or the provider's secure configuration interface.

For the web app, use `apps/web/.env.local`: enable `STELLAR_PLATFORM_MODE=1`, set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, a unique random `WORKOS_COOKIE_PASSWORD` of at least 32 characters, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` ending in `/auth/callback`, and `NEXT_PUBLIC_CONVEX_URL`. The example file at the repository root lists the names. Keep `STELLAR_LOCAL_MODE` unset or zero. Use HTTPS for hosted origins; HTTP is accepted only for loopback development. Custom WorkOS API endpoint overrides are intentionally unsupported.

Configure the same callback URL in the WorkOS application, `/auth/sign-in` as the login entry and `/platform` on that same origin as sign-out return. Use one hostname consistently: `localhost` and `127.0.0.1` are different origins. Public Next configuration is bundled at build time, so rebuild when changing public provider values. Configure the same `WORKOS_CLIENT_ID` for Convex JWT verification; the WorkOS API key and cookie password belong only to the web server.

Deploying the Convex functions or provisioning either provider requires separately authorized development setup; neither occurred in this task. With that setup complete, run the web app on an available non-default development port, open `/platform` and sign in. [AuthKit setup documentation](https://github.com/workos/authkit-nextjs/blob/main/README.md) and [Convex WorkOS setup](https://docs.convex.dev/auth/authkit) describe provider-specific configuration.

## Create and reopen

1. Sign in. A personal account can choose **Set up my workspace**. Organization accounts require an administrator-provisioned Stellar workspace and a matching active membership grant.
2. Enter a project name and choose **Create project**. This saves the named record; it does not create website files.
3. Select the project to reopen its details. **Workspace not connected** means Studio cannot edit source from this account view yet.

A lost connection retains the original creation request in the current tab. Choose **Retry creation** to recover the same result. Do not manually clear browser session storage to retry an ambiguous creation; that loses the request identity. **Refresh projects** retrieves current membership and visible projects. If an unresolved request needs to be abandoned, refresh and reconcile first, then use **Discard unresolved request** and acknowledge that a new request can create another project; existing records are not deleted. If access has changed, previously listed projects may no longer open.

If the session ends, sign in again. Missing configuration shows a setup screen. A backend outage shows a retry message without claiming that source or project creation succeeded. Source files and local editing history remain under the existing local workspace runner.

## Current limits

No remote runner pairing, automatic local-project import, hosted Studio, invitations UI or account-to-account transfer is provided. Organization grants are administered through owner-authorized backend functions after setup. WorkOS organization revocation and Stellar membership are separate until event synchronization is implemented. Live provider login, persistence, expiry and reconnect acceptance remain prerequisites listed in the [verification record](../evidence/e01-platform/verification.md).

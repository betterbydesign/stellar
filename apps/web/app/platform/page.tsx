import { inspectPlatformConfig } from "../../lib/platform/config";
import { readPlatformSession } from "../../lib/platform/session";
import { PlatformDashboard } from "../../features/platform/PlatformDashboard";
import { signOutAction } from "../auth/actions";

export const dynamic = "force-dynamic";
export default async function PlatformPage() {
  const config = inspectPlatformConfig();
  if (config.mode !== "ready") return <main className="shell">
    <header className="masthead"><span className="wordmark">Stellar<span aria-hidden="true">✳</span></span><span className="status">Platform setup</span></header>
    <section className="intro">
      <p className="eyebrow">Your project workspace</p><h1>Connect your account services.</h1>
      <p className="description">The platform needs its own identity and project storage connections before you can sign in. No account connection is active here.</p>
      <p className="description">{config.mode === "invalid" ? "The server configuration needs attention before sign-in can start." : config.mode === "disabled" ? "Account mode is not enabled for this instance." : "Development provider setup is still required."}</p>
      <p className="description">Existing local projects remain available through your local launcher’s connection link.</p>
    </section>
  </main>;
  const session = await readPlatformSession();
  return <main className="shell">
    <header className="masthead"><span className="wordmark">Stellar<span aria-hidden="true">✳</span></span>
      {session ? <form action={signOutAction}><button type="submit">Sign out</button></form> : <span className="status">Your workspace</span>}
    </header>
    <section className="intro"><p className="eyebrow">Independent by design</p><h1>Your projects.</h1>
      <p className="description">A home for your websites, with access tied to your account.</p>
      {!session && <p className="description"><a href="/auth/sign-in">Sign in to Stellar →</a></p>}
    </section>
    {session && <PlatformDashboard organizationId={session.identity.organizationId} />}
  </main>;
}

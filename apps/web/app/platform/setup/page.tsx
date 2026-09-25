import Link from "next/link";
import { ConnectionSetup } from "../../../features/platform/ConnectionSetup";
import { readPlatformSession } from "../../../lib/platform/session";

export const dynamic = "force-dynamic";

export default async function WebsiteSetupPage() {
  const session = await readPlatformSession();
  return <main className="shell">
    <header className="masthead"><span className="wordmark">Stellar<span aria-hidden="true">✳</span></span><Link href="/platform">Your account</Link></header>
    <section className="intro">
      <p className="eyebrow">Website setup</p>
      <h1>Connect this computer.</h1>
      <p className="description">Stellar keeps website source and edit history on the computer running the local service. Confirm the signed-in account and this installation before preparing any files.</p>
      <ConnectionSetup organizationId={session?.identity.organizationId ?? null} />
    </section>
  </main>;
}

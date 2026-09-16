import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { inspectPlatformConfig } from "../../lib/platform/config";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const platformReady = inspectPlatformConfig().mode === "ready";
  let initialAuth: Omit<UserInfo | NoUserInfo, "accessToken"> = { user: null };
  if (platformReady) {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    try {
      const auth = await withAuth();
      const clientAuth = { ...auth };
      delete clientAuth.accessToken;
      initialAuth = clientAuth;
    } catch {
      // This layout is outside its child error boundary. Preserve the cookie
      // and pending request while giving auth-service failures a safe retry.
      return <AuthKitProvider initialAuth={{ user: null }} onSessionExpired={false}>
        <main className="shell"><section className="intro">
          <p className="eyebrow">Connection interrupted</p><h1>Account service unavailable.</h1>
          <p className="description">Stellar could not load your account right now. Your saved projects and pending request have not been cleared.</p>
          <a href="/platform">Try again</a>
        </section></main>
      </AuthKitProvider>;
    }
  }

  return (
    <AuthKitProvider initialAuth={initialAuth} onSessionExpired={platformReady ? undefined : false}>
      {children}
    </AuthKitProvider>
  );
}

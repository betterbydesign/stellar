"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ConnectPage() {
  const [status, setStatus] = useState("Connecting to the local workspace…");
  const [connected, setConnected] = useState(false);
  const [nonce] = useState(() => typeof window === "undefined" ? "" : window.location.hash.slice(1));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, "", "/connect");
    const acceptSession = (result: { csrfToken?: string }) => {
      if (!result.csrfToken) throw new Error("Connection failed");
      window.sessionStorage.setItem("stellar.csrf", result.csrfToken);
      setStatus("Connected to the local workspace.");
      setConnected(true);
    };
    if (!nonce) {
      void fetch("/api/operator/session", { credentials: "same-origin" })
        .then(async (response) => {
          if (!response.ok) throw new Error("No active session");
          acceptSession(await response.json() as { csrfToken?: string });
        })
        .catch(() => setStatus("Open the connection link printed by the local launcher."));
      return;
    }
    void fetch("/api/operator/bootstrap", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Connection failed");
      const result = await response.json() as { csrfToken?: string };
      acceptSession(result);
    }).catch(() => setStatus("The connection link expired. Restart the local launcher and use its new link."));
  }, [nonce]);

  return <main className="shell">
    <header className="masthead">
      <span className="wordmark">Stellar<span aria-hidden="true">✳</span></span>
      <span className="status">Local developer mode</span>
    </header>
    <section className="intro">
      <p className="eyebrow">Local connection</p>
      <h1>Connect to Stellar</h1>
      <p className="description" role="status">{status}</p>
      <p className="description">This connection opens reviewed local fixture projects. Their code runs on this computer; this is not a hosted sandbox.</p>
      {connected && <p className="description"><Link href="/" style={{ color: "var(--accent)" }}>Open Stellar</Link></p>}
    </section>
  </main>;
}

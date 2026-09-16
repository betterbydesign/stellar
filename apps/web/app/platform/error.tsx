"use client";

export default function PlatformError({ reset }: { reset: () => void }) {
  return <main className="shell"><section className="intro">
    <p className="eyebrow">Connection interrupted</p><h1>Account service unavailable.</h1>
    <p className="description">Stellar could not load your account right now. Your saved projects and pending creation request have not been cleared.</p>
    <button type="button" onClick={reset}>Try again</button>
  </section></main>;
}

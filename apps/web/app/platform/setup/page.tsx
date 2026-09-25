import Link from "next/link";

export default function WebsiteSetupPage() {
  return <main className="shell">
    <header className="masthead"><span className="wordmark">Stellar<span aria-hidden="true">✳</span></span><Link href="/platform">Your account</Link></header>
    <section className="intro">
      <p className="eyebrow">Website setup</p>
      <h1>Edit on your computer.</h1>
      <p className="description">The local Stellar preview can create website files, open Studio, save edits and reopen them later. Keep Stellar running on the computer that stores those files.</p>
      <h2>Account connection is not available yet</h2>
      <p className="description">This version cannot connect an account website to your computer. Names already saved in your account remain safe, but their setup cannot finish yet. A local website is separate from those account records.</p>
      <h2>Use the local editor preview</h2>
      <ol className="description">
        <li>Use a computer with the Stellar development checkout and its dependencies installed. There is no desktop installer in this version.</li>
        <li>From that checkout, start the local editor with <code>npm run dev:local</code>.</li>
        <li>Open the connection link printed by Stellar. Use that exact address and keep the launcher running.</li>
        <li>Choose a website name and reviewed template. Stellar prepares the files and opens Studio.</li>
        <li>After saving, return to the website list to reopen the same website. Its files and edit history stay on that computer.</li>
      </ol>
      <p className="description">If the connection expires, restart your launcher and open its new connection link. Do not delete saved project folders or create a replacement website to fix a connection problem.</p>
      <p className="description"><Link href="/platform">Return to your account →</Link></p>
    </section>
  </main>;
}

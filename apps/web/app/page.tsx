const stages = [
  { number: "01", title: "Plan", description: "Turn a brief into a clear site structure." },
  { number: "02", title: "Design", description: "Shape responsive pages with a shared design system." },
  { number: "03", title: "Publish", description: "Review, release, and keep improving." },
];

export default function Home() {
  return (
    <main className="shell">
      <header className="masthead">
        <span className="wordmark">Stellar<span aria-hidden="true">✳</span></span>
        <span className="status">In development</span>
      </header>
      <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">A new space for websites</p>
        <h1 id="intro-title">From first idea<br />to a living website.</h1>
        <p className="description">A focused workspace for teams to plan, design, and maintain websites together.</p>
      </section>
      <ol className="stages" aria-label="Planned workflow">
        {stages.map((stage) => (
          <li key={stage.number}>
            <span className="stage-number" aria-hidden="true">{stage.number}</span>
            <h2>{stage.title}</h2>
            <p>{stage.description}</p>
          </li>
        ))}
      </ol>
      <footer>The foundation is ready. Project creation and the design studio are coming next.</footer>
    </main>
  );
}

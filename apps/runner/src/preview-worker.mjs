// This process owns exactly one trusted fixture's Astro server. The parent owns its process group.
import { pathToFileURL } from "node:url";
import path from "node:path";

const [root, astroEntrypoint, dependencyRoot, portText, integrationEntrypoint] = process.argv.slice(2);
const port = Number(portText);
let server;

try {
  const { dev } = await import(pathToFileURL(astroEntrypoint).href);
  const integration = integrationEntrypoint === "-" ? null : (await import(pathToFileURL(integrationEntrypoint).href)).default;
  server = await dev({
    root,
    configFile: "astro.config.mjs",
    server: { host: "127.0.0.1", port },
    integrations: integration ? [typeof integration === "function" ? integration() : integration] : [],
    vite: {
      server: {
        strictPort: true,
        fs: { strict: true, allow: [root, dependencyRoot, ...(integrationEntrypoint === "-" ? [] : [path.dirname(integrationEntrypoint)])],
          deny: [".stellar-local", ".env", ".env.*"] },
      },
    },
  });
  process.send?.({ type: "listening" });
} catch (error) {
  console.error(error);
  const code = error?.code === "EADDRINUSE" || /port .*already in use|EADDRINUSE/i.test(String(error?.message)) ? "PORT_BUSY" : "START_FAILED";
  if (process.send) process.send({ type: "failed", code }, () => process.exit(1));
  else process.exit(1);
}

async function stop() {
  try { await server?.stop(); } finally { process.exit(0); }
}
process.on("message", (message) => { if (message?.type === "stop") void stop(); });
process.on("disconnect", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
process.on("SIGINT", () => { void stop(); });

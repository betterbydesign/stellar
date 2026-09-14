import { readFileSync } from "node:fs";

// The runner supplies this integration only to its trusted local development worker.
// The command guard is still required: injectScript also affects builds if left unguarded.
const clientScript = readFileSync(new URL("./preview-client.js", import.meta.url), "utf8");

export function stellarEditorIntegration({ appOrigin } = {}) {
  let allowedOrigin = null;
  try {
    const url = new URL(appOrigin);
    if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port &&
      url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password) {
      allowedOrigin = url.origin;
    }
  } catch { /* absent or invalid origin leaves the preview ordinary */ }
  return {
    name: "stellar-editor-dev-preview",
    hooks: {
      "astro:config:setup"({ command, injectScript }) {
        if (command !== "dev" || !allowedOrigin) return;
        injectScript("head-inline", clientScript.replace('"__STELLAR_APP_ORIGIN__"', JSON.stringify(allowedOrigin)));
      },
    },
  };
}

export default stellarEditorIntegration;

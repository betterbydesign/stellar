import test from "node:test";
import assert from "node:assert/strict";
import { stellarEditorIntegration } from "../src/index.mjs";

test("only an explicit local app origin and Astro dev command inject the editor", () => {
  const scripts = [];
  const injectScript = (stage, code) => scripts.push({ stage, code });
  const options = { command: "dev", injectScript };
  stellarEditorIntegration().hooks["astro:config:setup"](options);
  stellarEditorIntegration({ appOrigin: "https://remote.example" }).hooks["astro:config:setup"](options);
  stellarEditorIntegration({ appOrigin: "http://127.0.0.1:3210" }).hooks["astro:config:setup"]({ ...options, command: "build" });
  assert.equal(scripts.length, 0);
  stellarEditorIntegration({ appOrigin: "http://127.0.0.1:3210" }).hooks["astro:config:setup"](options);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].stage, "head-inline");
  assert.match(scripts[0].code, /http:\/\/127\.0\.0\.1:3210/);
  assert.doesNotMatch(scripts[0].code, /__STELLAR_APP_ORIGIN__/);
});

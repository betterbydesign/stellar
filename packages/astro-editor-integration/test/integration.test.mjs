import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
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

test("same-preview navigation announces its new route without trusting a foreign parent", () => {
  const scripts = [];
  stellarEditorIntegration({ appOrigin: "http://127.0.0.1:3210" }).hooks["astro:config:setup"]({
    command: "dev", injectScript: (_stage, code) => scripts.push(code),
  });
  const run = (referrer) => {
    const messages = [];
    const parent = { postMessage: (message, targetOrigin) => messages.push({ message, targetOrigin }) };
    const window = { parent, location: { origin: "http://localhost:45678" }, addEventListener() {} };
    const document = { referrer, readyState: "complete", documentElement: {}, addEventListener() {} };
    vm.runInNewContext(scripts[0], {
      window, document, location: { pathname: "/contact/" }, URL,
      MutationObserver: class { observe() {} },
    });
    return messages;
  };
  for (const referrer of ["http://127.0.0.1:3210/projects/project-a/studio", "http://localhost:45678/"]) {
    assert.deepEqual(run(referrer).map(({ message, targetOrigin }) => ({ type: message.type, route: message.route, targetOrigin })), [
      { type: "stellar:hello", route: "/contact/", targetOrigin: "http://127.0.0.1:3210" },
    ]);
  }
  assert.deepEqual(run("http://other.example/"), []);
});

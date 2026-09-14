export default [{
  files: ["scripts/check-fixture.mjs", "scripts/verify-local-runner.mjs", "test/fixture.test.mjs", "test/editor-e2e/**/*.mjs", "eslint.config.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { console: "readonly", process: "readonly", fetch: "readonly", AbortSignal: "readonly", window: "readonly", document: "readonly", getComputedStyle: "readonly" } },
  rules: { "no-undef": "error", "no-unused-vars": "error", "no-unreachable": "error", "no-constant-condition": "error" },
}];

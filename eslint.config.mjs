export default [{
  files: ["scripts/check-fixture.mjs", "scripts/verify-local-runner.mjs", "test/fixture.test.mjs", "eslint.config.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { console: "readonly", process: "readonly", fetch: "readonly", AbortSignal: "readonly" } },
  rules: { "no-undef": "error", "no-unused-vars": "error", "no-unreachable": "error", "no-constant-condition": "error" },
}];

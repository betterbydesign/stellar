/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
// The app uses TypeScript 7, whose compiler API does not expose transpileModule.
// This test loader intentionally uses the pinned TypeScript 6 compiler alias.
const ts = require("typescript-compiler");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

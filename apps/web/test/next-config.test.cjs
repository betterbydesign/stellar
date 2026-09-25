/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } = require("next/constants");
const config = require("../next.config.ts").default;

test("local development isolates its lock while production keeps the built output", () => {
  const original = process.env.STELLAR_LOCAL_MODE;
  const connected = process.env.STELLAR_CONNECTED_MODE;
  try {
    delete process.env.STELLAR_CONNECTED_MODE;
    delete process.env.STELLAR_LOCAL_MODE;
    assert.equal(config(PHASE_DEVELOPMENT_SERVER).distDir, ".next");
    process.env.STELLAR_LOCAL_MODE = "1";
    assert.equal(config(PHASE_DEVELOPMENT_SERVER).distDir, ".next-local");
    assert.equal(config(PHASE_PRODUCTION_BUILD).distDir, ".next");
    assert.equal(config(PHASE_PRODUCTION_SERVER).distDir, ".next");
    assert.notEqual(config(PHASE_DEVELOPMENT_SERVER).experimental?.lockDistDir, false);
    process.env.STELLAR_LOCAL_MODE = "0";
    process.env.STELLAR_CONNECTED_MODE = "1";
    assert.equal(config(PHASE_DEVELOPMENT_SERVER).distDir, ".next-connected");
    assert.equal(config(PHASE_PRODUCTION_BUILD).distDir, ".next");
  } finally {
    if (original === undefined) delete process.env.STELLAR_LOCAL_MODE;
    else process.env.STELLAR_LOCAL_MODE = original;
    if (connected === undefined) delete process.env.STELLAR_CONNECTED_MODE;
    else process.env.STELLAR_CONNECTED_MODE = connected;
  }
});

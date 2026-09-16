/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { NextRequest } = require("next/server");
const { inspectPlatformConfig } = require("../lib/platform/config.ts");
const platformProxy = require("../proxy.ts").default;

function configured(overrides = {}) {
  return {
    STELLAR_PLATFORM_MODE: "1",
    WORKOS_CLIENT_ID: "client_01ABCDEFGHIJKLMNOP",
    WORKOS_API_KEY: "sk_test_01ABCDEFGHIJKLMNOP",
    WORKOS_COOKIE_PASSWORD: "0123456789abcdef0123456789abcdef",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://stellar.example/auth/callback",
    NEXT_PUBLIC_CONVEX_URL: "https://stellar-example.convex.cloud",
    ...overrides,
  };
}

test("platform mode is explicit and unknown or mixed modes fail closed", () => {
  assert.deepEqual(inspectPlatformConfig({}), { mode: "disabled" });
  assert.deepEqual(inspectPlatformConfig(configured({ STELLAR_PLATFORM_MODE: "0" })), { mode: "disabled" });
  assert.deepEqual(inspectPlatformConfig(configured({ STELLAR_PLATFORM_MODE: "true" })), {
    mode: "invalid", invalid: ["STELLAR_PLATFORM_MODE"],
  });
  assert.deepEqual(inspectPlatformConfig(configured({ STELLAR_PLATFORM_MODE: " 1 " })), {
    mode: "invalid", invalid: ["STELLAR_PLATFORM_MODE"],
  });
  assert.deepEqual(inspectPlatformConfig(configured({ STELLAR_LOCAL_MODE: "1" })), {
    mode: "invalid", invalid: ["STELLAR_LOCAL_MODE"],
  });
  assert.deepEqual(inspectPlatformConfig(configured({ STELLAR_LOCAL_MODE: "true" })), {
    mode: "invalid", invalid: ["STELLAR_LOCAL_MODE"],
  });
});

test("missing setup reports names only and never returns partial credentials", () => {
  const apiKey = "sk_test_do_not_echo_this_value";
  const result = inspectPlatformConfig({ STELLAR_PLATFORM_MODE: "1", WORKOS_API_KEY: apiKey });
  assert.equal(result.mode, "unconfigured");
  assert.deepEqual(result.missing, [
    "WORKOS_CLIENT_ID",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
    "NEXT_PUBLIC_CONVEX_URL",
  ]);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test("ready config exposes only validated public URLs and derives the app origin", () => {
  const hosted = inspectPlatformConfig(configured());
  assert.deepEqual(hosted, {
    mode: "ready",
    appOrigin: "https://stellar.example",
    callbackUri: "https://stellar.example/auth/callback",
    convexUrl: "https://stellar-example.convex.cloud",
  });
  assert.equal(JSON.stringify(hosted).includes("client_01ABCDEFGHIJKLMNOP"), false);
  assert.equal(JSON.stringify(hosted).includes("sk_test_01ABCDEFGHIJKLMNOP"), false);

  const loopback = inspectPlatformConfig(configured({
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://127.0.0.1:3210/auth/callback",
    NEXT_PUBLIC_CONVEX_URL: "http://localhost:3211/",
  }));
  assert.equal(loopback.mode, "ready");
  assert.equal(loopback.appOrigin, "http://127.0.0.1:3210");
  assert.equal(loopback.convexUrl, "http://localhost:3211");
});

test("unsafe credentials, URLs, and provider endpoint overrides are rejected by name", () => {
  const unsafe = inspectPlatformConfig(configured({
    WORKOS_CLIENT_ID: "wrong",
    WORKOS_API_KEY: "secret",
    WORKOS_COOKIE_PASSWORD: "short",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://stellar.example/auth/callback?code=secret",
    NEXT_PUBLIC_CONVEX_URL: "https://user:password@stellar-example.convex.cloud/",
  }));
  assert.deepEqual(unsafe, {
    mode: "invalid",
    invalid: [
      "WORKOS_CLIENT_ID",
      "WORKOS_API_KEY",
      "WORKOS_COOKIE_PASSWORD",
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
      "NEXT_PUBLIC_CONVEX_URL",
    ],
  });
  assert.equal(JSON.stringify(unsafe).includes("password"), false);

  for (const override of ["WORKOS_API_HOSTNAME", "WORKOS_API_HTTPS", "WORKOS_API_PORT"]) {
    const result = inspectPlatformConfig(configured({ [override]: "attacker.example" }));
    assert.deepEqual(result, { mode: "invalid", invalid: [override] });
  }
});

test("callback and Convex URLs accept HTTPS or loopback HTTP only at their fixed paths", () => {
  const cases = [
    ["NEXT_PUBLIC_WORKOS_REDIRECT_URI", "http://stellar.example/auth/callback"],
    ["NEXT_PUBLIC_WORKOS_REDIRECT_URI", "https://stellar.example/wrong"],
    ["NEXT_PUBLIC_WORKOS_REDIRECT_URI", "https://stellar.example/auth/callback#fragment"],
    ["NEXT_PUBLIC_CONVEX_URL", "http://convex.example/"],
    ["NEXT_PUBLIC_CONVEX_URL", "https://convex.example/deployment"],
    ["NEXT_PUBLIC_CONVEX_URL", "https://convex.example/?token=secret"],
  ];
  for (const [name, value] of cases) {
    assert.deepEqual(inspectPlatformConfig(configured({ [name]: value })), {
      mode: "invalid", invalid: [name],
    });
  }
});

test("an unavailable platform strips spoofed AuthKit request headers", async () => {
  const names = [
    "STELLAR_PLATFORM_MODE",
    "STELLAR_LOCAL_MODE",
    "WORKOS_CLIENT_ID",
    "WORKOS_API_KEY",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
    "NEXT_PUBLIC_CONVEX_URL",
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.STELLAR_PLATFORM_MODE = "1";
    const request = new NextRequest("https://stellar.example/platform", {
      headers: {
        "x-workos-middleware": "true",
        "x-workos-session": "forged-session",
        "x-workos-attacker": "forged-value",
        "x-stellar-safe": "preserved",
      },
    });
    const response = await platformProxy(request, {});
    const forwardedNames = response.headers.get("x-middleware-override-headers") ?? "";
    assert.equal(forwardedNames.includes("x-workos"), false);
    assert.equal(response.headers.get("x-middleware-request-x-workos-session"), null);
    assert.equal(response.headers.get("x-middleware-request-x-stellar-safe"), "preserved");
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

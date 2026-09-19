/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { accountReviewTransport } = require("../features/proposals/client.ts");
const { platformHttp } = require("../lib/platform/http.ts");

test("account proposal transport and HTTP agree on exact decision payload", async () => {
  const originalFetch = global.fetch;
  const origin = "https://stellar.example";
  const calls = [];
  const record = { id: "proposal1", projectId: "project1", status: "approved" };
  global.fetch = async (path, init) => {
    const request = new Request(origin + path, { ...init, headers: { ...init.headers, origin } });
    return platformHttp(request, new URL(request.url).pathname.split("/").slice(3), {
      appOrigin: origin, session: async () => ({ accessToken: "test-token" }), errorCode: () => null,
      backend: { decideProposal: async (...args) => { calls.push(args); return record; } },
    });
  };
  try {
    const intent = { proposalId: "proposal1", action: "approve", requestId: "decision1", expectedDigest: "a".repeat(64), expectedRevision: "revision1" };
    assert.deepEqual(await accountReviewTransport.decide("project1", "proposal1", intent), record);
    assert.deepEqual(calls, [["test-token", { projectId: "project1", ...intent }]]);
  } finally { global.fetch = originalFetch; }
});

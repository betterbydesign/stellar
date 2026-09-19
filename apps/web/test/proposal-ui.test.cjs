/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { parsePendingReview, reconciledPending, reviewStorageKey } = require("../features/proposals/pending.ts");

test("pending review keys isolate tenant, actor and project", () => {
  const key = reviewStorageKey("tenant-a", "actor-a", "project-a");
  assert.notEqual(key, reviewStorageKey("tenant-b", "actor-a", "project-a"));
  assert.notEqual(key, reviewStorageKey("tenant-a", "actor-b", "project-a"));
  assert.notEqual(key, reviewStorageKey("tenant-a", "actor-a", "project-b"));
});

test("pending review reload accepts only a bounded exact request", () => {
  const intent = { proposalId: "proposal-1", action: "approve", requestId: "review-1", expectedDigest: "a".repeat(64), expectedRevision: "revision-1" };
  assert.deepEqual(parsePendingReview(JSON.stringify(intent)), intent);
  for (const invalid of [{ ...intent, action: "apply" }, { ...intent, expectedDigest: "x" }, { ...intent, requestId: "" }, { ...intent, proposalId: "../other" }, { ...intent, expectedRevision: "" }]) {
    assert.equal(parsePendingReview(JSON.stringify(invalid)), null);
  }
  assert.equal(parsePendingReview("{broken"), null);
});

test("lost response reconciliation binds actor, action and request ID even after later cancellation", () => {
  const pending = { proposalId: "proposal-1", action: "approve", requestId: "review-1", expectedDigest: "a".repeat(64), expectedRevision: "revision-1" };
  const approval = { action: "approve", actorSubject: "reviewer-a", requestId: "review-1" };
  assert.equal(reconciledPending(pending, [approval], "reviewer-a"), true);
  assert.equal(reconciledPending(pending, [approval, { action: "cancel", actorSubject: "reviewer-b", requestId: "review-2" }], "reviewer-a"), true);
  assert.equal(reconciledPending(pending, [{ ...approval, actorSubject: "reviewer-b" }], "reviewer-a"), false);
  assert.equal(reconciledPending(pending, [{ ...approval, requestId: "review-other" }], "reviewer-a"), false);
  assert.equal(reconciledPending(pending, [{ ...approval, action: "reject" }], "reviewer-a"), false);
});

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

test("lost response reconciliation binds proposal, digest, revision, actor, action and request ID even after later cancellation", () => {
  const pending = { proposalId: "proposal-1", action: "approve", requestId: "review-1", expectedDigest: "a".repeat(64), expectedRevision: "revision-1" };
  const proposal = { id: pending.proposalId, digest: pending.expectedDigest, sourceRevision: pending.expectedRevision };
  const approval = { action: "approve", actorSubject: "reviewer-a", requestId: "review-1" };
  assert.equal(reconciledPending(pending, [approval], "reviewer-a", proposal), true);
  assert.equal(reconciledPending(pending, [approval, { action: "cancel", actorSubject: "reviewer-b", requestId: "review-2" }], "reviewer-a", proposal), true);
  assert.equal(reconciledPending(pending, [{ ...approval, actorSubject: "reviewer-b" }], "reviewer-a", proposal), false);
  assert.equal(reconciledPending(pending, [{ ...approval, requestId: "review-other" }], "reviewer-a", proposal), false);
  assert.equal(reconciledPending(pending, [{ ...approval, action: "reject" }], "reviewer-a", proposal), false);
});


test("mismatched sealed bindings never clear a pending decision", () => {
  const pending = { proposalId: "proposal-1", action: "approve", requestId: "same", expectedDigest: "a".repeat(64), expectedRevision: "revision-1" };
  const proposal = { id: pending.proposalId, digest: pending.expectedDigest, sourceRevision: pending.expectedRevision };
  const history = [{ action: "approve", actorSubject: "reviewer", requestId: "same" }];
  for (const changed of [
    { ...pending, expectedDigest: "b".repeat(64) },
    { ...pending, expectedRevision: "revision-other" },
    { ...pending, proposalId: "proposal-other" },
  ]) assert.equal(reconciledPending(changed, history, "reviewer", proposal), false);
  assert.equal(reconciledPending(pending, history, "reviewer", proposal), true);
});

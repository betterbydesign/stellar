/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadAccount } = require('../features/platform/onboarding.ts');
const { PlatformRequestError } = require('../features/platform/client.ts');
test('missing personal account is initialized and reread once', async () => {
  const calls = []; const account = { tenant: { _id: 'personal' } };
  const request = async (...args) => { calls.push(args); if (calls.length === 1) throw new PlatformRequestError('WORKSPACE_NOT_PROVISIONED'); return account; };
  assert.equal(await loadAccount(null, request), account);
  assert.deepEqual(calls, [['workspace'], ['workspace', {}], ['workspace']]);
});
test('existing accounts require no bootstrap', async () => {
  let count = 0; await loadAccount(null, async () => { count++; return {}; }); assert.equal(count, 1);
});
test('organization, revoked access, ended sessions and outages never trigger bootstrap', async () => {
  for (const [org, code] of [['org-a', 'WORKSPACE_NOT_PROVISIONED'], [null, 'TENANT_ACCESS_DENIED'], [null, 'UNAUTHENTICATED'], [null, 'BACKEND_UNAVAILABLE']]) {
    let count = 0;
    await assert.rejects(loadAccount(org, async () => { count++; throw new PlatformRequestError(code); }));
    assert.equal(count, 1);
  }
});
test('lost bootstrap response can be retried without inferring success', async () => {
  let stored = false; let writes = 0;
  const request = async (_path, body) => {
    if (body) { stored = true; writes++; throw new PlatformRequestError('BACKEND_UNAVAILABLE'); }
    if (!stored) throw new PlatformRequestError('WORKSPACE_NOT_PROVISIONED');
    return { tenant: { _id: 'original' } };
  };
  await assert.rejects(loadAccount(null, request));
  assert.equal((await loadAccount(null, request)).tenant._id, 'original'); assert.equal(writes, 1);
});

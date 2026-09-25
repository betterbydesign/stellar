/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const { readConnectedConfig } = require('../lib/connected/config.ts');
const { readLocalConfig } = require('../lib/server/local-config.ts');
const { bootstrapOperator, OPERATOR_COOKIE } = require('../lib/server/operator-auth.ts');
const { connectedHttp, accountCsrf } = require('../lib/connected/http.ts');
const origin = 'http://127.0.0.1:43210';
const env = () => ({ STELLAR_CONNECTED_MODE: '1', STELLAR_PLATFORM_MODE: '1', STELLAR_LOCAL_MODE: '0', WORKOS_CLIENT_ID: 'client_stellar_test', WORKOS_API_KEY: 'sk_stellar_test', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32), NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${origin}/auth/callback`, NEXT_PUBLIC_CONVEX_URL: 'https://stellar-test.convex.cloud', STELLAR_APP_ORIGIN: origin, STELLAR_RUNNER_URL: 'http://127.0.0.1:43211', STELLAR_RUNNER_SECRET: 'r'.repeat(32), STELLAR_BOOTSTRAP_NONCE: randomBytes(32).toString('hex'), STELLAR_OPERATOR_ID: 'operator-connected-test', STELLAR_PREVIEW_HOST: 'localhost', STELLAR_CONNECTION_SECRET: 's'.repeat(32) });
const scope = { identityNamespace: 'client_stellar_test', tenantId: 'tenant-a', actorSubject: 'actor-a' };
async function setup() {
  const config = readConnectedConfig(env());
  const issued = await bootstrapOperator(config.bootstrapNonce, config);
  const calls = []; let actor = 'actor-a'; let active = true; let swap = false;
  const deps = { config,
    session: async () => ({ identity: { subject: actor, email: 'offline@example.invalid', organizationId: null, firstName: null, lastName: null }, accessToken: 'offline-token' }),
    backend: () => async (_kind, name, input) => {
      calls.push(['backend', name, input]);
      if (name === 'connected:connectionContext') return { ...scope, actorSubject: actor };
      if (name === 'connected:connectionStatus') return { connection: active ? { connectionId: 'connection-a' } : null };
      if (name === 'connected:authorizeRegistry') {
        if (!active) throw { data: { code: 'CONNECTION_REVOKED' } };
        return { ...scope, actorSubject: actor, installationId: swap ? 'wrong-computer' : 'installation-a', connectionId: 'connection-a', accountProjectId: 'account-a', registryProjectId: 'registry-a' };
      }
      throw new Error('Unexpected backend call');
    },
    runner: async (method, input) => {
      calls.push(['runner', method, input]);
      if (method === 'installationStatus') return { installationId: 'installation-a', requestId: input.requestId };
      if (method === 'checkInstallationConnection') return { ...scope, installationId: 'installation-a', connectionId: 'connection-a' };
      throw new Error('Unexpected runner dispatch');
    },
  };
  const csrf = accountCsrf(issued.operator.csrfToken, scope);
  const req = (path, body, options = {}) => new Request(`${origin}/api/connected/${path}?requestId=query-1`, {
    method: body === undefined ? 'GET' : 'POST', headers: { host: new URL(origin).host, origin, cookie: `${OPERATOR_COOKIE}=${issued.cookie}`, 'x-stellar-csrf': csrf, 'content-type': 'application/json', ...options },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const run = (path, body, options) => connectedHttp(req(path, body, options), path.split('/'), deps);
  return { deps, calls, run, setActor: (v) => { actor = v; }, setActive: (v) => { active = v; }, setSwap: () => { swap = true; } };
}
test('connected mode is explicit, loopback only, and never enables the old local broker', () => {
  const base = env(); assert.ok(readConnectedConfig(base)); assert.equal(readLocalConfig(base), null);
  for (const patch of [{ STELLAR_CONNECTED_MODE: '0' }, { STELLAR_LOCAL_MODE: '1' }, { STELLAR_CONNECTION_SECRET: '' }, { STELLAR_RUNNER_URL: 'https://evil.example' }, { STELLAR_APP_ORIGIN: 'http://127.0.0.1:12345' }, { NEXT_PUBLIC_WORKOS_REDIRECT_URI: 'https://stellar.example/auth/callback', STELLAR_APP_ORIGIN: 'https://stellar.example' }]) assert.equal(readConnectedConfig({ ...base, ...patch }), null);
});
test('wrong origin/host and missing operator possession cannot reach source', async () => {
  for (const headers of [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { cookie: '' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = await setup(); const response = await f.run('websites/account-a/projects/registry-a', undefined, headers);
    assert.ok([401, 403].includes(response.status)); assert.equal(f.calls.filter(([kind]) => kind === 'runner').length, 0);
  }
});
test('account switching invalidates an earlier account CSRF token before runner access', async () => {
  const f = await setup(); f.setActor('actor-b');
  const response = await f.run('offer', { requestId: 'offer-a' }); assert.equal(response.status, 403);
  assert.equal(f.calls.filter(([kind]) => kind === 'runner').length, 0);
});
test('revoked connection and swapped backend binding do not dispatch an editor command', async () => {
  for (const changed of ['revoked', 'swapped']) {
    const f = await setup(); if (changed === 'revoked') f.setActive(false); else f.setSwap();
    const response = await f.run('websites/account-a/projects/registry-a'); assert.notEqual(response.status, 200);
    assert.equal(f.calls.some(([, method]) => method === 'dispatchAccountProject'), false);
  }
});
test('client project/session body cannot override the authorized route binding', async () => {
  const f = await setup();
  const response = await f.run('websites/account-a/projects/registry-a/sessions', { protocolVersion: 'stellar.editor.v1', projectId: 'registry-b', requestId: 'open-a' });
  assert.equal(response.status, 403); assert.equal(f.calls.some(([, method]) => method === 'dispatchAccountProject'), false);
});
test('connected adapter cannot enumerate or create arbitrary registry projects', async () => {
  const f = await setup();
  for (const path of ['projects', 'websites/account-a/projects', 'websites/account-a/projects/blueprints']) {
    const response = await f.run(path); assert.notEqual(response.status, 200);
  }
  assert.equal(f.calls.some(([, method]) => ['listProjects', 'createProject', 'listBlueprints'].includes(method)), false);
});
test('a configured computer without a local session exposes an actionable prerequisite', async () => {
  const f = await setup(); const response = await f.run('status', undefined, { cookie: '' });
  assert.deepEqual(await response.json(), { available: true, connected: false, needsLocalConfirmation: true, accountLabel: 'offline@example.invalid' });
  assert.equal(f.calls.some(([kind]) => kind === 'runner'), false);
});

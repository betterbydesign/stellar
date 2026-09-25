/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const { editorApiBase, freshEditorCsrf } = require('../features/studio/endpoints.ts');
test('Studio routing carries account identity separately from guarded registry protocol', () => {
  const previous = global.window;
  try {
    global.window = { location: { pathname: '/platform/projects/account-a/studio' } };
    assert.equal(editorApiBase(), '/api/connected/websites/account-a/projects');
    global.window.location.pathname = '/projects/registry-a/studio';
    assert.equal(editorApiBase(), '/api/projects');
  } finally { global.window = previous; }
});
test('connected CSRF is refreshed after account changes instead of reusing stale storage', async () => {
  const previousWindow = global.window; const previousFetch = global.fetch; let saved = 'old-account-token'; let calls = 0;
  try {
    global.window = { location: { pathname: '/platform/projects/account-a/studio' }, sessionStorage: { getItem: () => saved, setItem: (_key, value) => { saved = value; } } };
    global.fetch = async () => { calls++; return Response.json({ csrfToken: `current-account-${calls}` }); };
    assert.equal(await freshEditorCsrf(), 'current-account-1');
    assert.equal(await freshEditorCsrf(), 'current-account-2');
    assert.equal(saved, 'current-account-2'); assert.equal(calls, 2);
  } finally { global.window = previousWindow; global.fetch = previousFetch; }
});

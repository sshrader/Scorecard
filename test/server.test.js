'use strict';
const test = require('node:test');
const assert = require('node:assert');
const server = require('../server');

let base;
test.before(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

test('health check says it is on sample data', async () => {
  const j = await (await fetch(base + '/healthz')).json();
  assert.deepStrictEqual(j, { ok: true, sample: true });
});

test('trending rows carry a dev score', async () => {
  const j = await (await fetch(base + '/api/trending')).json();
  assert.strictEqual(j.sample, true);
  assert.ok(j.tokens.length >= 8);
  for (const t of j.tokens) assert.ok(t.devScore == null || (t.devScore >= 0 && t.devScore <= 100));
});

test('a creator scorecard comes back with parts, signals and launches', async () => {
  const j = await (await fetch(base + '/api/dev/sample-glorb')).json();
  assert.strictEqual(j.dev.parts.length, 6);
  assert.ok(j.dev.signals.length >= 2);
  assert.ok(j.dev.launches.length >= 10);
});

test('unknown and malformed ids are refused', async () => {
  assert.strictEqual((await fetch(base + '/api/dev/nobody')).status, 404);
  assert.strictEqual((await fetch(base + '/api/dev/' + encodeURIComponent('../x'))).status, 400);
  assert.strictEqual((await fetch(base + '/api/nope')).status, 404);
});

test('the page and its files are served, and nothing outside public', async () => {
  const idx = await fetch(base + '/');
  assert.strictEqual(idx.status, 200);
  assert.match(await idx.text(), /Scorecard/);
  assert.strictEqual((await fetch(base + '/app.js')).status, 200);
  const raw = await new Promise((ok) => {
    require('http').get({ host: '127.0.0.1', port: server.address().port, path: '/../package.json' }, (r) => ok(r.statusCode));
  });
  assert.strictEqual(raw, 404);
  assert.strictEqual((await fetch(base + '/%2e%2e/package.json')).status, 404);
});

test('only GET is allowed', async () => {
  assert.strictEqual((await fetch(base + '/api/trending', { method: 'POST' })).status, 405);
});

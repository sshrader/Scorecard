'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyse, outcomeOf, median, interp, WEIGHTS } = require('../src/score');
const sample = require('../src/data/sample');

const launch = (o) => Object.assign({ name: 'X', ticker: '$X', launchedAt: '2026-11-01', active: false, migrated: false, peakMcapUsd: 50000, timeToPeakMin: 30, devSoldPct1h: 5, devHoldPct24h: 4, top10Pct24h: 30, holders24h: 300 }, o);
const profile = (launches, o) => Object.assign({ id: 't', short: 'Test…', ageDays: 100, funding: 'exchange', linkedWallets: 0, launches }, o);

test('weights add up to 100', () => {
  assert.strictEqual(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('median and interp', () => {
  assert.strictEqual(median([]), null);
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);
  assert.strictEqual(interp([[0, 0], [10, 100]], 5), 50);
  assert.strictEqual(interp([[0, 0], [10, 100]], 99), 100);
});

test('outcomes', () => {
  assert.strictEqual(outcomeOf(launch({ active: true })), 'Active');
  assert.strictEqual(outcomeOf(launch({ migrated: true, devSoldPct1h: 90 })), 'Migrated');
  assert.strictEqual(outcomeOf(launch({ devSoldPct1h: 50 })), 'Rugged');
  assert.strictEqual(outcomeOf(launch({ devSoldPct1h: 49 })), 'Faded');
});

test('a creator whose launches all migrate scores high and one who always dumps scores low', () => {
  const good = analyse(profile(Array.from({ length: 6 }, () => launch({ migrated: true, peakMcapUsd: 600000, top10Pct24h: 18 }))));
  const bad = analyse(profile(Array.from({ length: 6 }, () => launch({ devSoldPct1h: 85, devHoldPct24h: 0, peakMcapUsd: 15000, top10Pct24h: 65 })), { funding: 'shared', linkedWallets: 8, ageDays: 10 }));
  assert.ok(good.total >= 85, 'good ' + good.total);
  assert.ok(bad.total <= 10, 'bad ' + bad.total);
  assert.strictEqual(good.tone, 'good');
  assert.strictEqual(bad.tone, 'bad');
  assert.ok(good.total >= 0 && good.total <= 100 && bad.total >= 0 && bad.total <= 100);
});

test('active launches are listed but not scored', () => {
  const a = analyse(profile([launch({ active: true, devSoldPct1h: 99 }), launch({ migrated: true }), launch({ migrated: true }), launch({ migrated: true })]));
  assert.strictEqual(a.finished, 3);
  assert.strictEqual(a.counts.Active, 1);
  assert.strictEqual(a.counts.Rugged, 0);
  assert.strictEqual(a.launches.length, 4);
});

test('very little history is marked low confidence', () => {
  const a = analyse(profile([launch({ migrated: true })]));
  assert.strictEqual(a.lowConfidence, true);
  assert.ok(a.signals.some((s) => /low confidence/.test(s.text)));
});

test('a creator with no launches does not crash', () => {
  const a = analyse(profile([]));
  assert.strictEqual(a.finished, 0);
  assert.ok(Number.isFinite(a.total));
});

test('sample creators land in the bands they were made for', async () => {
  const strong = analyse(await sample.getProfile('sample-glorb'));
  const risky = analyse(await sample.getProfile('sample-snlz'));
  const newbie = analyse(await sample.getProfile('sample-new'));
  assert.ok(strong.total >= 70, 'glorb ' + strong.total);
  assert.ok(risky.total < 40, 'snlz ' + risky.total);
  assert.strictEqual(newbie.lowConfidence, true);
  assert.strictEqual(risky.launches[0].outcome, 'Active');
  assert.strictEqual(strong.counts.Migrated + strong.counts.Faded + strong.counts.Rugged, strong.finished);
});

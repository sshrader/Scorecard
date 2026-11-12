'use strict';
// Made-up creators and launches, so the page and the scoring can be built and tested without any live data.
// Every wallet id here starts with "sample-". Nothing in this file describes a real wallet or token.

// Same numbers every run, so tests and screenshots stay stable.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Glor', 'Nim', 'Waf', 'Zor', 'Kel', 'Mir', 'Toast', 'Pix', 'Snail', 'Hon', 'Quack', 'Turbo', 'Moss', 'Fluf', 'Yeet', 'Blob', 'Pep', 'Dun', 'Fizz', 'Lum', 'Bram', 'Tink', 'Roo', 'Skib'];
const LAST = ['bo', 'bus', 'fle', 'p', 'p', 'o', 'y', 'pup', 'z', 'ky', 'r', 'y', 'y', 'fo', 'tle', 'by', 'per', 'ky', 'zo', 'a', 'ble', 'er', 'bo', 'by'];

const BASE = Date.UTC(2026, 10, 10); // 10 Nov 2026

const between = (r, lo, hi) => lo + r() * (hi - lo);
const logBetween = (r, lo, hi) => Math.exp(between(r, Math.log(lo), Math.log(hi)));

// Profile settings: how many launches, and how they tend to end.
const CREATORS = [
  { id: 'sample-glorb', short: '7xKp…q9Rt', ageDays: 143, funding: 'exchange', linkedWallets: 0, n: 14, mig: 0.64, rug: 0.07, seed: 11 },
  { id: 'sample-snlz', short: '3QmV…h2Ld', ageDays: 19, funding: 'shared', linkedWallets: 9, n: 22, mig: 0.09, rug: 0.64, seed: 22, activeFirst: true },
  { id: 'sample-nmbs', short: '9TbF…c4Wz', ageDays: 210, funding: 'exchange', linkedWallets: 0, n: 11, mig: 0.64, rug: 0.09, seed: 33 },
  { id: 'sample-wafl', short: '5HnR…p8Jx', ageDays: 88, funding: 'exchange', linkedWallets: 1, n: 10, mig: 0.4, rug: 0.1, seed: 44 },
  { id: 'sample-zorp', short: '2LdE…m7Qa', ageDays: 176, funding: 'exchange', linkedWallets: 0, n: 12, mig: 0.66, rug: 0.08, seed: 55 },
  { id: 'sample-kelp', short: '8WcY…t3Vn', ageDays: 41, funding: 'fresh', linkedWallets: 2, n: 12, mig: 0.1, rug: 0.33, seed: 66 },
  { id: 'sample-miro', short: '4RjK…d9Ps', ageDays: 96, funding: 'exchange', linkedWallets: 0, n: 10, mig: 0.5, rug: 0.1, seed: 77 },
  { id: 'sample-tost', short: '6VsA…k2Hb', ageDays: 27, funding: 'shared', linkedWallets: 5, n: 12, mig: 0, rug: 0.75, seed: 88 },
  { id: 'sample-new', short: '1NpU…w6Cy', ageDays: 6, funding: 'fresh', linkedWallets: 0, n: 2, mig: 0, rug: 0, seed: 99 }
];

function build(c) {
  const r = rng(c.seed);
  const launches = [];
  // Decide each outcome up front so the totals match the settings.
  const nMig = Math.round(c.n * c.mig), nRug = Math.round(c.n * c.rug);
  const kinds = [];
  for (let i = 0; i < c.n; i++) kinds.push(i < nMig ? 'Migrated' : i < nMig + nRug ? 'Rugged' : 'Faded');
  // Shuffle with the seeded generator.
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }

  let day = c.activeFirst ? 0 : 3;
  kinds.forEach((kind, i) => {
    const isActive = c.activeFirst && i === 0;
    day += isActive ? 0 : Math.floor(between(r, 3, 9));
    const f = Math.floor(r() * FIRST.length);
    const name = FIRST[f] + LAST[f];
    let l;
    if (kind === 'Migrated') l = { migrated: true, peakMcapUsd: logBetween(r, 150000, 1400000), timeToPeakMin: between(r, 60, 400), devSoldPct1h: between(r, 1, 10), devHoldPct24h: between(r, 2, 6), top10Pct24h: between(r, 15, 28), holders24h: Math.floor(between(r, 900, 3500)) };
    else if (kind === 'Faded') l = { migrated: false, peakMcapUsd: logBetween(r, 20000, 90000), timeToPeakMin: between(r, 20, 70), devSoldPct1h: between(r, 1, 18), devHoldPct24h: between(r, 1, 6), top10Pct24h: between(r, 25, 45), holders24h: Math.floor(between(r, 150, 600)) };
    else l = { migrated: false, peakMcapUsd: logBetween(r, 12000, 40000), timeToPeakMin: between(r, 5, 25), devSoldPct1h: between(r, 55, 95), devHoldPct24h: between(r, 0, 1), top10Pct24h: between(r, 45, 75), holders24h: Math.floor(between(r, 40, 200)) };
    if (isActive) l = { migrated: false, peakMcapUsd: 18000, timeToPeakMin: 22, devSoldPct1h: 48, devHoldPct24h: 0, top10Pct24h: 52, holders24h: 0 };
    launches.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      ticker: '$' + name.slice(0, 4).toUpperCase(),
      launchedAt: new Date(BASE - day * 86400000).toISOString().slice(0, 10),
      active: isActive,
      ...l
    });
  });
  return { id: c.id, short: c.short, ageDays: c.ageDays, funding: c.funding, linkedWallets: c.linkedWallets, launches };
}

const PROFILES = Object.fromEntries(CREATORS.map((c) => [c.id, build(c)]));

// The trending list the page opens on. Each token points at the wallet that created it.
const TRENDING = [
  { name: 'Glorbo', ticker: '$GLORB', change1h: 48, liquidityUsd: 212000, holders: 3104, padScore: 91, dev: 'sample-glorb' },
  { name: 'Snailz', ticker: '$SNLZ', change1h: 212, liquidityUsd: 38000, holders: 640, padScore: 74, dev: 'sample-snlz' },
  { name: 'Nimbus', ticker: '$NMBS', change1h: 19, liquidityUsd: 167000, holders: 1982, padScore: 83, dev: 'sample-nmbs' },
  { name: 'Waffle', ticker: '$WAFL', change1h: -6, liquidityUsd: 94000, holders: 1340, padScore: 66, dev: 'sample-wafl' },
  { name: 'Zorp', ticker: '$ZORP', change1h: 31, liquidityUsd: 131000, holders: 2611, padScore: 79, dev: 'sample-zorp' },
  { name: 'Kelp', ticker: '$KELP', change1h: -22, liquidityUsd: 22000, holders: 266, padScore: 41, dev: 'sample-kelp' },
  { name: 'Miro', ticker: '$MIRO', change1h: 7, liquidityUsd: 76000, holders: 1408, padScore: 70, dev: 'sample-miro' },
  { name: 'Toasty', ticker: '$TOST', change1h: 3, liquidityUsd: 49000, holders: 411, padScore: 58, dev: 'sample-tost' },
  { name: 'Newbie', ticker: '$NEWB', change1h: 12, liquidityUsd: 15000, holders: 88, padScore: 52, dev: 'sample-new' }
];

module.exports = {
  isSample: true,
  async getProfile(id) { return PROFILES[id] || null; },
  async listTrending() { return TRENDING.map((t) => ({ ...t })); }
};

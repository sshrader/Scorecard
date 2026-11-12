'use strict';
// The scoring rules. Pure functions: they take a creator's profile and past launches and return a score.
// Nothing here knows where the data came from, so the same code scores sample data and live data.
//
// A launch looks like:
//   { name, ticker, launchedAt (ISO date), active (launched under 24h ago), migrated (curve filled),
//     peakMcapUsd, timeToPeakMin, devSoldPct1h (share of their supply sold in the first hour),
//     devHoldPct24h (share of supply they still hold after 24h), top10Pct24h, holders24h }
// A profile looks like:
//   { id, short, ageDays, funding: 'exchange' | 'fresh' | 'shared' | 'unknown', linkedWallets, launches: [...] }

const WEIGHTS = { migration: 30, rugs: 25, devHolding: 15, holderSpread: 10, peak: 10, transparency: 10 };
const RUG_SELL_PCT = 50; // a creator who sells at least this much of their supply in the first hour
const MIN_FINISHED = 3; // fewer finished launches than this and the score is low confidence
const BANDS = [
  { min: 70, verdict: 'Strong record', tone: 'good' },
  { min: 40, verdict: 'Mixed record', tone: 'warn' },
  { min: 0, verdict: 'High risk', tone: 'bad' }
];

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round = (n) => Math.round(n);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Straight-line lookup between points [[x, y], ...] sorted by x.
function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

function outcomeOf(l) {
  if (l.active) return 'Active';
  if (l.migrated) return 'Migrated';
  if (l.devSoldPct1h >= RUG_SELL_PCT) return 'Rugged';
  return 'Faded';
}

function toneOf(score) {
  return score >= 70 ? 'good' : score >= 40 ? 'warn' : 'bad';
}

function bandOf(total) {
  return BANDS.find((b) => total >= b.min);
}

function analyse(profile) {
  const all = profile.launches || [];
  const finished = all.filter((l) => !l.active);
  const n = finished.length;
  const migrated = finished.filter((l) => l.migrated).length;
  const rugged = finished.filter((l) => l.devSoldPct1h >= RUG_SELL_PCT);
  const counts = { Migrated: 0, Faded: 0, Rugged: 0, Active: all.length - n };
  for (const l of finished) counts[outcomeOf(l)]++;

  const med = {
    peakMcapUsd: median(finished.map((l) => l.peakMcapUsd)),
    timeToPeakMin: median(finished.map((l) => l.timeToPeakMin)),
    devSoldPct1h: median(finished.map((l) => l.devSoldPct1h)),
    devHoldPct24h: median(finished.map((l) => l.devHoldPct24h)),
    top10Pct24h: median(finished.map((l) => l.top10Pct24h)),
    holders24h: median(finished.map((l) => l.holders24h))
  };

  const migRate = n ? migrated / n : 0;
  const rugRate = n ? rugged.length / n : 0;

  const s = {};
  s.migration = clamp((migRate / 0.75) * 100);
  s.rugs = clamp((1 - rugRate / 0.5) * 100);
  s.devHolding = med.devHoldPct24h == null ? 0 : clamp(interp([[0, 0], [1, 40], [3, 80], [5, 100], [10, 100], [15, 70], [25, 30], [40, 0]], med.devHoldPct24h));
  s.holderSpread = med.top10Pct24h == null ? 0 : clamp(interp([[10, 100], [20, 85], [35, 50], [60, 0]], med.top10Pct24h));
  s.peak = med.peakMcapUsd == null ? 0 : clamp(((Math.log10(Math.max(med.peakMcapUsd, 1)) - 4) / (Math.log10(500000) - 4)) * 100);
  let t = 50;
  if (profile.funding === 'exchange') t += 30;
  if (profile.funding === 'shared') t -= 40;
  if (profile.funding === 'fresh') t -= 20;
  t -= Math.min(30, (profile.linkedWallets || 0) * 4);
  t += profile.ageDays >= 90 ? 20 : profile.ageDays >= 30 ? 10 : profile.ageDays < 14 ? -10 : 0;
  s.transparency = clamp(t);

  const detail = {
    migration: migrated + ' of ' + n + ' launches filled the curve and moved to a DEX.',
    rugs: rugged.length === 0
      ? 'No launch where the creator sold over half their supply in the first hour.'
      : rugged.length + ' launch' + (rugged.length === 1 ? '' : 'es') + ' where the creator sold over half their supply in the first hour.',
    devHolding: med.devHoldPct24h == null ? 'No finished launches yet.' : 'Median creator holding is ' + med.devHoldPct24h.toFixed(1) + '% of supply after 24 hours.',
    holderSpread: med.top10Pct24h == null ? 'No finished launches yet.' : 'Top 10 holders own ' + round(med.top10Pct24h) + '% on average, excluding the curve.',
    peak: med.peakMcapUsd == null ? 'No finished launches yet.' : 'Median peak market cap of ' + money(med.peakMcapUsd) + ' across finished launches.',
    transparency: transparencyText(profile)
  };

  const labels = {
    migration: 'Migration rate',
    rugs: 'Rug history',
    devHolding: 'Dev holding behaviour',
    holderSpread: 'Holder spread at 24h',
    peak: 'Peak strength',
    transparency: 'Wallet transparency'
  };

  const parts = Object.keys(WEIGHTS).map((k) => ({
    key: k, label: labels[k], weight: WEIGHTS[k], score: round(s[k]), tone: toneOf(s[k]), detail: detail[k]
  }));

  const raw = Object.keys(WEIGHTS).reduce((sum, k) => sum + (s[k] * WEIGHTS[k]) / 100, 0);
  const total = round(raw);
  const band = bandOf(total);

  return {
    id: profile.id,
    short: profile.short,
    ageDays: profile.ageDays,
    funding: profile.funding,
    linkedWallets: profile.linkedWallets || 0,
    total,
    verdict: band.verdict,
    tone: band.tone,
    lowConfidence: n < MIN_FINISHED,
    counts,
    finished: n,
    medians: med,
    parts,
    signals: signalsFor(profile, { n, migrated, rugged, counts, med, migRate, rugRate }),
    badges: badgesFor(profile, { n, migrated, rugged, med, total, migRate, rugRate }),
    launches: all.map((l) => ({ ...l, outcome: outcomeOf(l) }))
  };
}

// Short labels earned from the record. Each one states a fact, not a prediction.
function badgesFor(p, x) {
  const b = [];
  const add = (key, label, tone, why) => b.push({ key, label, tone, why });
  if (x.n < MIN_FINISHED) add('rookie', 'Rookie', 'warn', 'Fewer than ' + MIN_FINISHED + ' finished launches.');
  else {
    if (x.total >= 80 && x.rugged.length === 0) add('diamond', 'Diamond dev', 'good', 'Score 80+ and no early dumps.');
    if (x.migRate >= 0.5) add('migrator', 'Migrator', 'good', 'Half or more of launches reached a DEX.');
    if (x.n >= 5 && x.rugRate >= 0.5) add('serial', 'Serial rugger', 'bad', 'Half or more launches ended in an early dump.');
    else if (x.rugged.length >= 2) add('dumper', 'Repeat dumper', 'bad', 'Sold over half their supply in the first hour more than once.');
    if (x.med.devHoldPct24h != null && x.med.devHoldPct24h >= 2 && x.rugRate < 0.2) add('holds', 'Keeps a bag', 'good', 'Usually still holds some supply after 24 hours.');
  }
  if (p.funding === 'exchange') add('clean', 'Clean funding', 'good', 'Funded from an exchange withdrawal.');
  if (p.funding === 'shared' || (p.linkedWallets || 0) >= 5) add('linked', 'Linked wallets', 'bad', 'Wallet cluster shares a funding source.');
  if (p.ageDays < 14) add('fresh', 'Fresh wallet', 'warn', 'Wallet is under 14 days old.');
  if (p.ageDays >= 180) add('veteran', 'Veteran', 'good', 'Wallet is 180+ days old.');
  return b;
}

function money(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return '$' + round(n / 1e3) + 'K';
  return '$' + round(n);
}

function transparencyText(p) {
  const f = { exchange: 'Funded from an exchange withdrawal.', fresh: 'Funded by a brand new wallet.', shared: 'Funded by a wallet that also funded other launch wallets.', unknown: 'Funding source not found.' }[p.funding] || 'Funding source not found.';
  const linked = p.linkedWallets ? ' ' + p.linkedWallets + ' linked wallets found.' : ' No linked wallets found.';
  return f + linked;
}

function signalsFor(profile, x) {
  const out = [];
  const { n, migrated, rugged, counts, med, migRate } = x;
  if (n < MIN_FINISHED) out.push({ tone: 'warn', label: 'WATCH', text: 'Only ' + n + ' finished launch' + (n === 1 ? '' : 'es') + ', so this score is low confidence.' });
  if (n) {
    out.push(migRate >= 0.5
      ? { tone: 'good', label: 'POSITIVE', text: migrated + ' of ' + n + ' launches migrated to a DEX.' }
      : migRate < 0.2
        ? { tone: 'bad', label: 'RISK', text: 'Only ' + migrated + ' of ' + n + ' launches migrated to a DEX.' }
        : { tone: 'warn', label: 'WATCH', text: migrated + ' of ' + n + ' launches migrated to a DEX.' });
  }
  if (rugged.length) {
    const worst = [...rugged].sort((a, b) => b.devSoldPct1h - a.devSoldPct1h)[0];
    out.push(rugged.length / n >= 0.25
      ? { tone: 'bad', label: 'RISK', text: rugged.length + ' of ' + n + ' launches saw the creator sell over half the supply in the first hour.' }
      : { tone: 'bad', label: 'RISK', text: worst.name + ': the creator sold ' + round(worst.devSoldPct1h) + '% of supply in ' + round(worst.timeToPeakMin) + ' minutes.' });
  } else if (n) {
    out.push({ tone: 'good', label: 'POSITIVE', text: 'The creator never sold over half their supply in the first hour.' });
  }
  if (med.devSoldPct1h != null && med.devSoldPct1h < 10) out.push({ tone: 'good', label: 'POSITIVE', text: 'The creator sold a median of ' + round(med.devSoldPct1h) + '% of holdings in the first hour.' });
  if (counts.Faded && counts.Faded / Math.max(n, 1) >= 0.25 && rugged.length / Math.max(n, 1) < 0.25) out.push({ tone: 'warn', label: 'WATCH', text: counts.Faded + ' launches faded within a day, close to the average for new tokens.' });
  if (profile.funding === 'shared') out.push({ tone: 'bad', label: 'RISK', text: (profile.linkedWallets || 'Other') + ' other wallets funded by the same source launched tokens in the same weeks.' });
  if (profile.funding === 'exchange' && !profile.linkedWallets) out.push({ tone: 'good', label: 'POSITIVE', text: 'Funded from an exchange withdrawal, no linked wallets found.' });
  if (profile.ageDays < 30) out.push({ tone: 'warn', label: 'WATCH', text: 'The wallet is ' + profile.ageDays + ' days old, so there is little history to judge.' });
  return out.slice(0, 6);
}

module.exports = { badgesFor, WEIGHTS, RUG_SELL_PCT, MIN_FINISHED, analyse, outcomeOf, median, interp, money };

'use strict';
// Read-only probe: pulls what can be read straight from the chain about one creator wallet, using a Solana RPC (Helius).
// It exists to test real data on a small scale. It never signs or sends anything.
// No dependencies: plain JSON-RPC over fetch.

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
// First 8 bytes of the instruction data for pump.fun "create" and "createV2". Both put the mint first and the bonding curve third.
const CREATE_DISC = [[24, 30, 200, 40, 5, 28, 7, 119], [214, 144, 76, 236, 95, 139, 49, 180]].map((a) => Buffer.from(a).toString('hex'));
const MAX_SIGS = 100;       // newest signatures scanned for launches
const MAX_DETAIL = 6;       // newest launches analysed in depth
const HOUR = 3600;

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(str) {
  let n = 0n;
  for (const ch of str) {
    const i = ALPHA.indexOf(ch);
    if (i < 0) throw new Error('Not base58');
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), bytes]);
}
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function scrub(text, url) {
  let t = String(text);
  if (url) {
    t = t.split(url).join('[rpc]');
    const m = /api-key=([^&]+)/.exec(url);
    if (m) t = t.split(m[1]).join('[key]');
  }
  return t.slice(0, 300);
}

function makeRpc(url, fetchImpl) {
  let id = 0;
  const doFetch = fetchImpl || fetch;
  return async function rpc(method, params) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      } catch (e) { if (attempt === 2) throw new Error('RPC unreachable: ' + scrub(e.message, url)); await sleep(400 * (attempt + 1)); continue; }
      if (res.status === 429) { await sleep(600 * (attempt + 1)); continue; }
      const j = await res.json().catch(() => null);
      if (!j) throw new Error('RPC returned a non-JSON answer (HTTP ' + res.status + ')');
      if (j.error) throw new Error(method + ': ' + scrub(j.error.message || JSON.stringify(j.error), url));
      return j.result;
    }
    throw new Error(method + ': rate limited, try again in a minute');
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// All account keys of a transaction, including ones loaded from address lookup tables.
function keysOf(tx) {
  const m = tx.transaction.message;
  const base = (m.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const la = (tx.meta && tx.meta.loadedAddresses) || {};
  return base.concat(la.writable || [], la.readonly || []);
}

// Finds a pump.fun create / createV2 instruction. Returns { mint, bondingCurve, creator } or null.
function findCreate(tx) {
  if (!tx || !tx.meta || tx.meta.err) return null;
  const keys = keysOf(tx);
  const m = tx.transaction.message;
  const all = (m.instructions || []).slice();
  for (const inner of tx.meta.innerInstructions || []) all.push(...inner.instructions);
  for (const ins of all) {
    if (keys[ins.programIdIndex] !== PUMP || !ins.data) continue;
    let data;
    try { data = b58decode(ins.data); } catch (e) { continue; }
    if (data.length < 8 || !CREATE_DISC.includes(data.subarray(0, 8).toString('hex'))) continue;
    const acc = ins.accounts.map((i) => keys[i]);
    return { mint: acc[0], bondingCurve: acc[2] };
  }
  return null;
}

// Reads the "complete" flag and total supply out of a bonding curve account (base64 data).
function readCurve(b64) {
  const d = Buffer.from(b64, 'base64');
  if (d.length < 49) return null;
  return { complete: d[48] === 1, totalSupplyRaw: d.readBigUInt64LE(40) };
}

function tokenBalance(tx, owner, mint) {
  const keys = keysOf(tx);
  const find = (list) => (list || []).find((b) => b.owner === owner && b.mint === mint);
  const post = find(tx.meta.postTokenBalances), pre = find(tx.meta.preTokenBalances);
  return {
    account: post ? keys[post.accountIndex] : pre ? keys[pre.accountIndex] : null,
    pre: pre ? BigInt(pre.uiTokenAmount.amount) : 0n,
    post: post ? BigInt(post.uiTokenAmount.amount) : 0n
  };
}

const getTx = (rpc, sig) => rpc('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);

async function analyseLaunch(rpc, wallet, L, curve) {
  const out = { mint: L.mint, launchedAt: new Date(L.blockTime * 1000).toISOString(), migrated: curve ? curve.complete : null, signature: L.signature };
  const tx = await getTx(rpc, L.signature);
  if (!tx) { out.note = 'Launch transaction not found'; return out; }
  const bal = tokenBalance(tx, wallet, L.mint);
  if (!bal.account || bal.post === 0n) { out.devBoughtAtLaunch = false; out.devSoldPct1h = null; out.note = 'Creator did not buy in the launch transaction, so there is nothing to measure selling against.'; return out; }
  out.devBoughtAtLaunch = true;
  const start = bal.post;
  const sigs = await rpc('getSignaturesForAddress', [bal.account, { limit: 100 }]);
  const inWindow = sigs.filter((s) => !s.err && s.signature !== L.signature && s.blockTime && s.blockTime > L.blockTime && s.blockTime <= L.blockTime + HOUR);
  const oldest = sigs.length ? sigs[sigs.length - 1].blockTime : null;
  out.truncated = sigs.length === 100 && oldest != null && oldest > L.blockTime;
  let end = start;
  if (inWindow.length) {
    const last = inWindow.reduce((a, b) => (a.slot >= b.slot ? a : b));
    const t2 = await getTx(rpc, last.signature);
    if (t2) end = tokenBalance(t2, wallet, L.mint).post;
  }
  out.devSoldPct1h = out.truncated ? null : Math.max(0, Math.min(100, Number(((start - end) * 10000n) / start) / 100));
  out.txInFirstHour = inWindow.length;
  try {
    const now = await rpc('getTokenAccountBalance', [bal.account]);
    const supply = curve ? curve.totalSupplyRaw : null;
    out.devHoldPctNow = supply ? Number((BigInt(now.value.amount) * 10000n) / supply) / 100 : null;
  } catch (e) { out.devHoldPctNow = 0; }
  return out;
}

async function probe(wallet, rpcUrl, fetchImpl) {
  if (!WALLET_RE.test(wallet || '')) throw new Error('That does not look like a wallet address.');
  if (!rpcUrl) throw new Error('RPC_URL is not set.');
  const rpc = makeRpc(rpcUrl, fetchImpl);
  const t0 = Date.now();
  const sigs = await rpc('getSignaturesForAddress', [wallet, { limit: 1000 }]);
  const result = { wallet, sample: false, scannedSignatures: Math.min(sigs.length, MAX_SIGS), historyComplete: sigs.length < 1000 };

  // Wallet age and who first funded it, from the oldest transaction we can see.
  if (sigs.length) {
    const first = sigs[sigs.length - 1];
    result.firstSeen = first.blockTime ? new Date(first.blockTime * 1000).toISOString() : null;
    result.ageDays = first.blockTime ? Math.floor((Date.now() / 1000 - first.blockTime) / 86400) : null;
    result.ageIsMinimum = !result.historyComplete;
    if (result.historyComplete) {
      const tx = await getTx(rpc, first.signature);
      if (tx && tx.meta) {
        const keys = keysOf(tx), idx = keys.indexOf(wallet);
        if (idx >= 0 && tx.meta.postBalances[idx] > tx.meta.preBalances[idx]) {
          let best = -1, bestDrop = 0;
          keys.forEach((k, i) => { const drop = tx.meta.preBalances[i] - tx.meta.postBalances[i]; if (i !== idx && drop > bestDrop) { best = i; bestDrop = drop; } });
          if (best >= 0) result.fundedBy = keys[best];
        }
      }
    }
  }

  // Scan the newest signatures for pump.fun launches.
  const recent = sigs.filter((s) => !s.err).slice(0, MAX_SIGS);
  const txs = await pool(recent, 4, async (s) => { const tx = await getTx(rpc, s.signature).catch(() => null); const c = findCreate(tx); return c ? { ...c, signature: s.signature, blockTime: s.blockTime } : null; });
  const launches = txs.filter(Boolean);
  result.launchesFound = launches.length;
  if (!launches.length) { result.launches = []; result.note = 'No pump.fun launches found in the newest ' + result.scannedSignatures + ' transactions of this wallet. If this is a wallet that only trades, that is expected. If it launches from a different wallet, use that one.'; result.tookMs = Date.now() - t0; return result; }

  const accts = await rpc('getMultipleAccounts', [launches.map((l) => l.bondingCurve), { encoding: 'base64' }]);
  const curves = accts.value.map((a) => (a && a.data ? readCurve(a.data[0]) : null));
  const detail = launches.slice(0, MAX_DETAIL);
  result.launches = await pool(detail, 2, (l, i) => analyseLaunch(rpc, wallet, l, curves[i]).catch((e) => ({ mint: l.mint, error: scrub(e.message, rpcUrl) })));
  result.launchesNotDetailed = launches.length - detail.length;
  result.migratedCount = result.launches.filter((l) => l.migrated === true).length;
  result.notAvailableYet = ['peakMcapUsd', 'timeToPeakMin', 'holders24h', 'top10Pct24h'];
  result.tookMs = Date.now() - t0;
  return result;
}

module.exports = { probe, b58decode, findCreate, readCurve, scrub, keysOf, CREATE_DISC, PUMP };

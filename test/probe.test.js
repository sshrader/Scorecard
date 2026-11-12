'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { probe, b58decode, findCreate, readCurve, scrub, PUMP } = require('../src/probe');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const enc = (buf) => { let n = BigInt('0x' + (buf.toString('hex') || '0')); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; };

test('base58 decode handles leading zeros and round trips', () => {
  assert.strictEqual(b58decode('11111111111111111111111111111111').length, 32);
  const buf = Buffer.from([0, 0, 24, 30, 200, 40, 5, 28, 7, 119, 1, 2, 3]);
  assert.deepStrictEqual(b58decode(enc(buf)), buf);
  assert.throws(() => b58decode('0OIl'));
});

function fakeCreateTx(disc, withLut) {
  const keys = ['Creator1111111111111111111111111111111111', PUMP, 'MintAAAA', 'CurveBBBB'];
  const data = enc(Buffer.concat([Buffer.from(disc), Buffer.alloc(4, 1)]));
  return {
    transaction: { message: { accountKeys: withLut ? keys.slice(0, 2) : keys, instructions: [{ programIdIndex: 1, data, accounts: withLut ? [2, 1, 3] : [2, 1, 3] }] } },
    meta: { err: null, innerInstructions: [], loadedAddresses: withLut ? { writable: ['MintAAAA', 'CurveBBBB'], readonly: [] } : undefined }
  };
}

test('finds create and createV2, with or without a lookup table', () => {
  for (const disc of [[24, 30, 200, 40, 5, 28, 7, 119], [214, 144, 76, 236, 95, 139, 49, 180]])
    for (const lut of [false, true]) {
      const c = findCreate(fakeCreateTx(disc, lut));
      assert.strictEqual(c.mint, 'MintAAAA');
      assert.strictEqual(c.bondingCurve, 'CurveBBBB');
    }
  assert.strictEqual(findCreate(fakeCreateTx([1, 2, 3, 4, 5, 6, 7, 8], false)), null);
  const failed = fakeCreateTx([24, 30, 200, 40, 5, 28, 7, 119], false); failed.meta.err = {};
  assert.strictEqual(findCreate(failed), null);
});

test('bonding curve flags', () => {
  const d = Buffer.alloc(81); d.writeBigUInt64LE(1000000000000000n, 40); d[48] = 1;
  const c = readCurve(d.toString('base64'));
  assert.strictEqual(c.complete, true);
  assert.strictEqual(c.totalSupplyRaw, 1000000000000000n);
  assert.strictEqual(readCurve(Buffer.alloc(10).toString('base64')), null);
});

test('errors never contain the RPC url or key', () => {
  const url = 'https://mainnet.helius-rpc.com/?api-key=SECRETKEY123';
  const out = scrub('failed calling ' + url + ' with SECRETKEY123', url);
  assert.ok(!out.includes('SECRETKEY123') && !out.includes('helius-rpc.com'));
});

test('probe rejects bad input and handles a wallet with no history', async () => {
  await assert.rejects(() => probe('nope', 'http://x'), /wallet address/);
  const fetchImpl = async () => ({ status: 200, json: async () => ({ result: [] }) });
  const r = await probe('11111111111111111111111111111112', 'http://rpc', fetchImpl);
  assert.strictEqual(r.launchesFound, 0);
  assert.deepStrictEqual(r.launches, []);
});

test('quick mode skips the launch scan', async () => {
  let calls = 0;
  const fetchImpl = async (u, o) => { calls++; const m = JSON.parse(o.body).method; return { status: 200, json: async () => ({ result: m === 'getSignaturesForAddress' ? [{ signature: 's1', blockTime: 1700000000, slot: 1, err: null }] : null }) }; };
  const r = await probe('11111111111111111111111111111112', 'http://rpc', fetchImpl, { lite: true });
  assert.strictEqual(r.mode, 'quick');
  assert.strictEqual(r.launches, undefined);
  assert.ok(calls <= 2, 'calls ' + calls);
});

test('curve address maths: wallets are on the curve, derived addresses are not, and encoding round trips', () => {
  const { isOnCurve, curveFor, b58encode } = require('../src/probe');
  assert.ok(isOnCurve(b58decode('EorUCLm8XFjpc9L6awowmWtKU8Bqk8Wa3SJ3GB2ubfFG')));
  const pda = curveFor('9dTY7gy58w2hdfh2LrnLRm8uEw9mTuPka6uWwrrRpump');
  assert.ok(!isOnCurve(b58decode(pda)));
  assert.strictEqual(b58encode(b58decode(pda)), pda);
  assert.strictEqual(curveFor('9dTY7gy58w2hdfh2LrnLRm8uEw9mTuPka6uWwrrRpump'), pda);
});

test('coin probe reads curve state, creator and holders from a fake RPC', async () => {
  const { probeCoin, curveFor, b58encode } = require('../src/probe');
  const mint = '9dTY7gy58w2hdfh2LrnLRm8uEw9mTuPka6uWwrrRpump';
  const curve = curveFor(mint);
  const creator = b58decode('EorUCLm8XFjpc9L6awowmWtKU8Bqk8Wa3SJ3GB2ubfFG');
  const d = Buffer.alloc(150);
  d.writeBigUInt64LE(500000000000000n, 8); d.writeBigUInt64LE(60000000000n, 16); d.writeBigUInt64LE(396550000000000n, 24); d.writeBigUInt64LE(15000000000n, 32); d.writeBigUInt64LE(1000000000000000n, 40);
  d[48] = 0; creator.copy(d, 49);
  const fetchImpl = async (u, o) => {
    const { method } = JSON.parse(o.body);
    const r = {
      getAccountInfo: { value: { owner: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', data: [d.toString('base64'), 'base64'] } },
      getTokenLargestAccounts: { value: [{ address: 'A1', amount: '400000000000000' }, { address: 'A2', amount: '50000000000000' }] },
      getMultipleAccounts: { value: [{ data: { parsed: { info: { owner: curve } } } }, { data: { parsed: { info: { owner: b58encode(creator) } } } }] },
      getTokenAccounts: { token_accounts: [{ amount: '5', owner: 'x' }, { amount: '0', owner: 'y' }] }
    }[method];
    return { status: 200, json: async () => ({ result: r }) };
  };
  const r = await probeCoin(mint, 'http://rpc', fetchImpl);
  assert.strictEqual(r.migrated, false);
  assert.strictEqual(r.creator, b58encode(creator));
  assert.strictEqual(r.curveProgressPct, 50);
  assert.strictEqual(r.top10Pct, 5);
  assert.strictEqual(r.creatorHoldsPct, 5);
  assert.strictEqual(r.holders, 1);
  await assert.rejects(() => probeCoin('bad', 'http://rpc', fetchImpl), /coin address/);
});

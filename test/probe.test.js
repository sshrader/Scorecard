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

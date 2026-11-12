# Scorecard

A developer scorecard for Solana token launches. Give it a creator wallet and it scores
the wallet from how that creator's past launches went: did they migrate, did the creator
dump, how concentrated were the holders.

**Status: runs on fake sample data.** Every number you see is invented. The page shows a
"SAMPLE DATA" badge to make that obvious. A live data source is the next step.

## Run it

```
npm start      # then open http://localhost:3000
npm test       # 14 tests
```

Needs Node 20 or newer. No dependencies to install.

## Put it in `D:\Repo\Scorecard` (Windows, PowerShell)

```
git clone https://github.com/sshrader/scorecard D:\Repo\Scorecard
cd D:\Repo\Scorecard
npm start
```

If the folder already exists, run `git pull` inside it instead.

## How the score works

Total is 0-100, built from six parts (`src/score.js`):

| Part | Weight | What it measures |
| --- | --- | --- |
| Migration rate | 30 | Share of finished launches that filled the curve and moved to a DEX |
| Rug history | 25 | Share of launches where the creator sold 50%+ of supply in the first hour |
| Dev holding | 15 | Median creator holding after 24h (some skin in the game scores best) |
| Holder spread | 10 | Top-10 holder share at 24h, excluding the curve |
| Peak strength | 10 | Median peak market cap, log scale ($10K = 0, $500K = 100) |
| Wallet transparency | 10 | Funding source, wallet age, linked wallets |

Bands: 70+ Strong, 40-69 Mixed, under 40 High risk. Fewer than 3 finished launches is
flagged "low confidence". Active launches are listed but not scored.

A score describes past behaviour. It does not predict a future launch and is not financial advice.

## Data sources

`src/data/index.js` picks the source from the `DATA_SOURCE` env var. Only `sample` exists today.
A real source must export:

- `getProfile(id)` returning `{ id, short, ageDays, funding, linkedWallets, launches: [...] }`
  where each launch has `name, ticker, launchedAt, active, migrated, peakMcapUsd,
  timeToPeakMin, devSoldPct1h, devHoldPct24h, top10Pct24h, holders24h`
- `listTrending()` returning the trending token rows
- `isSample: false`

Everything else (scoring, API, UI) already works from that shape.

## Layout

- `server.js` read-only JSON API plus static files (`/api/trending`, `/api/dev/:id`, `/healthz`)
- `src/score.js` scoring model
- `src/data/` data sources
- `public/` the web UI
- `docs/mockups/` the original design boards

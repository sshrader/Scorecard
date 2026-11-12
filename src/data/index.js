'use strict';
// The one place that picks where launch data comes from. Each source exports the same two functions:
//   getProfile(id)   -> { id, short, ageDays, funding, linkedWallets, launches: [...] } or null
//   listTrending()   -> [{ name, ticker, change1h, liquidityUsd, holders, padScore, dev }]
// See src/score.js for the shape of a launch. Add a live source here without touching the scoring or the page.

const source = (process.env.DATA_SOURCE || 'sample').toLowerCase();

if (source === 'sample') {
  module.exports = require('./sample');
} else {
  throw new Error('DATA_SOURCE "' + source + '" is not built yet. Use sample for now.');
}

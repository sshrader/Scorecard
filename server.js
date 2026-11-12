'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyse } = require('./src/score');
const data = require('./src/data');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function send(res, status, body, headers) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'"
  }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found');
  const type = TYPES[path.extname(file)];
  if (!type) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => (err ? send(res, 404, 'Not found') : send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': 'no-cache' })));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/healthz') return send(res, 200, { ok: true, sample: !!data.isSample });
    if (p === '/api/trending') {
      const list = await data.listTrending();
      const rows = [];
      for (const t of list) {
        const prof = await data.getProfile(t.dev);
        const a = prof ? analyse(prof) : null;
        rows.push({ ...t, devScore: a ? a.total : null, devVerdict: a ? a.verdict : null, devTone: a ? a.tone : null, devShort: prof ? prof.short : null, devCounts: a ? a.counts : null, devFinished: a ? a.finished : 0, lowConfidence: a ? a.lowConfidence : true });
      }
      return send(res, 200, { sample: !!data.isSample, tokens: rows });
    }
    const m = /^\/api\/dev\/([^/]+)$/.exec(p);
    if (m) {
      if (!ID_RE.test(m[1])) return send(res, 400, { error: 'Bad wallet id.' });
      const prof = await data.getProfile(m[1]);
      if (!prof) return send(res, 404, { error: 'No such creator wallet.' });
      return send(res, 200, { sample: !!data.isSample, dev: analyse(prof) });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
    return serveStatic(res, p);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Something went wrong.' });
  }
});

if (require.main === module) server.listen(PORT, () => console.log('Scorecard on http://localhost:' + PORT + (data.isSample ? ' (sample data)' : '')));
module.exports = server;

// server.js
// 依存パッケージ不要（Node 標準の http モジュールとグローバル fetch を使用）。
// - 静的ファイル(public/) を配信
// - GET /api/disasters で収集済みの災害情報(JSON)を返す（数分キャッシュ）

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectAll } from './src/collector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 3 * 60 * 1000; // 3分

// region ("world" | "japan") ごとに別々にキャッシュする
const caches = {
  world: { at: 0, data: null, inflight: null },
  japan: { at: 0, data: null, inflight: null },
};

async function getDisasters(region) {
  const cache = caches[region] || caches.japan;
  const fresh = Date.now() - cache.at < CACHE_TTL_MS && cache.data;
  if (fresh) return cache.data;
  if (cache.inflight) return cache.inflight; // 同時リクエストをまとめる
  cache.inflight = (async () => {
    try {
      const data = await collectAll({ region });
      cache.at = Date.now();
      cache.data = data;
      cache.inflight = null;
      return data;
    } catch (err) {
      cache.inflight = null;
      // 収集全体が失敗しても、古いキャッシュがあれば返す
      if (cache.data) return cache.data;
      throw err;
    }
  })();
  return cache.inflight;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  // パストラバーサル対策
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/disasters') {
    try {
      const region = searchParams.get('region') === 'world' ? 'world' : 'japan';
      const data = await getDisasters(region);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '災害情報の取得に失敗しました', detail: String(err?.message || err) }));
    }
    return;
  }

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cachedAt: { world: caches.world.at || null, japan: caches.japan.at || null } }));
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`災害情報マップ: http://localhost:${PORT} で起動しました`);
});

// server.js
// 静的ファイル(public/) を配信し、災害情報API・AIレポートAPIを提供する。
// - GET  /api/disasters  収集済みの災害情報(JSON)（数分キャッシュ）
// - POST /api/report     指定イベントのAIレポートを生成（要 ANTHROPIC_API_KEY）
// 収集部分は依存ゼロ。レポート部分のみ @anthropic-ai/sdk を（遅延）利用する。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectAll } from './src/collector.js';
import { generateReport } from './src/report.js';

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

// リクエストボディ(JSON)を上限付きで読み取る
function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

// レポートAPIのエラーをHTTPステータス+メッセージに対応付ける
const REPORT_ERRORS = {
  NO_API_KEY: [503, 'サーバーに ANTHROPIC_API_KEY が設定されていません。サーバー版で環境変数を設定してください。'],
  SDK_NOT_INSTALLED: [501, 'レポート機能には @anthropic-ai/sdk が必要です。サーバーで `npm install` を実行してください。'],
  BAD_INPUT: [400, 'イベントデータが不正です。'],
  BAD_JSON: [400, 'リクエストボディが不正です。'],
  TOO_LARGE: [413, 'リクエストが大きすぎます。'],
  REFUSED: [422, 'この内容のレポート生成は拒否されました。'],
  EMPTY: [502, 'レポートを生成できませんでした。'],
};

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/report' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const event = body && body.event ? body.event : body;
      const result = await generateReport(event);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ...result, generatedAt: new Date().toISOString() }));
    } catch (err) {
      const [status, message] = REPORT_ERRORS[err.code] || [500, 'レポート生成中にエラーが発生しました。'];
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: message, code: err.code || 'ERROR', detail: String(err.message || err) }));
    }
    return;
  }

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

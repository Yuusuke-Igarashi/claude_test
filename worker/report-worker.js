// report-worker.js — Cloudflare Worker
// 公開中の静的サイト(GitHub Pages 等)からAIレポート機能を使うためのバックエンド。
// APIキーを Worker のシークレットとして安全に保持し、CORS 越しに呼び出せるようにする。
// プロンプト構築・応答解析は src/report-core.js を共有（Nodeサーバー版と同一ロジック）。
//
// 環境変数(シークレット/変数):
//   ANTHROPIC_API_KEY  … Anthropic APIキー（必須・シークレット）
//   ANTHROPIC_MODEL    … 使用モデル（任意, 既定 claude-opus-4-8）
//   ALLOWED_ORIGIN     … CORS許可オリジン（推奨: 自分のPages URL, 例 https://xxx.github.io）
//
// デプロイ: worker/ ディレクトリで
//   npx wrangler secret put ANTHROPIC_API_KEY
//   npx wrangler deploy

import {
  DEFAULT_MODEL,
  WEB_SEARCH_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractResult,
} from '../src/report-core.js';

const ERR_STATUS = { NO_API_KEY: 503, BAD_INPUT: 400, BAD_JSON: 400, REFUSED: 422, EMPTY: 502, UPSTREAM: 502 };
const ERR_MSG = {
  NO_API_KEY: 'Worker に ANTHROPIC_API_KEY が設定されていません。`wrangler secret put ANTHROPIC_API_KEY` を実行してください。',
  BAD_INPUT: 'イベントデータが不正です。',
  BAD_JSON: 'リクエストボディが不正です。',
  REFUSED: 'この内容のレポート生成は拒否されました。',
  EMPTY: 'レポートを生成できませんでした。',
  UPSTREAM: 'Anthropic API 呼び出しでエラーが発生しました。',
};

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = allowed === '*' ? '*' : allowed === origin ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

async function callAnthropic(apiKey, model, event) {
  const messages = [{ role: 'user', content: buildUserPrompt(event) }];
  let data;
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL],
        messages,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw Object.assign(new Error('upstream ' + res.status), { code: 'UPSTREAM', detail });
    }
    data = await res.json();
    if (data.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: data.content });
      continue;
    }
    break;
  }
  if (data.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'REFUSED' });
  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // /api/report でも / でも受け付ける（Worker のルート次第）
    if (request.method !== 'POST') {
      return json({ error: 'POST してください', code: 'METHOD' }, 405, cors);
    }

    try {
      if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('no key'), { code: 'NO_API_KEY' });

      let body;
      try {
        body = await request.json();
      } catch {
        throw Object.assign(new Error('bad json'), { code: 'BAD_JSON' });
      }
      const event = body && body.event ? body.event : body;
      if (!event || typeof event !== 'object') throw Object.assign(new Error('bad input'), { code: 'BAD_INPUT' });

      const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
      const message = await callAnthropic(env.ANTHROPIC_API_KEY, model, event);
      const { markdown, sources } = extractResult(message);
      if (!markdown) throw Object.assign(new Error('empty'), { code: 'EMPTY' });

      return json({ markdown, sources, model, generatedAt: new Date().toISOString() }, 200, cors);
    } catch (err) {
      const code = err.code || 'ERROR';
      const status = ERR_STATUS[code] || 500;
      return json({ error: ERR_MSG[code] || 'エラーが発生しました。', code, detail: String(err.message || err) }, status, cors);
    }
  },
};

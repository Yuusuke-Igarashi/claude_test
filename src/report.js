// report.js
// 災害イベント1件について、Web検索で最新の関連情報を収集し、
// Claude(LLM)で日本語のレポートを生成する。
//
// - 公式 Anthropic SDK (@anthropic-ai/sdk) を使用（遅延ロード）。
//   SDK 未インストール時・APIキー未設定時は、扱いやすいエラーコードを投げる。
// - サーバー側でのみ実行する（APIキーを秘匿し、CORSを回避するため）。
//
// 必要な環境変数:
//   ANTHROPIC_API_KEY   … Anthropic APIキー（必須）
//   ANTHROPIC_MODEL     … 使用モデル（任意, 既定 claude-opus-4-8）

const DEFAULT_MODEL = 'claude-opus-4-8';

function reportError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const SYSTEM_PROMPT = `あなたは災害情報アナリストです。与えられた1件の災害イベントについて、
web_search ツールで最新の関連情報（報道・公式発表など）を収集し、日本語で簡潔なレポートを作成してください。

出力は次の Markdown 構成にしてください（見出しはそのまま使う）:

## 概要
## 現在の状況（最新情報）
## 想定される影響・被害
## 取るべき行動・注意点
## 情報源

ルール:
- 事実に基づいて書き、確認できない事項は「未確認」「推定」と明記する。
- 各セクションは要点を絞って簡潔に。誇張や不確かな断定は避ける。
- 参照した情報は本文中で根拠として用い、末尾の「情報源」に列挙する。
- 最後に「防災上の判断は必ず気象庁・自治体等の公式情報を確認してください」と添える。`;

function buildUserPrompt(ev) {
  const lines = [
    '次の災害イベントについて、Web検索で最新情報を調べてレポートを作成してください。',
    '',
    `- 種別: ${ev.type || '不明'}`,
    `- タイトル: ${ev.title || '(なし)'}`,
    `- 場所: ${ev.place || '不明'}`,
    ev.lat != null && ev.lon != null ? `- 座標: ${ev.lat}, ${ev.lon}` : null,
    ev.magnitude != null ? `- 規模: M${ev.magnitude}` : null,
    ev.time ? `- 発生時刻: ${ev.time}` : null,
    ev.source ? `- 一次情報源: ${ev.source}` : null,
    ev.description ? `- 補足: ${ev.description}` : null,
    '',
    'まず関連するニュースや公式発表を検索し、判明した最新情報をもとに上記構成でまとめてください。',
  ].filter(Boolean);
  return lines.join('\n');
}

// レスポンスから本文テキストと引用元(URL/タイトル)を取り出す
function extractResult(message) {
  let markdown = '';
  const sources = new Map(); // url -> title

  for (const block of message.content || []) {
    if (block.type === 'text') {
      markdown += block.text;
      for (const c of block.citations || []) {
        if (c.url) sources.set(c.url, c.title || c.url);
      }
    } else if (block.type === 'web_search_tool_result') {
      const content = block.content;
      if (Array.isArray(content)) {
        for (const r of content) {
          if (r && r.type === 'web_search_result' && r.url) {
            sources.set(r.url, r.title || r.url);
          }
        }
      }
    }
  }

  return {
    markdown: markdown.trim(),
    sources: [...sources.entries()].map(([url, title]) => ({ url, title })),
  };
}

/**
 * 災害イベントのレポートを生成する。
 * @param {object} event 共通スキーマの災害イベント
 * @returns {Promise<{markdown:string, sources:Array, model:string}>}
 */
export async function generateReport(event) {
  if (!event || typeof event !== 'object') {
    throw reportError('BAD_INPUT', 'イベントデータがありません');
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw reportError('NO_API_KEY', 'ANTHROPIC_API_KEY が設定されていません');
  }

  // SDK を遅延ロード（未インストールでも地図機能は動くようにする）
  let Anthropic;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
  } catch {
    throw reportError('SDK_NOT_INSTALLED', '@anthropic-ai/sdk が未インストールです');
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic();

  const messages = [{ role: 'user', content: buildUserPrompt(event) }];
  let message;
  // web_search はサーバー側でループ実行される。上限到達時は pause_turn を再開する。
  for (let i = 0; i < 6; i++) {
    message = await client.messages.create({
      model,
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages,
    });
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    break;
  }

  if (message.stop_reason === 'refusal') {
    throw reportError('REFUSED', 'モデルがこの内容の生成を拒否しました');
  }

  const { markdown, sources } = extractResult(message);
  if (!markdown) throw reportError('EMPTY', 'レポート本文を生成できませんでした');

  return { markdown, sources, model };
}

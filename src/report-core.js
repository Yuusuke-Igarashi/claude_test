// report-core.js
// AIレポート生成の「純粋な部分」（プロンプト構築・応答解析・共通定数）。
// 依存なし。Nodeサーバー版(src/report.js)と Cloudflare Worker の両方から使う。

export const DEFAULT_MODEL = 'claude-opus-4-8';

// web_search サーバーツール（Claude 自身がWeb検索・要約・引用を行う）
export const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };

export const SYSTEM_PROMPT = `あなたは災害情報アナリストです。与えられた1件の災害イベントについて、
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

export function buildUserPrompt(ev) {
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

// Messages API レスポンスから本文テキストと引用元(URL/タイトル)を取り出す
export function extractResult(message) {
  let markdown = '';
  const sources = new Map(); // url -> title

  for (const block of (message && message.content) || []) {
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

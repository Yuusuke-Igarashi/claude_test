// report.js（Nodeサーバー版）
// 災害イベント1件について、web_search で最新情報を収集し Claude でレポート生成する。
// 公式 Anthropic SDK (@anthropic-ai/sdk) を遅延ロードで使用。
// プロンプト構築・応答解析は src/report-core.js を共有（Worker版と同一ロジック）。
//
// 必要な環境変数:
//   ANTHROPIC_API_KEY   … Anthropic APIキー（必須）
//   ANTHROPIC_MODEL     … 使用モデル（任意, 既定 claude-opus-4-8）

import {
  DEFAULT_MODEL,
  WEB_SEARCH_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractResult,
} from './report-core.js';

function reportError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
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
      tools: [WEB_SEARCH_TOOL],
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

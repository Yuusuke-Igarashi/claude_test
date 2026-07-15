# AIレポート生成バックエンド（Cloudflare Worker）

公開中の静的サイト（GitHub Pages など）から「📄 AIレポート生成」を使うための、
軽量なサーバーレス関数です。APIキーを Worker のシークレットとして安全に保持し、
ブラウザからは Worker 経由で Anthropic API を呼び出します（キーはブラウザに出ません）。

## デプロイ手順

前提: [Cloudflare アカウント](https://dash.cloudflare.com/sign-up)（無料）と Node.js。

```bash
cd worker

# 1) Cloudflare にログイン
npx wrangler login

# 2) APIキーをシークレットとして登録（画面の指示に従い貼り付け）
npx wrangler secret put ANTHROPIC_API_KEY

# 3)（推奨）無断利用を防ぐため、許可オリジンを自分の公開URLに設定
#    wrangler.toml の ALLOWED_ORIGIN のコメントを外して自分のURLに変更するか、
#    次のように変数として設定:
#    npx wrangler deploy --var ALLOWED_ORIGIN:https://<ユーザー名>.github.io

# 4) デプロイ
npx wrangler deploy
```

デプロイ後、`https://disaster-report.<あなた>.workers.dev` のようなURLが表示されます。

## フロント側の設定

発行された Worker の URL を、リポジトリの **`public/config.js`** に設定してコミットします:

```js
window.APP_CONFIG = { reportApiUrl: "https://disaster-report.<あなた>.workers.dev" };
```

これで GitHub Pages 上のアプリからレポート生成が使えるようになります。
（`reportApiUrl` が空の場合は同一オリジンの `api/report`＝Nodeサーバー版を使います。）

## 設定できる変数

| 変数 | 種別 | 説明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | シークレット | Anthropic APIキー（必須） |
| `ANTHROPIC_MODEL` | 変数 | 使用モデル（既定 `claude-opus-4-8`） |
| `ALLOWED_ORIGIN` | 変数 | CORS許可オリジン（推奨。自分のPages URL） |

## 注意

- 生成物はWeb検索に基づくAIレポートです。正確性は保証されないため、公式情報を必ず確認してください。
- `ALLOWED_ORIGIN` を設定しないと誰でも Worker を呼べてしまい、APIクレジットを消費される可能性があります。必ず自分の公開URLに限定することを推奨します。

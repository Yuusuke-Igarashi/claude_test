// config.js — フロントエンド設定
//
// AIレポート生成のバックエンドURL。
// - 空文字のまま: 同一オリジンの `api/report`（Nodeサーバー版）を使用。
// - 静的サイト(GitHub Pages 等)で使う場合: デプロイした Cloudflare Worker の
//   URLをここに設定してコミットしてください（手順は worker/README.md）。
//   例: reportApiUrl: "https://disaster-report.example.workers.dev"
window.APP_CONFIG = {
  reportApiUrl: "",
};

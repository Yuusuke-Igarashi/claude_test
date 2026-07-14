# 🗺️ 災害情報マップ (Disaster Info Map)

Web上の災害情報を収集し、位置情報を付与して地図上にピンで表示するアプリです。
ピンにマウスを **ホバー** すると、その情報の詳細が別ウィンドウ（詳細パネル）に表示されます。

![概要](https://img.shields.io/badge/Node-%3E%3D18-brightgreen) ![deps](https://img.shields.io/badge/dependencies-none-blue)

## 特徴

- **Webから災害情報を自動収集** — 複数の公開ソースから最新の災害情報を取得
  - [USGS](https://earthquake.usgs.gov/) — 世界の地震（座標付き）
  - [P2P地震情報](https://www.p2pquake.net/) — 日本の地震・震度情報
  - [GDACS](https://www.gdacs.org/) — 世界のマルチハザード（洪水・台風・火山・山火事など）
- **位置情報の付与（ジオコーディング）** — 座標を持たない情報は地名から緯度経度を補完
  - 内蔵の日本地名辞書（オフライン対応） → OpenStreetMap Nominatim の順にフォールバック
- **地図表示** — [Leaflet](https://leafletjs.com/) + OpenStreetMap で世界地図上にピンを配置
  - 警戒度に応じてピンの色・サイズが変化（緑=低 / 黄=中 / 橙=高 / 赤=甚大）
- **ホバーで詳細を別ウィンドウ表示** — ピンにホバーすると詳細パネルが出現
  - クリックすると固定表示（モバイル対応）。× ボタンで閉じる
- **種別フィルタ** — 地震・洪水・台風などで絞り込み
- **依存パッケージゼロ** — Node標準機能のみ。`npm install` 不要
- **堅牢なフォールバック** — ライブソースに接続できない環境では同梱のサンプルデータを表示

## 動作要件

- Node.js **18以上**（グローバル `fetch` を使用）
- 最新の災害情報の取得・地図タイル・Leaflet の読み込みにはインターネット接続が必要

## 使い方

```bash
# リポジトリのディレクトリで
node server.js

# ブラウザで開く
open http://localhost:3000
```

ポートを変えたい場合:

```bash
PORT=8080 node server.js
```

## 仕組み

```
ブラウザ (public/)                サーバー (server.js, Node標準httpのみ)
┌────────────────────┐           ┌─────────────────────────────────┐
│ Leaflet 地図        │  GET      │ /api/disasters                  │
│ ・ピン描画          │ ───────▶  │   ├─ collector.js  各ソース収集  │
│ ・ホバー詳細ウィンドウ│ ◀─────── │   │   （3分キャッシュ）         │
│ ・種別フィルタ      │   JSON    │   └─ geocoder.js   位置情報付与  │
└────────────────────┘           └─────────────────────────────────┘
```

### ファイル構成

| パス | 役割 |
|------|------|
| `server.js` | 静的配信 + `/api/disasters` API（依存なし・3分キャッシュ） |
| `src/collector.js` | 各Webソースの収集と共通スキーマへの正規化 |
| `src/geocoder.js` | 地名 → 緯度経度の変換（内蔵辞書 + Nominatim） |
| `src/sample-data.js` | ライブ接続不可時のフォールバック用サンプル |
| `public/index.html` | 画面の骨組み・詳細ウィンドウの構造 |
| `public/app.js` | 地図描画・ピン配置・ホバー詳細ウィンドウ制御 |
| `public/styles.css` | スタイル |

### API

`GET /api/disasters` — 収集済みの災害情報を JSON で返します。

```jsonc
{
  "updatedAt": "2026-07-14T05:00:00.000Z",
  "count": 42,
  "sources": ["USGS", "P2P地震情報", "GDACS"],
  "errors": [],            // 取得に失敗したソース
  "usedFallback": false,   // true の場合サンプルデータ表示中
  "items": [
    {
      "id": "usgs-...", "source": "USGS", "type": "earthquake",
      "title": "M5.6 - off the coast of Fukushima",
      "place": "福島県沖", "lat": 37.5, "lon": 141.5,
      "magnitude": 5.6, "severity": 3,
      "time": "2026-07-14T02:13:00.000Z",
      "url": "https://earthquake.usgs.gov/...",
      "description": "..."
    }
  ]
}
```

## 注意事項

- 収集元の各APIには利用規約があります。過度なリクエストは避けてください（本アプリはサーバー側で3分キャッシュしています）。
- ジオコーディングに使う Nominatim は 1リクエスト/秒 の制限があるため、内蔵辞書で解決できない地名のみ問い合わせます。
- 表示される情報は各提供元のデータに依存します。防災上の判断は必ず気象庁・自治体等の公式情報をご確認ください。

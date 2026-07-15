# 🗺️ 災害情報マップ (Disaster Info Map)

Web上の災害情報を収集し、位置情報を付与して地図上にピンで表示するアプリです。
ピンにマウスを **ホバー** すると、その情報の詳細が別ウィンドウ（詳細パネル）に表示されます。

![概要](https://img.shields.io/badge/Node-%3E%3D18-brightgreen) ![deps](https://img.shields.io/badge/dependencies-none-blue)

## 特徴

- **世界版／日本版の切り替え** — ヘッダーのトグルで表示範囲と情報源を切り替え
  - 🌏 **世界版**: 全世界。USGS（地震）＋ GDACS（洪水・台風・火山など）＋ P2P地震情報
  - 🇯🇵 **日本版**: 日本にフォーカスし、**より多様な情報源**から収集（下記）
- **Webから災害情報を自動収集**
  - **世界版のソース**
    - [USGS](https://earthquake.usgs.gov/) — 世界の地震
    - [GDACS](https://www.gdacs.org/) — 世界のマルチハザード（洪水・台風・火山・山火事など）
    - [P2P地震情報](https://www.p2pquake.net/) — 日本の地震・震度情報
  - **日本版のソース（多様化）**
    - [気象庁 地震情報](https://www.jma.go.jp/bosai/map.html)（公式）
    - [気象庁 気象警報・注意報](https://www.jma.go.jp/bosai/warning/) — 全国47府県予報区（大雨・洪水・暴風・大雪・波浪・高潮・特別警報など）
    - [P2P地震情報] — 地震（551）＋ **津波予報（552）**
    - USGS（日本周辺に絞り込み）／ GDACS（日本に絞り込み）
- **位置情報の付与（ジオコーディング）** — 座標を持たない情報は地名から緯度経度を補完
  - 気象庁の座標(ISO6709)を解析、内蔵の日本地名辞書、OpenStreetMap Nominatim の順にフォールバック
- **地図表示** — [Leaflet](https://leafletjs.com/) + OpenStreetMap。範囲切替で地図も自動で移動
  - 警戒度に応じてピンの色・サイズが変化（緑=低 / 黄=中 / 橙=高 / 赤=甚大）
- **ホバーで詳細を別ウィンドウ表示** — ピンにホバーすると詳細パネルが出現
  - クリックすると固定表示（モバイル対応）。× ボタンで閉じる
- **種別フィルタ** — 地震・津波・気象警報・洪水・台風などで絞り込み
- **依存パッケージゼロ** — Node標準機能のみ。`npm install` 不要
- **堅牢なフォールバック** — 一部ソースが失敗しても取得できた分を表示。全滅時のみ同梱サンプルを表示

## 2つの動作モード

このアプリは同じコードで **2通り** に動きます。

| モード | 起動 | データ収集 | 用途 |
|--------|------|-----------|------|
| **① 静的Webアプリ（サーバー不要）** | `public/` を配信するだけ | ブラウザから直接収集 | GitHub Pages 等での公開 |
| **② Nodeサーバー版** | `node server.js` | サーバー側で収集（CORS回避・3分キャッシュ） | ローカル利用・自前ホスティング |

フロントは起動時に `api/disasters`（サーバー）を探し、無ければ自動でブラウザ収集にフォールバックします。

## 使い方

### ① 静的Webアプリとして公開（GitHub Pages）

1. このリポジトリを GitHub に push
2. リポジトリの **Settings › Pages › Build and deployment** の **Source** を **「GitHub Actions」** に設定
3. `main` ブランチへ push すると `.github/workflows/pages.yml` が `public/` を自動デプロイ
4. 発行された URL（例: `https://<ユーザー名>.github.io/claude_test/`）をブラウザで開く

> ブラウザから各APIを直接叩くため、ライブ表示は各ソースのCORS許可に依存します。
> USGS（世界の地震）はCORS対応で確実に表示され、接続できないソースは自動でスキップ、
> すべて失敗した場合は同梱のサンプルデータを表示します。

ローカルで静的モードを試すには、任意の静的サーバーで `public/` を配信します:

```bash
npx serve public      # または: python3 -m http.server -d public 8000
```

### ② Nodeサーバー版（依存ゼロ）

```bash
node server.js
# ブラウザで http://localhost:3000 を開く
PORT=8080 node server.js   # ポート変更
```

## 動作要件

- 静的モード: モダンブラウザのみ（Node不要）
- サーバー版: Node.js **18以上**（グローバル `fetch` を使用）
- いずれも地図タイル・Leaflet の読み込み・最新情報の取得にインターネット接続が必要

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
| `src/sample-data.js` | ライブ接続不可時のフォールバック用サンプル（サーバー用） |
| `public/index.html` | 画面の骨組み・詳細ウィンドウの構造 |
| `public/app.js` | 地図描画・ピン配置・ホバー詳細ウィンドウ制御 |
| `public/styles.css` | スタイル |
| `public/collector-client.js` | 静的モード用: ブラウザから直接収集するコレクター |
| `public/sample-data.js` | 静的モード用フォールバックサンプル（ブラウザ用） |
| `.github/workflows/pages.yml` | `public/` を GitHub Pages に自動デプロイ |

### API

`GET /api/disasters?region=japan|world` — 収集済みの災害情報を JSON で返します。
`region` は `japan`（既定）または `world`。region ごとに3分キャッシュします。

```jsonc
{
  "updatedAt": "2026-07-14T05:00:00.000Z",
  "region": "japan",
  "count": 42,
  "sources": ["気象庁(地震)", "気象庁(気象警報)", "P2P地震情報", "P2P地震情報(津波)", "USGS", "GDACS"],
  "errors": [],            // 取得に失敗したソース（失敗しても他ソースは表示）
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

// sample-data.js
// ライブのWebソースが全て取得できない場合（オフライン・レート制限・
// ネットワーク制限環境など）のフォールバック用サンプルデータ。
// 実運用ではライブソースが優先され、これは使われない。
// 形式は collector.js の共通スキーマに準拠。

export const SAMPLE_DISASTERS = [
  {
    id: 'sample-eq-1', source: 'サンプル', type: 'earthquake',
    title: '福島県沖 最大震度5弱', place: '福島県沖',
    description: '震源: 福島県沖 / 深さ 50 km / M5.6 / 最大震度 5弱',
    lat: 37.5, lon: 141.5, magnitude: 5.6, severity: 3,
    time: '2026-07-14T02:13:00.000Z', url: 'https://www.jma.go.jp/',
  },
  {
    id: 'sample-eq-2', source: 'サンプル', type: 'earthquake',
    title: '熊本県熊本地方 最大震度4', place: '熊本県熊本地方',
    description: '震源: 熊本県熊本地方 / 深さ 10 km / M4.2 / 最大震度 4',
    lat: 32.79, lon: 130.74, magnitude: 4.2, severity: 2,
    time: '2026-07-13T18:40:00.000Z', url: 'https://www.jma.go.jp/',
  },
  {
    id: 'sample-eq-3', source: 'サンプル', type: 'earthquake',
    title: 'M6.1 - off the coast of Japan', place: '三陸沖',
    description: '震源: 三陸沖 / マグニチュード 6.1 / 深さ 30 km',
    lat: 39.5, lon: 143.5, magnitude: 6.1, severity: 4,
    time: '2026-07-13T09:22:00.000Z', url: 'https://earthquake.usgs.gov/',
  },
  {
    id: 'sample-fl-1', source: 'サンプル', type: 'flood',
    title: '大雨による洪水警報（九州北部）', place: '福岡県',
    description: '洪水 / 日本 / 警戒レベル: Orange / 記録的短時間大雨情報',
    lat: 33.6, lon: 130.42, magnitude: null, severity: 3,
    time: '2026-07-14T05:00:00.000Z', url: 'https://www.jma.go.jp/',
  },
  {
    id: 'sample-tc-1', source: 'サンプル', type: 'cyclone',
    title: '台風6号 沖縄本島に接近', place: '沖縄県',
    description: '台風・サイクロン / 日本 / 警戒レベル: Red / 最大瞬間風速 55m/s',
    lat: 26.21, lon: 127.68, magnitude: null, severity: 4,
    time: '2026-07-14T00:00:00.000Z', url: 'https://www.gdacs.org/',
  },
  {
    id: 'sample-vo-1', source: 'サンプル', type: 'volcano',
    title: '桜島 噴火（噴煙3000m）', place: '鹿児島県',
    description: '火山 / 日本 / 警戒レベル: Orange / 噴火警戒レベル3',
    lat: 31.585, lon: 130.657, magnitude: null, severity: 3,
    time: '2026-07-13T12:10:00.000Z', url: 'https://www.jma.go.jp/',
  },
  {
    id: 'sample-fl-2', source: 'サンプル', type: 'flood',
    title: 'Severe flooding in Jakarta', place: 'Indonesia',
    description: '洪水 / Indonesia / 警戒レベル: Red',
    lat: -6.2, lon: 106.82, magnitude: null, severity: 4,
    time: '2026-07-12T22:00:00.000Z', url: 'https://www.gdacs.org/',
  },
  {
    id: 'sample-eq-4', source: 'サンプル', type: 'earthquake',
    title: 'M5.4 - Central California', place: 'California, USA',
    description: '震源: Central California / マグニチュード 5.4 / 深さ 8 km',
    lat: 36.6, lon: -121.2, magnitude: 5.4, severity: 3,
    time: '2026-07-13T14:05:00.000Z', url: 'https://earthquake.usgs.gov/',
  },
  {
    id: 'sample-wf-1', source: 'サンプル', type: 'wildfire',
    title: 'Wildfire alert - Southern Europe', place: 'Greece',
    description: '山火事 / Greece / 警戒レベル: Orange',
    lat: 37.98, lon: 23.72, magnitude: null, severity: 3,
    time: '2026-07-12T16:30:00.000Z', url: 'https://www.gdacs.org/',
  },
  {
    id: 'sample-ts-1', source: 'サンプル', type: 'tsunami',
    title: '津波注意報（伊豆諸島）', place: '伊豆大島近海',
    description: '津波 / 日本 / 警戒レベル: Orange / 予想される津波の高さ 1m',
    lat: 34.7, lon: 139.4, magnitude: null, severity: 3,
    time: '2026-07-14T02:20:00.000Z', url: 'https://www.jma.go.jp/',
  },
];

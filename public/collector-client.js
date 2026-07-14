// collector-client.js
// サーバーが無い静的ホスティング(GitHub Pages 等)向けに、ブラウザから直接
// 災害情報を収集するクライアント版コレクター。
// server 版 (src/collector.js) と同じ共通スキーマ・同じソースを扱う。
//
// 使い方: window.DisasterCollector.collect() -> Promise<{items, ...}>
//
// 注意: ブラウザから外部APIを叩くため、各ソースのCORS許可に依存する。
//   - USGS: CORS対応（確実に取得可能）
//   - P2P地震情報 / GDACS: CORSが許可されていれば取得、ダメなら個別にスキップ
//   すべて失敗した場合は同梱のサンプルデータにフォールバックする。
//   ジオコーディングは Nominatim の利用規約に配慮し、内蔵辞書のみを使用。

(function () {
  'use strict';

  const HAZARD_LABELS = {
    earthquake: '地震', tsunami: '津波', flood: '洪水', cyclone: '台風・サイクロン',
    volcano: '火山', drought: '干ばつ', wildfire: '山火事', other: 'その他',
  };

  // --- 内蔵地名辞書（位置情報付与用・オフライン対応の抜粋） ---
  const GAZETTEER = {
    '北海道': [43.0642, 141.3469], '青森県': [40.8244, 140.74], '岩手県': [39.7036, 141.1527],
    '宮城県': [38.2688, 140.8721], '秋田県': [39.7186, 140.1024], '山形県': [38.2404, 140.3633],
    '福島県': [37.7503, 140.4676], '茨城県': [36.3418, 140.4468], '栃木県': [36.5657, 139.8836],
    '群馬県': [36.3907, 139.0604], '埼玉県': [35.857, 139.6489], '千葉県': [35.6051, 140.1233],
    '東京都': [35.6895, 139.6917], '神奈川県': [35.4478, 139.6425], '新潟県': [37.9026, 139.0236],
    '富山県': [36.6953, 137.2114], '石川県': [36.5947, 136.6256], '福井県': [36.0652, 136.2216],
    '山梨県': [35.6642, 138.5684], '長野県': [36.6513, 138.181], '岐阜県': [35.3912, 136.7223],
    '静岡県': [34.9769, 138.3831], '愛知県': [35.1802, 136.9066], '三重県': [34.7303, 136.5086],
    '滋賀県': [35.0045, 135.8686], '京都府': [35.0212, 135.7556], '大阪府': [34.6863, 135.52],
    '兵庫県': [34.6913, 135.183], '奈良県': [34.6851, 135.8329], '和歌山県': [34.226, 135.1675],
    '鳥取県': [35.5039, 134.2377], '島根県': [35.4723, 133.0505], '岡山県': [34.6618, 133.935],
    '広島県': [34.3966, 132.4596], '山口県': [34.1859, 131.4706], '徳島県': [34.0658, 134.5593],
    '香川県': [34.3401, 134.0434], '愛媛県': [33.8416, 132.7657], '高知県': [33.5597, 133.5311],
    '福岡県': [33.6064, 130.4181], '佐賀県': [33.2494, 130.2988], '長崎県': [32.7448, 129.8737],
    '熊本県': [32.7898, 130.7417], '大分県': [33.2382, 131.6126], '宮崎県': [31.9111, 131.4239],
    '鹿児島県': [31.5602, 130.5581], '沖縄県': [26.2124, 127.6809],
    '三陸沖': [39.5, 143.5], '福島県沖': [37.5, 141.5], '宮城県沖': [38.3, 142.0],
    '茨城県沖': [36.3, 141.0], '千葉県東方沖': [35.3, 140.9], '相模湾': [35.1, 139.3],
    '駿河湾': [34.8, 138.5], '紀伊水道': [34.0, 135.0], '日向灘': [32.0, 132.0],
    '東京湾': [35.4, 139.8], '伊豆大島近海': [34.7, 139.4], '種子島近海': [30.5, 131.0],
  };

  function geocode(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    if (GAZETTEER[n]) return GAZETTEER[n];
    for (const key in GAZETTEER) if (n.includes(key)) return GAZETTEER[key];
    return null;
  }

  function isValidCoord(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' &&
      isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  }

  // --- helpers ---
  const magToSeverity = (m) => (m == null ? 1 : m >= 6 ? 4 : m >= 5 ? 3 : m >= 4 ? 2 : 1);
  const scaleToText = (s) => ({ 10:'1',20:'2',30:'3',40:'4',45:'5弱',50:'5強',55:'6弱',60:'6強',70:'7' }[s] || '不明');
  const scaleToSeverity = (s) => (s == null ? 1 : s >= 55 ? 4 : s >= 45 ? 3 : s >= 30 ? 2 : 1);
  const tsunamiText = (v) => ({ None:'なし',Unknown:'不明',Checking:'調査中',NonEffective:'若干の海面変動',Watch:'注意報',Warning:'警報' }[v] || v);
  const gdacsType = (t) => ({ EQ:'earthquake',TC:'cyclone',FL:'flood',VO:'volcano',DR:'drought',WF:'wildfire',TS:'tsunami' }[t] || 'other');
  const gdacsSeverity = (l) => ({ Green:1,Orange:3,Red:4 }[l] || 2);
  const stripHtml = (s) => String(s).replace(/<[^>]*>/g, '').trim();

  function buildP2PDesc(h, eq) {
    const p = [];
    if (h.name) p.push('震源: ' + h.name);
    if (typeof h.depth === 'number' && h.depth >= 0) p.push('深さ ' + h.depth + ' km');
    if (typeof h.magnitude === 'number' && h.magnitude !== -1) p.push('M' + h.magnitude);
    p.push('最大震度 ' + scaleToText(eq.maxScale));
    if (eq.domesticTsunami) p.push('津波: ' + tsunamiText(eq.domesticTsunami));
    return p.join(' / ');
  }

  // --- sources ---
  async function collectUSGS() {
    const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    const out = [];
    for (const f of data.features || []) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      const lon = c[0], lat = c[1];
      if (!isValidCoord(lat, lon)) continue;
      const p = f.properties || {};
      out.push({
        id: 'usgs-' + f.id, source: 'USGS', type: 'earthquake',
        title: p.title || ('M' + p.mag + ' 地震'),
        description: '震源: ' + (p.place || '不明') + ' / マグニチュード ' + (p.mag != null ? p.mag : '?') + ' / 深さ ' + (c[2] != null ? c[2] : '?') + ' km',
        place: p.place || '', lat, lon, magnitude: p.mag != null ? p.mag : null,
        severity: magToSeverity(p.mag), time: p.time ? new Date(p.time).toISOString() : null,
        url: p.url || '',
      });
    }
    return out;
  }

  async function collectP2PQuake() {
    const data = await fetchJson('https://api.p2pquake.net/v2/history?codes=551&limit=30');
    const out = [];
    for (const item of Array.isArray(data) ? data : []) {
      const eq = item.earthquake || {}, h = eq.hypocenter || {};
      let lat = typeof h.latitude === 'number' && h.latitude !== -200 ? h.latitude : null;
      let lon = typeof h.longitude === 'number' && h.longitude !== -200 ? h.longitude : null;
      if (!isValidCoord(lat, lon)) {
        const g = geocode(h.name); // 座標欠落時は地名から付与
        if (g) { lat = g[0]; lon = g[1]; } else continue;
      }
      out.push({
        id: 'p2p-' + item.id, source: 'P2P地震情報', type: 'earthquake',
        title: (h.name || '日本') + ' 最大震度' + scaleToText(eq.maxScale),
        description: buildP2PDesc(h, eq), place: h.name || '', lat, lon,
        magnitude: typeof h.magnitude === 'number' && h.magnitude !== -1 ? h.magnitude : null,
        severity: scaleToSeverity(eq.maxScale),
        time: eq.time ? new Date(eq.time.replace(' ', 'T') + '+09:00').toISOString() : null,
        url: 'https://www.p2pquake.net/',
      });
    }
    return out;
  }

  async function collectGDACS() {
    const data = await fetchJson('https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP');
    const out = [];
    for (const f of data.features || []) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      const lon = c[0], lat = c[1];
      if (!isValidCoord(lat, lon)) continue;
      const p = f.properties || {};
      const type = gdacsType(p.eventtype);
      out.push({
        id: 'gdacs-' + p.eventtype + '-' + p.eventid, source: 'GDACS', type,
        title: p.htmldescription ? stripHtml(p.htmldescription).slice(0, 80) : (HAZARD_LABELS[type] + ' (' + (p.country || '海外') + ')'),
        description: HAZARD_LABELS[type] + ' / ' + (p.country || '不明') + ' / 警戒レベル: ' + (p.alertlevel || 'Green') + (p.name ? ' / ' + p.name : ''),
        place: p.country || '', lat, lon, magnitude: null, severity: gdacsSeverity(p.alertlevel),
        time: p.fromdate ? new Date(p.fromdate).toISOString() : null,
        url: (p.url && (p.url.report || p.url.details)) || 'https://www.gdacs.org/',
      });
    }
    return out;
  }

  async function collect() {
    const tasks = [
      { name: 'USGS', fn: collectUSGS },
      { name: 'P2P地震情報', fn: collectP2PQuake },
      { name: 'GDACS', fn: collectGDACS },
    ];
    const settled = await Promise.allSettled(tasks.map((t) => t.fn()));
    const errors = [];
    let items = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') items = items.concat(r.value);
      else errors.push({ source: tasks[i].name, error: String((r.reason && r.reason.message) || r.reason) });
    });

    let mapped = items.filter((it) => isValidCoord(it.lat, it.lon));
    let usedFallback = false;
    if (mapped.length === 0) {
      mapped = (window.SAMPLE_DISASTERS || []).slice();
      usedFallback = true;
    }
    mapped.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

    return {
      updatedAt: new Date().toISOString(), count: mapped.length,
      sources: tasks.map((t) => t.name), errors, usedFallback, items: mapped,
    };
  }

  window.DisasterCollector = { collect };
})();

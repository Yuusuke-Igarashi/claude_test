// collector-client.js
// 静的ホスティング(GitHub Pages 等)向け・ブラウザから直接収集するコレクター。
// region ("world" | "japan") でモードを切り替える。
//   - world: USGS(全世界) + GDACS(全世界) + P2P地震情報
//   - japan: 日本にフォーカスし、より多様な情報源から収集
//       気象庁 地震 / 気象庁 気象警報・注意報 / P2P(地震+津波) / USGS(日本周辺) / GDACS(日本)
// すべての取得は個別に try/catch し、失敗したソースはスキップ。
// 全滅時は同梱サンプルにフォールバックする。
// 使い方: window.DisasterCollector.collect("japan") -> Promise<{items, ...}>

(function () {
  'use strict';

  const HAZARD_LABELS = {
    earthquake: '地震', tsunami: '津波', flood: '洪水', cyclone: '台風・サイクロン',
    volcano: '火山', drought: '干ばつ', wildfire: '山火事', warning: '気象警報', other: 'その他',
  };

  // 都道府県 + 主要海域の代表座標（位置情報付与用）
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
    '能登半島': [37.3, 137.0], '能登半島沖': [37.5, 137.3],
  };

  // 気象庁 府県予報区コード -> 都道府県名（気象警報の取得に使用。座標は GAZETTEER から）
  const JMA_OFFICES = {
    '016000': '北海道', '020000': '青森県', '030000': '岩手県', '040000': '宮城県', '050000': '秋田県',
    '060000': '山形県', '070000': '福島県', '080000': '茨城県', '090000': '栃木県', '100000': '群馬県',
    '110000': '埼玉県', '120000': '千葉県', '130000': '東京都', '140000': '神奈川県', '150000': '新潟県',
    '160000': '富山県', '170000': '石川県', '180000': '福井県', '190000': '山梨県', '200000': '長野県',
    '210000': '岐阜県', '220000': '静岡県', '230000': '愛知県', '240000': '三重県', '250000': '滋賀県',
    '260000': '京都府', '270000': '大阪府', '280000': '兵庫県', '290000': '奈良県', '300000': '和歌山県',
    '310000': '鳥取県', '320000': '島根県', '330000': '岡山県', '340000': '広島県', '350000': '山口県',
    '360000': '徳島県', '370000': '香川県', '380000': '愛媛県', '390000': '高知県', '400000': '福岡県',
    '410000': '佐賀県', '420000': '長崎県', '430000': '熊本県', '440000': '大分県', '450000': '宮崎県',
    '460100': '鹿児島県', '471000': '沖縄県',
  };

  // 気象警報・注意報コード -> 名称
  const JMA_WARN = {
    '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風警報', '06': '大雪警報',
    '07': '波浪警報', '08': '高潮警報', '10': '大雨注意報', '12': '大雪注意報', '13': '風雪注意報',
    '14': '雷注意報', '15': '強風注意報', '16': '波浪注意報', '18': '洪水注意報', '19': '高潮注意報',
    '20': '濃霧注意報', '21': '乾燥注意報', '22': 'なだれ注意報', '23': '低温注意報', '24': '霜注意報',
    '25': '着氷注意報', '26': '着雪注意報', '27': '融雪注意報',
    '32': '大雨特別警報', '33': '暴風特別警報', '35': '暴風雪特別警報', '36': '大雪特別警報',
    '37': '波浪特別警報', '38': '高潮特別警報',
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
  function inJapan(lat, lon) { return lat >= 24 && lat <= 46 && lon >= 122 && lon <= 150; }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  }

  // --- 共通ヘルパー ---
  const magToSeverity = (m) => (m == null ? 1 : m >= 6 ? 4 : m >= 5 ? 3 : m >= 4 ? 2 : 1);
  const scaleToText = (s) => ({ 10:'1',20:'2',30:'3',40:'4',45:'5弱',50:'5強',55:'6弱',60:'6強',70:'7' }[s] || '不明');
  const scaleToSeverity = (s) => (s == null ? 1 : s >= 55 ? 4 : s >= 45 ? 3 : s >= 30 ? 2 : 1);
  const tsunamiText = (v) => ({ None:'なし',Unknown:'不明',Checking:'調査中',NonEffective:'若干の海面変動',Watch:'注意報',Warning:'警報' }[v] || v);
  const gdacsType = (t) => ({ EQ:'earthquake',TC:'cyclone',FL:'flood',VO:'volcano',DR:'drought',WF:'wildfire',TS:'tsunami' }[t] || 'other');
  const gdacsSeverity = (l) => ({ Green:1,Orange:3,Red:4 }[l] || 2);
  const stripHtml = (s) => String(s).replace(/<[^>]*>/g, '').trim();

  // JMA 震央標高文字列(ISO6709)から座標を取り出す: "+37.5+137.2-10000/" -> [37.5,137.2]
  function parseCod(cod) {
    if (!cod) return null;
    const m = String(cod).match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    return isValidCoord(lat, lon) ? [lat, lon] : null;
  }
  const jmaIntText = (i) => ({ '5-':'5弱','5+':'5強','6-':'6弱','6+':'6強' }[i] || i || '不明');
  function jmaIntSeverity(i) {
    if (!i) return 1;
    if (i === '7' || i.startsWith('6')) return 4;
    if (i.startsWith('5')) return 3;
    if (i === '4' || i === '3') return 2;
    return 1;
  }

  // P2P の時刻 "2026/07/14 10:00:00" (JST) を ISO 文字列へ。失敗時は null。
  function p2pTimeToISO(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(/\//g, '-').replace(' ', 'T') + '+09:00');
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function buildP2PDesc(h, eq) {
    const p = [];
    if (h.name) p.push('震源: ' + h.name);
    if (typeof h.depth === 'number' && h.depth >= 0) p.push('深さ ' + h.depth + ' km');
    if (typeof h.magnitude === 'number' && h.magnitude !== -1) p.push('M' + h.magnitude);
    p.push('最大震度 ' + scaleToText(eq.maxScale));
    if (eq.domesticTsunami) p.push('津波: ' + tsunamiText(eq.domesticTsunami));
    return p.join(' / ');
  }

  // ===========================================================================
  // 世界版ソース
  // ===========================================================================
  async function collectUSGS(japanOnly) {
    const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    const out = [];
    for (const f of data.features || []) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      const lon = c[0], lat = c[1];
      if (!isValidCoord(lat, lon)) continue;
      if (japanOnly && !inJapan(lat, lon)) continue;
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

  async function collectGDACS(japanOnly) {
    const data = await fetchJson('https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP');
    const out = [];
    for (const f of data.features || []) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      const lon = c[0], lat = c[1];
      if (!isValidCoord(lat, lon)) continue;
      const p = f.properties || {};
      const isJp = (p.country && String(p.country).includes('Japan')) || inJapan(lat, lon);
      if (japanOnly && !isJp) continue;
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

  // P2P 地震情報 (code 551)
  async function collectP2PQuake() {
    const data = await fetchJson('https://api.p2pquake.net/v2/history?codes=551&limit=30');
    const out = [];
    for (const item of Array.isArray(data) ? data : []) {
      const eq = item.earthquake || {}, h = eq.hypocenter || {};
      let lat = typeof h.latitude === 'number' && h.latitude !== -200 ? h.latitude : null;
      let lon = typeof h.longitude === 'number' && h.longitude !== -200 ? h.longitude : null;
      if (!isValidCoord(lat, lon)) {
        const g = geocode(h.name);
        if (g) { lat = g[0]; lon = g[1]; } else continue;
      }
      out.push({
        id: 'p2p-' + item.id, source: 'P2P地震情報', type: 'earthquake',
        title: (h.name || '日本') + ' 最大震度' + scaleToText(eq.maxScale),
        description: buildP2PDesc(h, eq), place: h.name || '', lat, lon,
        magnitude: typeof h.magnitude === 'number' && h.magnitude !== -1 ? h.magnitude : null,
        severity: scaleToSeverity(eq.maxScale),
        time: p2pTimeToISO(eq.time),
        url: 'https://www.p2pquake.net/',
      });
    }
    return out;
  }

  // ===========================================================================
  // 日本版・追加ソース
  // ===========================================================================

  // 気象庁 地震情報 (公式)
  async function collectJMAQuake() {
    const data = await fetchJson('https://www.jma.go.jp/bosai/quake/data/list.json');
    const out = [];
    for (const e of (Array.isArray(data) ? data : []).slice(0, 30)) {
      let coords = parseCod(e.cod);
      if (!coords) coords = geocode(e.anm);
      if (!coords) continue;
      const maxi = e.maxi || '';
      const mag = e.mag && e.mag !== 'NaN' ? e.mag : null;
      out.push({
        id: 'jmaq-' + (e.eid || e.ctt), source: '気象庁(地震)', type: 'earthquake',
        title: (e.anm || '日本') + (maxi ? ' 最大震度' + jmaIntText(maxi) : (mag ? ' M' + mag : '')),
        description: '震源: ' + (e.anm || '不明') + (mag ? ' / M' + mag : '') + (maxi ? ' / 最大震度' + jmaIntText(maxi) : ''),
        place: e.anm || '', lat: coords[0], lon: coords[1],
        magnitude: mag ? parseFloat(mag) : null, severity: jmaIntSeverity(maxi),
        time: e.at ? new Date(e.at).toISOString() : null,
        url: 'https://www.jma.go.jp/bosai/map.html#contents=earthquake',
      });
    }
    return out;
  }

  // P2P 津波予報 (code 552)
  async function collectP2PTsunami() {
    const data = await fetchJson('https://api.p2pquake.net/v2/history?codes=552&limit=10');
    const out = [];
    const gradeSev = { MajorWarning: 4, Warning: 3, Watch: 2, Unknown: 2 };
    for (const item of Array.isArray(data) ? data : []) {
      if (item.cancelled) continue;
      const seen = new Set();
      for (const a of item.areas || []) {
        const g = geocode(a.name);
        if (!g) continue;
        if (seen.has(a.name)) continue;
        seen.add(a.name);
        out.push({
          id: 'p2pt-' + item.id + '-' + a.name, source: 'P2P地震情報(津波)', type: 'tsunami',
          title: (a.name || '沿岸') + ' 津波' + (a.grade === 'MajorWarning' ? '大津波警報' : a.grade === 'Warning' ? '警報' : '注意報'),
          description: '津波予報: ' + (a.name || '') + ' / ' + (a.grade || '') + (a.maxHeight && a.maxHeight.description ? ' / ' + a.maxHeight.description : ''),
          place: a.name || '', lat: g[0], lon: g[1], magnitude: null,
          severity: gradeSev[a.grade] || 2,
          time: p2pTimeToISO(item.time),
          url: 'https://www.p2pquake.net/',
        });
      }
    }
    return out;
  }

  // 気象庁 気象警報・注意報 (全国47府県予報区・都道府県ごとに集約)
  async function collectJMAWarnings() {
    const codes = Object.keys(JMA_OFFICES);
    const settled = await Promise.allSettled(
      codes.map((code) =>
        fetchJson('https://www.jma.go.jp/bosai/warning/data/warning/' + code + '.json')
          .then((data) => ({ code, data }))
      )
    );
    const out = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      const { code, data } = r.value;
      const pref = JMA_OFFICES[code];
      const g = GAZETTEER[pref];
      if (!g) continue;
      const active = new Set();
      for (const at of data.areaTypes || []) {
        for (const a of at.areas || []) {
          for (const w of a.warnings || []) {
            if (w.status && !['解除', 'なし', ''].includes(w.status) && JMA_WARN[w.code]) active.add(w.code);
          }
        }
      }
      if (active.size === 0) continue;
      const codesArr = [...active];
      const names = codesArr.map((c) => JMA_WARN[c]);
      let sev = 2;
      for (const c of codesArr) {
        const n = parseInt(c, 10);
        if (n >= 32) sev = Math.max(sev, 4);
        else if (n >= 2 && n <= 8) sev = Math.max(sev, 3);
      }
      out.push({
        id: 'jmaw-' + code, source: '気象庁(気象警報)', type: 'warning',
        title: pref + ' ' + (sev >= 4 ? '特別警報' : sev >= 3 ? '気象警報' : '気象注意報'),
        description: pref + ' 発表中: ' + names.join('、'),
        place: pref, lat: g[0], lon: g[1], magnitude: null, severity: sev,
        time: data.reportDatetime ? new Date(data.reportDatetime).toISOString() : null,
        url: 'https://www.jma.go.jp/bosai/warning/',
      });
    }
    return out;
  }

  // ===========================================================================
  async function collect(region) {
    const isJapan = region === 'japan';
    const tasks = isJapan
      ? [
          { name: '気象庁(地震)', fn: collectJMAQuake },
          { name: '気象庁(気象警報)', fn: collectJMAWarnings },
          { name: 'P2P地震情報', fn: collectP2PQuake },
          { name: 'P2P地震情報(津波)', fn: collectP2PTsunami },
          { name: 'USGS', fn: () => collectUSGS(true) },
          { name: 'GDACS', fn: () => collectGDACS(true) },
        ]
      : [
          { name: 'USGS', fn: () => collectUSGS(false) },
          { name: 'P2P地震情報', fn: collectP2PQuake },
          { name: 'GDACS', fn: () => collectGDACS(false) },
        ];

    const settled = await Promise.allSettled(tasks.map((t) => t.fn()));
    const errors = [];
    let items = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') items = items.concat(r.value);
      else errors.push({ source: tasks[i].name, error: String((r.reason && r.reason.message) || r.reason) });
    });

    let mapped = items.filter((it) => isValidCoord(it.lat, it.lon));
    if (isJapan) mapped = mapped.filter((it) => inJapan(it.lat, it.lon));

    let usedFallback = false;
    if (mapped.length === 0) {
      mapped = (window.SAMPLE_DISASTERS || []).slice();
      if (isJapan) mapped = mapped.filter((it) => inJapan(it.lat, it.lon));
      usedFallback = true;
    }
    mapped.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

    return {
      updatedAt: new Date().toISOString(), region: isJapan ? 'japan' : 'world',
      count: mapped.length, sources: tasks.map((t) => t.name), errors, usedFallback, items: mapped,
    };
  }

  window.DisasterCollector = { collect };
})();

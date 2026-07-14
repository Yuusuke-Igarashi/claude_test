// collector.js
// Web 上の複数の災害情報ソースを収集し、共通スキーマに正規化する。
// 各エントリを geocoder で位置情報付与（座標が無い場合）してから返す。
//
// 共通スキーマ:
// {
//   id, source, type, title, description, place,
//   lat, lon, magnitude, severity, time (ISO文字列), url
// }

import { geocode, isValidCoord } from './geocoder.js';
import { SAMPLE_DISASTERS } from './sample-data.js';

const HAZARD_LABELS = {
  earthquake: '地震',
  tsunami: '津波',
  flood: '洪水',
  cyclone: '台風・サイクロン',
  volcano: '火山',
  drought: '干ばつ',
  wildfire: '山火事',
  other: 'その他',
};

async function fetchJson(url, { signal, headers } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'disaster-info-map/1.0', Accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// ソース1: USGS 地震フィード（全世界・過去1日・座標付き / APIキー不要）
// ---------------------------------------------------------------------------
async function collectUSGS(signal) {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
  const data = await fetchJson(url, { signal });
  const out = [];
  for (const f of data.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    if (!isValidCoord(lat, lon)) continue;
    const p = f.properties || {};
    out.push({
      id: `usgs-${f.id}`,
      source: 'USGS',
      type: 'earthquake',
      title: p.title || `M${p.mag} 地震`,
      description: `震源: ${p.place || '不明'} / マグニチュード ${p.mag ?? '?'} / 深さ ${
        f.geometry?.coordinates?.[2] ?? '?'
      } km`,
      place: p.place || '',
      lat,
      lon,
      magnitude: p.mag ?? null,
      severity: magToSeverity(p.mag),
      time: p.time ? new Date(p.time).toISOString() : null,
      url: p.url || '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ソース2: P2P地震情報（日本の地震・震度・座標付き / APIキー不要）
// ---------------------------------------------------------------------------
async function collectP2PQuake(signal) {
  const url = 'https://api.p2pquake.net/v2/history?codes=551&limit=30';
  const data = await fetchJson(url, { signal });
  const out = [];
  for (const item of Array.isArray(data) ? data : []) {
    const eq = item.earthquake || {};
    const h = eq.hypocenter || {};
    const lat = typeof h.latitude === 'number' && h.latitude !== -200 ? h.latitude : null;
    const lon = typeof h.longitude === 'number' && h.longitude !== -200 ? h.longitude : null;
    if (!isValidCoord(lat, lon)) {
      // 座標欠落時は震源地名から後段で geocode する
      out.push({
        _needsGeocode: h.name || '',
        id: `p2p-${item.id}`,
        source: 'P2P地震情報',
        type: 'earthquake',
        title: `${h.name || '日本'} 最大震度${scaleToText(eq.maxScale)}`,
        description: buildP2PDesc(h, eq),
        place: h.name || '',
        lat: null,
        lon: null,
        magnitude: typeof h.magnitude === 'number' && h.magnitude !== -1 ? h.magnitude : null,
        severity: scaleToSeverity(eq.maxScale),
        time: eq.time ? new Date(eq.time.replace(' ', 'T') + '+09:00').toISOString() : null,
        url: 'https://www.p2pquake.net/',
      });
      continue;
    }
    out.push({
      id: `p2p-${item.id}`,
      source: 'P2P地震情報',
      type: 'earthquake',
      title: `${h.name || '日本'} 最大震度${scaleToText(eq.maxScale)}`,
      description: buildP2PDesc(h, eq),
      place: h.name || '',
      lat,
      lon,
      magnitude: typeof h.magnitude === 'number' && h.magnitude !== -1 ? h.magnitude : null,
      severity: scaleToSeverity(eq.maxScale),
      time: eq.time ? new Date(eq.time.replace(' ', 'T') + '+09:00').toISOString() : null,
      url: 'https://www.p2pquake.net/',
    });
  }
  return out;
}

function buildP2PDesc(h, eq) {
  const parts = [];
  if (h.name) parts.push(`震源: ${h.name}`);
  if (typeof h.depth === 'number' && h.depth >= 0) parts.push(`深さ ${h.depth} km`);
  if (typeof h.magnitude === 'number' && h.magnitude !== -1) parts.push(`M${h.magnitude}`);
  parts.push(`最大震度 ${scaleToText(eq.maxScale)}`);
  if (eq.domesticTsunami) parts.push(`津波: ${tsunamiText(eq.domesticTsunami)}`);
  return parts.join(' / ');
}

// ---------------------------------------------------------------------------
// ソース3: GDACS（全世界のマルチハザード: 洪水・台風・火山・地震など / 座標付き）
// ---------------------------------------------------------------------------
async function collectGDACS(signal) {
  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';
  const data = await fetchJson(url, { signal });
  const out = [];
  for (const f of data.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    if (!isValidCoord(lat, lon)) continue;
    const p = f.properties || {};
    const type = gdacsType(p.eventtype);
    out.push({
      id: `gdacs-${p.eventtype}-${p.eventid}`,
      source: 'GDACS',
      type,
      title: p.htmldescription
        ? stripHtml(p.htmldescription).slice(0, 80)
        : `${HAZARD_LABELS[type]} (${p.country || '海外'})`,
      description: `${HAZARD_LABELS[type]} / ${p.country || '不明'} / 警戒レベル: ${
        p.alertlevel || 'Green'
      }${p.name ? ' / ' + p.name : ''}`,
      place: p.country || '',
      lat,
      lon,
      magnitude: null,
      severity: gdacsSeverity(p.alertlevel),
      time: p.fromdate ? new Date(p.fromdate).toISOString() : null,
      url: p.url?.report || p.url?.details || 'https://www.gdacs.org/',
    });
  }
  return out;
}

// --- ヘルパー ---------------------------------------------------------------
function magToSeverity(mag) {
  if (mag == null) return 1;
  if (mag >= 6) return 4;
  if (mag >= 5) return 3;
  if (mag >= 4) return 2;
  return 1;
}
function scaleToText(scale) {
  const map = { 10: '1', 20: '2', 30: '3', 40: '4', 45: '5弱', 50: '5強', 55: '6弱', 60: '6強', 70: '7' };
  return map[scale] || '不明';
}
function scaleToSeverity(scale) {
  if (scale == null) return 1;
  if (scale >= 55) return 4;
  if (scale >= 45) return 3;
  if (scale >= 30) return 2;
  return 1;
}
function tsunamiText(v) {
  return { None: 'なし', Unknown: '不明', Checking: '調査中', NonEffective: '若干の海面変動', Watch: '注意報', Warning: '警報' }[v] || v;
}
function gdacsType(t) {
  return { EQ: 'earthquake', TC: 'cyclone', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'wildfire', TS: 'tsunami' }[t] || 'other';
}
function gdacsSeverity(level) {
  return { Green: 1, Orange: 3, Red: 4 }[level] || 2;
}
function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, '').trim();
}

/**
 * すべてのソースを収集・正規化して返す。
 * 一部ソースが失敗しても、成功した分だけ返す（部分的失敗に強い）。
 */
export async function collectAll({ signal, useNetwork = true } = {}) {
  const tasks = [
    { name: 'USGS', fn: collectUSGS },
    { name: 'P2P地震情報', fn: collectP2PQuake },
    { name: 'GDACS', fn: collectGDACS },
  ];

  const results = await Promise.allSettled(tasks.map((t) => t.fn(signal)));
  const errors = [];
  let items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else errors.push({ source: tasks[i].name, error: String(r.reason?.message || r.reason) });
  });

  // 位置情報の付与: 座標が無いエントリを geocode で補完
  for (const it of items) {
    if (it._needsGeocode && !isValidCoord(it.lat, it.lon)) {
      const coords = await geocode(it._needsGeocode, { useNetwork });
      if (coords) {
        it.lat = coords[0];
        it.lon = coords[1];
      }
    }
    delete it._needsGeocode;
  }

  // 座標を持つものだけ地図表示対象にする
  let mapped = items.filter((it) => isValidCoord(it.lat, it.lon));

  // ライブソースが全滅した場合はサンプルデータにフォールバック（常に何か表示する）
  let usedFallback = false;
  if (mapped.length === 0) {
    mapped = SAMPLE_DISASTERS.slice();
    usedFallback = true;
  }

  // 新しい順に並べる
  mapped.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  return {
    updatedAt: new Date().toISOString(),
    count: mapped.length,
    sources: tasks.map((t) => t.name),
    errors,
    usedFallback,
    items: mapped,
  };
}

export { HAZARD_LABELS };

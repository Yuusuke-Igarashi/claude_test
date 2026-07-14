// geocoder.js
// 地名テキストから緯度経度を求める（位置情報の付与）。
// 1) まず内蔵の地名辞書（gazetteer）で高速に解決する
// 2) 見つからなければ OpenStreetMap Nominatim へ問い合わせる
// 3) 結果はメモリ上にキャッシュし、同じ地名の再問い合わせを避ける

// 日本の都道府県 + 主要都市の代表座標（オフラインでも動くフォールバック）。
const GAZETTEER = {
  '北海道': [43.0642, 141.3469], '青森県': [40.8244, 140.7400], '岩手県': [39.7036, 141.1527],
  '宮城県': [38.2688, 140.8721], '秋田県': [39.7186, 140.1024], '山形県': [38.2404, 140.3633],
  '福島県': [37.7503, 140.4676], '茨城県': [36.3418, 140.4468], '栃木県': [36.5657, 139.8836],
  '群馬県': [36.3907, 139.0604], '埼玉県': [35.8570, 139.6489], '千葉県': [35.6051, 140.1233],
  '東京都': [35.6895, 139.6917], '神奈川県': [35.4478, 139.6425], '新潟県': [37.9026, 139.0236],
  '富山県': [36.6953, 137.2114], '石川県': [36.5947, 136.6256], '福井県': [36.0652, 136.2216],
  '山梨県': [35.6642, 138.5684], '長野県': [36.6513, 138.1810], '岐阜県': [35.3912, 136.7223],
  '静岡県': [34.9769, 138.3831], '愛知県': [35.1802, 136.9066], '三重県': [34.7303, 136.5086],
  '滋賀県': [35.0045, 135.8686], '京都府': [35.0212, 135.7556], '大阪府': [34.6863, 135.5200],
  '兵庫県': [34.6913, 135.1830], '奈良県': [34.6851, 135.8329], '和歌山県': [34.2260, 135.1675],
  '鳥取県': [35.5039, 134.2377], '島根県': [35.4723, 133.0505], '岡山県': [34.6618, 133.9350],
  '広島県': [34.3966, 132.4596], '山口県': [34.1859, 131.4706], '徳島県': [34.0658, 134.5593],
  '香川県': [34.3401, 134.0434], '愛媛県': [33.8416, 132.7657], '高知県': [33.5597, 133.5311],
  '福岡県': [33.6064, 130.4181], '佐賀県': [33.2494, 130.2988], '長崎県': [32.7448, 129.8737],
  '熊本県': [32.7898, 130.7417], '大分県': [33.2382, 131.6126], '宮崎県': [31.9111, 131.4239],
  '鹿児島県': [31.5602, 130.5581], '沖縄県': [26.2124, 127.6809],
  // よく参照される海域・地方名
  '三陸沖': [39.5, 143.5], '福島県沖': [37.5, 141.5], '宮城県沖': [38.3, 142.0],
  '茨城県沖': [36.3, 141.0], '千葉県東方沖': [35.3, 140.9], '相模湾': [35.1, 139.3],
  '駿河湾': [34.8, 138.5], '紀伊水道': [34.0, 135.0], '日向灘': [32.0, 132.0],
  '東京湾': [35.4, 139.8], '伊豆大島近海': [34.7, 139.4], '種子島近海': [30.5, 131.0],
};

const cache = new Map();

// Nominatim へのアクセスは利用規約により 1 req/sec 程度に抑える必要がある。
let lastNominatimCall = 0;
async function throttle(ms) {
  const wait = lastNominatimCall + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
}

function normalize(name) {
  return String(name || '').trim();
}

// 内蔵辞書での部分一致検索
function lookupGazetteer(name) {
  const n = normalize(name);
  if (!n) return null;
  if (GAZETTEER[n]) return GAZETTEER[n];
  for (const key of Object.keys(GAZETTEER)) {
    if (n.includes(key)) return GAZETTEER[key];
  }
  return null;
}

async function lookupNominatim(name, { signal } = {}) {
  await throttle(1100);
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=' +
    encodeURIComponent(name);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'disaster-info-map/1.0 (educational demo)' },
    signal,
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  }
  return null;
}

/**
 * 地名を緯度経度 [lat, lon] に変換する。解決できなければ null。
 * @param {string} name  地名テキスト
 * @param {object} opts  { useNetwork:boolean, signal }
 */
export async function geocode(name, opts = {}) {
  const key = normalize(name);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let coords = lookupGazetteer(key);
  if (!coords && opts.useNetwork !== false) {
    try {
      coords = await lookupNominatim(key, opts);
    } catch {
      coords = null; // ネットワーク不通でも辞書結果 or null で継続
    }
  }
  cache.set(key, coords);
  return coords;
}

export function isValidCoord(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

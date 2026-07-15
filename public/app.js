// app.js — 地図の描画・ピン配置・ホバー詳細ウィンドウ制御

const TYPE_LABELS = {
  earthquake: '地震',
  tsunami: '津波',
  flood: '洪水',
  cyclone: '台風・サイクロン',
  volcano: '火山',
  drought: '干ばつ',
  wildfire: '山火事',
  warning: '気象警報',
  other: 'その他',
};
const SEVERITY_LABELS = { 1: '低', 2: '中', 3: '高', 4: '甚大' };

// 表示範囲ごとの地図初期ビュー
const REGION_VIEW = {
  japan: { center: [37.5, 137.8], zoom: 5 },
  world: { center: [20, 150], zoom: 2 },
};

let map;
let markerLayer;
let allItems = [];
let hideTimer = null;
let region = 'japan'; // 既定は日本版
let currentItem = null; // 詳細表示中のイベント（レポート生成対象）

const el = (id) => document.getElementById(id);

function initMap() {
  const v = REGION_VIEW[region];
  map = L.map('map', { worldCopyJump: true }).setView(v.center, v.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

// 円形ピンを作る（警戒度で色・大きさが変わる）
function makePin(item) {
  const size = 12 + (item.severity || 1) * 4;
  const icon = L.divIcon({
    className: '',
    html: `<div class="pin sev-${item.severity || 1}" style="width:${size}px;height:${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  const marker = L.marker([item.lat, item.lon], { icon, title: item.title });

  // ホバーで詳細ウィンドウを表示、外れると少し遅れて隠す
  marker.on('mouseover', () => showDetail(item));
  marker.on('mouseout', () => scheduleHide());
  // クリックでも表示（モバイル・固定表示用）
  marker.on('click', () => {
    showDetail(item, true);
    map.panTo([item.lat, item.lon]);
  });
  return marker;
}

function render(items) {
  markerLayer.clearLayers();
  for (const item of items) markerLayer.addLayer(makePin(item));
}

// --- 詳細「別ウィンドウ」の制御 ---
function showDetail(item, sticky = false) {
  clearTimeout(hideTimer);
  currentItem = item;
  const win = el('detailWindow');

  const badge = el('detailBadge');
  badge.textContent = SEVERITY_LABELS[item.severity] || '情報';
  badge.className = `badge sev-${item.severity || 1}`;

  el('detailTitle').textContent = item.title || '（無題）';
  el('detailType').textContent = TYPE_LABELS[item.type] || item.type || '不明';
  el('detailPlace').textContent = item.place || '不明';
  el('detailMag').textContent =
    item.magnitude != null ? `M${item.magnitude}` : SEVERITY_LABELS[item.severity] || '不明';
  el('detailTime').textContent = item.time ? formatTime(item.time) : '不明';
  el('detailCoord').textContent = `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`;
  el('detailSource').textContent = item.source || '不明';
  el('detailDesc').textContent = item.description || '';

  const link = el('detailLink');
  if (item.url) {
    link.href = item.url;
    link.style.display = 'inline-block';
  } else {
    link.style.display = 'none';
  }

  win.classList.remove('hidden');
  win.dataset.sticky = sticky ? '1' : '0';
}

function scheduleHide() {
  const win = el('detailWindow');
  if (win.dataset.sticky === '1') return; // クリックで固定中は消さない
  hideTimer = setTimeout(() => win.classList.add('hidden'), 350);
}

// 詳細ウィンドウ上にマウスがある間は消さない
function wireDetailWindow() {
  const win = el('detailWindow');
  win.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  win.addEventListener('mouseleave', () => scheduleHide());
  el('detailClose').addEventListener('click', () => {
    win.dataset.sticky = '0';
    win.classList.add('hidden');
  });
}

// --- AIレポート生成 ---
// HTMLエスケープ（モデル出力をそのまま挿入しないため）
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// 最小限のMarkdown→HTML（見出し/箇条書き/強調/リンク/段落）。先にエスケープ。
function renderMarkdown(md) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = String(md).split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^##\s+(.*)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^#\s+(.*)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(m[1])}</li>`; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

function openReportModal() {
  el('reportModal').classList.remove('hidden');
}
function closeReportModal() {
  el('reportModal').classList.add('hidden');
}

async function generateReport() {
  if (!currentItem) return;
  const item = currentItem;
  el('reportSubtitle').textContent = `${TYPE_LABELS[item.type] || item.type} / ${item.place || ''} — ${item.title || ''}`;
  el('reportBody').innerHTML =
    '<div class="report-loading"><span class="spinner"></span>Web上の関連情報を収集し、レポートを生成中…（30秒ほどかかることがあります）</div>';
  el('reportSources').innerHTML = '';
  el('reportMeta').textContent = '';
  openReportModal();

  try {
    // Worker URL が設定されていればそれを、無ければ同一オリジン(Nodeサーバー版)を使う
    const endpoint = (window.APP_CONFIG && window.APP_CONFIG.reportApiUrl) || 'api/report';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: item }),
    });
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      // JSONが返らない = バックエンド未設定（静的ホスティングで Worker URL 未設定）
      throw { _static: true };
    }
    const data = await res.json();
    if (!res.ok) {
      el('reportBody').innerHTML = `<div class="report-error">⚠ ${escapeHtml(data.error || 'レポートを生成できませんでした。')}</div>`;
      return;
    }
    el('reportBody').innerHTML = renderMarkdown(data.markdown || '');
    if (data.sources && data.sources.length) {
      const items = data.sources
        .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></li>`)
        .join('');
      el('reportSources').innerHTML = `<h3>参照した情報源</h3><ul>${items}</ul>`;
    }
    el('reportMeta').textContent =
      `生成: ${data.model || 'AI'} ／ ${data.generatedAt ? formatTime(data.generatedAt) : ''}　※AI生成のため誤りを含む可能性があります。公式情報をご確認ください。`;
  } catch (err) {
    if (err && err._static) {
      el('reportBody').innerHTML =
        '<div class="report-error">⚠ AIレポート生成にはバックエンドが必要です（APIキーを安全に扱うため）。<br><br>' +
        '<strong>手元で使う場合</strong>：<code>npm install</code> → <code>ANTHROPIC_API_KEY=... node server.js</code><br><br>' +
        '<strong>公開サイト(GitHub Pages 等)で使う場合</strong>：Cloudflare Worker をデプロイし、' +
        'そのURLを <code>public/config.js</code> の <code>reportApiUrl</code> に設定してください' +
        '（手順は <code>worker/README.md</code>）。</div>';
    } else {
      el('reportBody').innerHTML = `<div class="report-error">⚠ 通信エラー: ${escapeHtml(String((err && err.message) || err))}</div>`;
    }
  }
}

function wireReportModal() {
  el('reportBtn').addEventListener('click', generateReport);
  el('reportClose').addEventListener('click', closeReportModal);
  el('reportModal').addEventListener('click', (e) => {
    if (e.target === el('reportModal')) closeReportModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeReportModal();
  });
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }) + ' (JST)';
  } catch {
    return iso;
  }
}

// --- フィルタ ---
function populateTypeFilter(items) {
  const sel = el('typeFilter');
  const types = [...new Set(items.map((i) => i.type))];
  // 既存の "すべて" 以外を作り直す
  sel.querySelectorAll('option:not([value="all"])').forEach((o) => o.remove());
  for (const t of types) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = TYPE_LABELS[t] || t;
    sel.appendChild(o);
  }
}

function applyFilter() {
  const type = el('typeFilter').value;
  const items = type === 'all' ? allItems : allItems.filter((i) => i.type === type);
  render(items);
  const regionLabel = region === 'japan' ? '日本版' : '世界版';
  el('statusBar').textContent = `【${regionLabel}】${items.length} 件の災害情報を表示中` + statusSuffix;
}

let statusSuffix = '';

// --- データ取得 ---
// バックエンド(/api/disasters)があればそれを使う（CORS回避・キャッシュ有り）。
// 静的ホスティング(GitHub Pages 等)でバックエンドが無い場合は、
// ブラウザから直接収集する DisasterCollector にフォールバックする。
async function fetchData() {
  try {
    const res = await fetch('api/disasters?region=' + region, { headers: { Accept: 'application/json' } });
    const ctype = res.headers.get('content-type') || '';
    if (res.ok && ctype.includes('application/json')) {
      return await res.json();
    }
  } catch (_) {
    /* バックエンド無し -> クライアント収集へ */
  }
  if (window.DisasterCollector) {
    return window.DisasterCollector.collect(region);
  }
  throw new Error('データ収集手段がありません');
}

async function loadData() {
  el('statusBar').textContent = '災害情報を収集中…';
  el('refreshBtn').disabled = true;
  try {
    const data = await fetchData();
    allItems = data.items || [];
    const updated = data.updatedAt ? formatTime(data.updatedAt) : '';
    statusSuffix = updated ? `（最終更新: ${updated}）` : '';
    if (data.usedFallback) {
      statusSuffix += ' ／ ⚠ ライブソースに接続できないためサンプルデータを表示中';
    } else if (data.errors && data.errors.length) {
      statusSuffix += ` ／ 一部ソース取得失敗: ${data.errors.map((e) => e.source).join(', ')}`;
    }
    populateTypeFilter(allItems);
    applyFilter();
  } catch (err) {
    el('statusBar').textContent = `取得に失敗しました: ${err.message}`;
  } finally {
    el('refreshBtn').disabled = false;
  }
}

function switchRegion(next) {
  if (next === region) return;
  region = next;
  // ボタンの見た目を更新
  document.querySelectorAll('.region-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.region === region)
  );
  // 地図をその範囲へ移動
  const v = REGION_VIEW[region];
  map.setView(v.center, v.zoom);
  // 種別フィルタを全件に戻して再取得
  el('typeFilter').value = 'all';
  loadData();
}

function init() {
  initMap();
  wireDetailWindow();
  wireReportModal();
  el('refreshBtn').addEventListener('click', loadData);
  el('typeFilter').addEventListener('change', applyFilter);
  document.querySelectorAll('.region-btn').forEach((b) =>
    b.addEventListener('click', () => switchRegion(b.dataset.region))
  );
  loadData();
}

document.addEventListener('DOMContentLoaded', init);

'use strict';

// 朝画面（挨拶・日付・天気・arXiv の新着）の処理
// このファイルは関数を用意するだけ。起動時や日付が変わったときに app.js が呼ぶ
// （formatDate など app.js の関数も使うが、呼ばれる時点では app.js が読み込み済み）

// ===== 天気の設定 =====
// Open-Meteo（無料・登録不要・API キー不要）。外に送るのはこの緯度・経度だけで、予定のデータは送らない
const WEATHER_PLACE = { name: '東京', latitude: 35.69, longitude: 139.69 };
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${WEATHER_PLACE.latitude}&longitude=${WEATHER_PLACE.longitude}` +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
  '&hourly=precipitation_probability&timezone=Asia%2FTokyo&forecast_days=1';
const WEATHER_TIMEOUT_MS = 8000;          // これ以上返事がなければ「取得できませんでした」
const WEATHER_REFRESH_MS = 60 * 60 * 1000; // アプリに戻ってきたとき、1 時間以上たっていたら天気・ニュースを取り直す

// ===== ニュースの設定 =====
// 一般ニュース（NHK など）は出さない：ブラウザから直接読めず、集めて公開すると規約（再配信禁止）に触れるため
const NEWS_COUNT = 3; // arXiv の新着を出す件数
// arXiv は GitHub Actions が毎朝集めて、このアプリと同じ場所に置くファイル（オフラインでも前回分が出る）
const ARXIV_JSON = './arxiv.json';

// 時間ごとの降水確率の区切り（start 時〜end 時の手前まで）
const RAIN_PERIODS = [
  { label: '朝', start: 6, end: 9 },
  { label: '昼', start: 9, end: 15 },
  { label: '夕方', start: 15, end: 18 },
  { label: '夜', start: 18, end: 24 },
];

// 天気コード（WMO という国際的な決まり）→ マークと日本語
function weatherLabel(code) {
  if (code === 0) return { icon: '☀️', text: '晴れ' };
  if (code === 1) return { icon: '🌤️', text: 'おおむね晴れ' };
  if (code === 2) return { icon: '⛅', text: '晴れ時々くもり' };
  if (code === 3) return { icon: '☁️', text: 'くもり' };
  if (code === 45 || code === 48) return { icon: '🌫️', text: '霧' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: '霧雨' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', text: '雨' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', text: '雪' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', text: 'にわか雨' };
  if (code === 85 || code === 86) return { icon: '🌨️', text: 'にわか雪' };
  if (code >= 95) return { icon: '⛈️', text: '雷雨' };
  return { icon: '🌡️', text: '—' };
}

// ===== 挨拶と日付 =====
function greetingFor(hour) {
  if (hour >= 4 && hour < 10) return 'おはようございます';
  if (hour >= 10 && hour < 17) return 'こんにちは';
  return 'こんばんは';
}

// "2026-11-08" → "11月8日（日）"
function formatLongDate(s) {
  const d = parseDateStr(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

function renderMorningHead() {
  document.getElementById('greeting').textContent = greetingFor(new Date().getHours());
  document.getElementById('morning-date').textContent = formatLongDate(todayStr());
  document.getElementById('weather-place').textContent = WEATHER_PLACE.name;
}

// ===== 朝画面のネットの情報（天気・ニュース）をまとめて取りに行く =====
let lastMorningLoad = 0; // 最後に取りに行った時刻（ミリ秒）

function loadMorningData() {
  lastMorningLoad = Date.now();
  loadWeather();
  loadArxiv();
}

// 前回から 1 時間以上たっていたら取り直す（アプリに戻ってきたとき用）
function refreshMorningIfOld() {
  if (Date.now() - lastMorningLoad > WEATHER_REFRESH_MS) loadMorningData();
}

// 返事が来なければ途中で打ち切る fetch
async function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ===== 天気の取得 =====

// API の返事から、画面に出す形にまとめる
function summarizeWeather(data) {
  const daily = data.daily;
  const hours = data.hourly.time.map(t => Number(t.slice(11, 13))); // "2026-11-08T06:00" → 6
  const probs = data.hourly.precipitation_probability;
  const periods = RAIN_PERIODS.map(p => {
    const values = probs.filter((v, i) => typeof v === 'number' && hours[i] >= p.start && hours[i] < p.end);
    return { label: p.label, value: values.length ? Math.max(...values) : null };
  });
  return {
    code: daily.weather_code[0],
    max: daily.temperature_2m_max[0],
    min: daily.temperature_2m_min[0],
    rain: daily.precipitation_probability_max[0],
    periods,
  };
}

async function loadWeather() {
  showWeatherText('天気を取得しています…');
  try {
    const response = await fetchWithTimeout(WEATHER_URL, WEATHER_TIMEOUT_MS);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    renderWeather(summarizeWeather(await response.json()));
  } catch (err) {
    // オフライン・時間切れ・形式違いなど。予定の表示には影響させない
    showWeatherError();
  }
}

// ===== 天気の表示 =====
const weatherEl = () => document.getElementById('weather');

function showWeatherText(text) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = text;
  weatherEl().replaceChildren(p);
}

function showWeatherError() {
  const p = document.createElement('p');
  p.className = 'weather-error';
  p.textContent = '取得できませんでした';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn';
  retry.textContent = 'もう一度';
  retry.addEventListener('click', loadWeather);
  weatherEl().replaceChildren(p, retry);
}

const roundTemp = t => (typeof t === 'number' ? `${Math.round(t)}℃` : '—');
const percent = v => (typeof v === 'number' ? `${v}%` : '—');

function renderWeather(w) {
  const label = weatherLabel(w.code);

  const main = document.createElement('div');
  main.className = 'weather-main';
  const icon = document.createElement('span');
  icon.className = 'weather-icon';
  icon.textContent = label.icon;
  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'weather-name';
  name.textContent = label.text;
  const temps = document.createElement('div');
  temps.className = 'weather-temps';
  // 幅が狭いときは「降水確率」の前で改行されるよう、2 つに分けて途中で折り返さないようにする
  const tempsPart = document.createElement('span');
  tempsPart.className = 'nowrap';
  tempsPart.textContent = `最高 ${roundTemp(w.max)} ／ 最低 ${roundTemp(w.min)} ／ `;
  const rainPart = document.createElement('span');
  rainPart.className = 'nowrap';
  rainPart.textContent = `降水確率 ${percent(w.rain)}`;
  temps.append(tempsPart, rainPart);
  text.append(name, temps);
  main.append(icon, text);

  // 時間ごとの降水確率
  const periods = document.createElement('div');
  periods.className = 'rain-periods';
  for (const p of w.periods) {
    const cell = document.createElement('div');
    cell.className = 'rain-period';
    const l = document.createElement('div');
    l.className = 'rain-label';
    l.textContent = p.label;
    const v = document.createElement('div');
    v.className = 'rain-value';
    v.textContent = percent(p.value);
    cell.append(l, v);
    periods.append(cell);
  }

  const now = new Date();
  const updated = document.createElement('p');
  updated.className = 'note';
  updated.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} 取得`;

  weatherEl().replaceChildren(main, periods, updated);
}

// ===== ニュース：表示の部品 =====

// http / https の URL だけをリンクにする（それ以外の形は危ないので使わない）
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch (err) {
    return null;
  }
}

// 見出し 1 件（押すと Safari で記事が開く）
function newsItemEl(title, url, sub) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'news-link';
  const href = safeUrl(url);
  if (href) {
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  const t = document.createElement('span');
  t.className = 'news-title';
  t.textContent = title;
  a.append(t);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'news-sub';
    s.textContent = sub;
    a.append(s);
  }
  li.append(a);
  return li;
}

// 「読み込み中…」「取得できませんでした」などの 1 行
function showNewsText(listId, text, isError = false) {
  const li = document.createElement('li');
  li.className = isError ? 'news-msg news-error' : 'news-msg';
  li.textContent = text;
  document.getElementById(listId).replaceChildren(li);
}

// ===== arXiv（GitHub Actions が毎朝作る arxiv.json を読む） =====
async function loadArxiv() {
  const listId = 'news-arxiv';
  const dateEl = document.getElementById('arxiv-date');
  const moreEl = document.getElementById('arxiv-more');
  showNewsText(listId, '読み込み中…');
  dateEl.textContent = '';
  moreEl.replaceChildren();
  try {
    const response = await fetchWithTimeout(ARXIV_JSON, WEATHER_TIMEOUT_MS, { cache: 'no-cache' });
    if (response.status === 404) {
      showNewsText(listId, 'まだ届いていません（平日の朝 5 時ごろに集めます）');
      return;
    }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.items) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('形式が違います');

    dateEl.textContent = formatLongDate(data.date);
    const items = data.items.filter(i => i && typeof i.title === 'string').slice(0, NEWS_COUNT);
    if (items.length === 0) {
      showNewsText(listId, '新着はありません');
    } else {
      document.getElementById(listId).replaceChildren(...items.map(i => newsItemEl(i.title, i.url, i.authors)));
    }

    // 「すべて見る」：arXiv の新着一覧ページへ
    const listUrl = safeUrl(data.listUrl);
    if (listUrl) {
      const a = document.createElement('a');
      a.href = listUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = Number.isFinite(data.newCount) ? `すべて見る（新着 ${data.newCount} 件）→` : 'すべて見る →';
      moreEl.append(a);
    }
  } catch (err) {
    showNewsText(listId, '取得できませんでした', true);
  }
}

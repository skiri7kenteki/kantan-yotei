'use strict';

// ===== 設定 =====
const APP_VERSION = '1.8';                  // 直したら上げる（画面の下に表示され、更新が届いたか分かる）
const STORAGE_KEY = 'kantan-yotei.v1';        // localStorage に保存するときの名前
const BROKEN_KEY = 'kantan-yotei.v1.broken';  // 読めなかったデータの避難先
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// iPad / iPhone かどうか（iPadOS は「Mac」と名乗るので、タッチ対応かどうかで見分ける）
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

// ===== 画面の部品 =====
const form = document.getElementById('add-form');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const dateLabel = document.getElementById('date-label');
const timeInput = document.getElementById('time');
const timeToggle = document.getElementById('time-toggle');
const dayChips = document.querySelectorAll('.chip[data-day]');
const dateChip = dateInput.closest('.chip');
const messageEl = document.getElementById('message');
const todayLabel = document.getElementById('today-label');
const listToday = document.getElementById('list-today');
const listWeek = document.getElementById('list-week');
const listLater = document.getElementById('list-later');
const listMorning = document.getElementById('list-morning'); // 朝画面の「今日の予定」
const tabs = document.querySelectorAll('.tab[data-screen]');
const screens = {
  morning: document.getElementById('screen-morning'),
  list: document.getElementById('screen-list'),
};
const exportButton = document.getElementById('export');
const importButton = document.getElementById('import');
const importFile = document.getElementById('import-file');

// ===== 日付の道具（すべて端末のローカル時刻。"YYYY-MM-DD" の文字列で扱う） =====
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function todayStr() {
  return toDateStr(new Date());
}

// 今週の日曜日（週は月曜始まり。今日が日曜なら今日）
function endOfWeekStr(today) {
  const dow = parseDateStr(today).getDay(); // 0=日, 1=月, ... 6=土
  return addDays(today, (7 - dow) % 7);
}

// "2026-11-09" → "11/9(月)"
function formatDate(s) {
  const d = parseDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

// ===== データ =====
let items = [];

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 予定 1 件として正しい形かどうか
function isValidItem(x) {
  return x !== null && typeof x === 'object' &&
    typeof x.title === 'string' && x.title.trim() !== '' &&
    typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date);
}

// 読み込んだデータを、決まった形に整える（壊れた項目は捨てる・id の重複は付け直す）
function normalizeItems(list) {
  const seen = new Set();
  const result = [];
  for (const x of list) {
    if (!isValidItem(x)) continue;
    let id = typeof x.id === 'string' && x.id ? x.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    result.push({
      id,
      title: x.title.trim().slice(0, 200),
      date: x.date,
      time: typeof x.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? x.time : '',
      done: x.done === true,
      createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
    });
  }
  return result;
}

function loadItems() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items)) throw new Error('形式が違います');
    return normalizeItems(data.items);
  } catch (err) {
    // 読めなかったデータは消さずに別の名前で取っておく（次の保存で上書きされないように）
    try { if (raw) localStorage.setItem(BROKEN_KEY, raw); } catch (e) { /* 何もしない */ }
    showMessage('保存データを読み込めませんでした。バックアップがあれば「読み込み」で戻せます。', true);
    return [];
  }
}

function saveItems() {
  try {
    const data = { app: 'kantan-yotei', version: 1, items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    showMessage('保存できませんでした。ブラウザの容量や設定を確認してください。', true);
    return false;
  }
}

// ===== お知らせ表示 =====
let messageTimer = null;

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('is-error', isError);
  messageEl.hidden = false;
  clearTimeout(messageTimer);
  // エラーは自分で読めるよう長めに出す
  messageTimer = setTimeout(() => { messageEl.hidden = true; }, isError ? 8000 : 3000);
}

// ===== 一覧の表示 =====

// 並び順：日付 → 未完了が先 → 時刻ありが先（時刻順） → 追加した順
function sortItems(list) {
  return list.slice().sort((a, b) =>
    a.date.localeCompare(b.date) ||
    Number(a.done) - Number(b.done) ||
    (a.time === '') - (b.time === '') ||
    a.time.localeCompare(b.time) ||
    a.createdAt - b.createdAt
  );
}

function createItemEl(item, today) {
  const li = document.createElement('li');
  li.className = 'item' + (item.done ? ' is-done' : '');
  li.dataset.id = item.id;

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.setAttribute('aria-pressed', String(item.done));
  check.setAttribute('aria-label', item.done ? '未完了に戻す' : '完了にする');

  const body = document.createElement('div');
  body.className = 'item-body';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.title; // innerHTML は使わない（CLAUDE.md 参照）
  body.append(title);

  // 日付・時刻などの補足（今日の予定なら日付は省く）
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  if (item.date < today) {
    const overdue = document.createElement('span');
    overdue.className = 'overdue';
    overdue.textContent = `やり残し・${formatDate(item.date)}`;
    meta.append(overdue);
  } else if (item.date !== today) {
    meta.append(formatDate(item.date));
  }
  if (item.time) {
    if (meta.childNodes.length) meta.append('　');
    meta.append(item.time);
  }
  if (meta.childNodes.length) body.append(meta);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.textContent = '削除';

  li.append(check, body, del);
  return li;
}

function renderList(ul, list, today, emptyText) {
  ul.replaceChildren();
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    ul.append(li);
    return;
  }
  for (const item of list) ul.append(createItemEl(item, today));
}

let renderedToday = '';

function render() {
  const today = todayStr();
  const weekEnd = endOfWeekStr(today);
  renderedToday = today;
  todayLabel.textContent = formatDate(today);

  // 過去の予定：未完了なら「やり残し」として今日に出す。完了済みは表示しない
  const overdue = items.filter(i => i.date < today && !i.done);
  const todays = items.filter(i => i.date === today);
  const week = items.filter(i => i.date > today && i.date <= weekEnd);
  const later = items.filter(i => i.date > weekEnd);

  const todayList = [...sortItems(overdue), ...sortItems(todays)];
  renderList(listToday, todayList, today, '今日の予定はありません');
  renderList(listWeek, sortItems(week), today, '予定はありません');
  renderList(listLater, sortItems(later), today, '予定はありません');
  renderList(listMorning, todayList, today, '今日の予定はありません'); // 朝画面にも同じものを出す
  fitMorningList();
}

// ===== 朝画面の「今日の予定」を枠に収める =====
// iPad（幅 600px 以上）では朝画面を 1 画面に収めるので、入りきらない予定は後ろから隠し「ほか ○ 件 →」を出す
const morningMore = document.getElementById('morning-more');
const fitsOneScreen = window.matchMedia('(min-width: 600px)');

function fitMorningList() {
  const lis = [...listMorning.querySelectorAll('.item')];
  for (const li of lis) li.hidden = false;
  morningMore.hidden = true;
  // 朝画面が見えていないとき（大きさが測れない）や、スマホ幅のときは全部出す
  if (screens.morning.hidden || !fitsOneScreen.matches) return;

  const overflowing = () => listMorning.scrollHeight > listMorning.clientHeight + 1;
  let hiddenCount = 0;
  for (let i = lis.length - 1; i > 0 && overflowing(); i--) {
    lis[i].hidden = true;
    hiddenCount++;
    morningMore.textContent = `ほか ${hiddenCount} 件 →`;
    morningMore.hidden = false;
  }
}

// 画面の向きや大きさが変わったら測り直す
window.addEventListener('resize', () => requestAnimationFrame(fitMorningList));
morningMore.addEventListener('click', () => showScreen('list'));

// ===== 予定の追加・完了・削除 =====
function addItem(title, date, time) {
  items.push({ id: newId(), title, date, time, done: false, createdAt: Date.now() });
  const saved = saveItems();
  render();
  return saved;
}

function toggleDone(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.done = !item.done;
  saveItems();
  render();
}

function deleteItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`「${item.title}」を削除しますか？`)) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  render();
}

// 一覧のボタン（チェック・削除）はまとめて受け取る
function onListClick(event) {
  const button = event.target.closest('button');
  const li = event.target.closest('.item');
  if (!button || !li) return;
  if (button.classList.contains('check')) toggleDone(li.dataset.id);
  if (button.classList.contains('delete')) deleteItem(li.dataset.id);
}
for (const ul of [listToday, listWeek, listLater, listMorning]) ul.addEventListener('click', onListClick);

// ===== 画面の切り替え（朝／予定） =====
function showScreen(name) {
  for (const key in screens) screens[key].hidden = key !== name;
  for (const tab of tabs) {
    const selected = tab.dataset.screen === name;
    tab.classList.toggle('is-selected', selected);
    tab.setAttribute('aria-pressed', String(selected));
  }
  // 朝画面のときだけ「1 画面に収める」並べ方にする（style.css の .is-morning）
  document.body.classList.toggle('is-morning', name === 'morning');
  window.scrollTo(0, 0);
  if (name === 'morning') fitMorningList();
}

for (const tab of tabs) tab.addEventListener('click', () => showScreen(tab.dataset.screen));
document.getElementById('go-list').addEventListener('click', () => showScreen('list'));

// ===== 追加フォーム =====

// 選んでいる日付：'today' / 'tomorrow' / 'custom'（custom のときは dateInput の値）
// 「今日」を日付ではなく種類で覚えておくと、日付が変わっても正しく今日になる
let dayMode = 'today';

function selectedDate() {
  const today = todayStr();
  if (dayMode === 'tomorrow') return addDays(today, 1);
  if (dayMode === 'custom' && dateInput.value) return dateInput.value;
  return today;
}

function setDayMode(mode) {
  dayMode = mode;
  for (const chip of dayChips) chip.classList.toggle('is-selected', chip.dataset.day === mode);
  dateChip.classList.toggle('is-selected', mode === 'custom');
  dateLabel.textContent = mode === 'custom' ? formatDate(dateInput.value) : '日付を選ぶ';
  if (mode !== 'custom') dateInput.value = '';
}

for (const chip of dayChips) {
  chip.addEventListener('click', () => setDayMode(chip.dataset.day));
}

dateInput.addEventListener('change', () => {
  setDayMode(dateInput.value ? 'custom' : 'today');
});

// PC のブラウザでは、日付欄のどこを押してもカレンダーが開くようにする（iPad は元から開く）
dateInput.addEventListener('click', () => {
  if (!isIOS && typeof dateInput.showPicker === 'function') {
    try { dateInput.showPicker(); } catch (e) { /* 対応していないブラウザは何もしない */ }
  }
});

function setTimeVisible(visible) {
  timeInput.hidden = !visible;
  timeToggle.textContent = visible ? '時刻なし' : '＋時刻';
  if (!visible) timeInput.value = '';
}

timeToggle.addEventListener('click', () => {
  const show = timeInput.hidden;
  setTimeVisible(show);
  if (show) timeInput.focus();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    showMessage('タイトルを入れてください');
    titleInput.focus();
    return;
  }
  const date = selectedDate();
  if (addItem(title, date, timeInput.value)) {
    showMessage(`「${title}」を ${formatDate(date)} に追加しました`);
  }
  // 続けて入れられるよう、タイトルと時刻だけ空にする（日付の選択はそのまま）
  titleInput.value = '';
  setTimeVisible(false);
  titleInput.focus();
});

// ===== バックアップ（書き出し・読み込み） =====

// PC：ファイルとしてダウンロードする
function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage(`${file.name} を書き出しました`);
}

// iPad：共有メニューを出す（「"ファイル"に保存」で保存できる）
async function shareFile(file) {
  try {
    await navigator.share({ files: [file] });
    showMessage('書き出しました');
  } catch (err) {
    if (err.name === 'AbortError') return; // 共有メニューを閉じただけ
    downloadFile(file);
  }
}

function exportBackup() {
  const data = { app: 'kantan-yotei', version: 1, exportedAt: new Date().toISOString(), items };
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], `kantan-yotei-${todayStr()}.json`, { type: 'application/json' });
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    shareFile(file);
  } else {
    downloadFile(file);
  }
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    showMessage('ファイルを読み込めませんでした（JSON 形式ではありません）', true);
    return;
  }
  if (!data || data.app !== 'kantan-yotei' || !Array.isArray(data.items)) {
    showMessage('「かんたん予定」のバックアップファイルではありません', true);
    return;
  }
  if (data.version > 1) {
    showMessage('新しい版のアプリで作られたファイルのため読み込めません', true);
    return;
  }
  const newItems = normalizeItems(data.items);
  const skipped = data.items.length - newItems.length;
  if (!confirm(`今の予定 ${items.length} 件を、ファイルの予定 ${newItems.length} 件で置き換えます。よろしいですか？`)) return;

  const oldItems = items;
  items = newItems;
  if (!saveItems()) {
    items = oldItems; // 保存できなかったら元に戻す
    render();
    return;
  }
  render();
  showMessage(`${newItems.length} 件を読み込みました` + (skipped ? `（形式が正しくない ${skipped} 件は除きました）` : ''));
}

exportButton.addEventListener('click', exportBackup);
importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (file) await importBackup(file);
  importFile.value = ''; // 同じファイルをもう一度選べるようにする
});

// ===== 気づきを送る（GitHub の Issue 作成画面を開く） =====
// アプリから投稿はしない。Safari で開いた GitHub の画面で、持ち主が送信する
// リポジトリは公開なので、自動で入れるのは画面名・バージョン・日付だけ（予定の中身や地域は入れない）
const ISSUE_NEW_URL = 'https://github.com/skiri7kenteki/kantan-yotei/issues/new';
const feedbackDialog = document.getElementById('feedback');
const feedbackText = document.getElementById('feedback-text');
const feedbackHint = document.getElementById('feedback-hint');
const feedbackSend = document.getElementById('feedback-send');

// Issue 作成画面の URL を作る（タイトルと本文の下書きを入れておく）
function buildIssueUrl(text) {
  const title = `【気づき】${text}`;
  const body = [
    `画面：${screens.morning.hidden ? '予定' : '朝'}`,
    `アプリのバージョン：${APP_VERSION}`,
    `日付：${todayStr()}`,
    '',
    'どうなってほしいか：',
    '',
  ].join('\n');
  return `${ISSUE_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// ホーム画面アプリから普通のリンクを開くと、Safari 本体ではなくアプリに重なる画面で開く。
// 先頭を x-safari-https:// にすると iPad が Safari 本体で開く（ホーム画面アプリのときだけ使う）
function setFeedbackLink(url) {
  const isHomeScreenApp = navigator.standalone === true;
  feedbackSend.href = isHomeScreenApp ? url.replace('https://', 'x-safari-https://') : url;
  feedbackSend.target = isHomeScreenApp ? '_self' : '_blank';
}

function showFeedbackHint(text) {
  feedbackHint.textContent = text;
  feedbackHint.hidden = false;
}

function openFeedback() {
  feedbackText.value = '';
  feedbackHint.hidden = true;
  feedbackDialog.showModal();
  feedbackText.focus();
}

document.getElementById('feedback-open').addEventListener('click', openFeedback);
document.getElementById('feedback-close').addEventListener('click', () => feedbackDialog.close());

// 「GitHub で送る」はリンクなので、押した瞬間に URL を入れればそのまま Safari で開く
feedbackSend.addEventListener('click', (event) => {
  const text = feedbackText.value.trim();
  if (!text) {
    event.preventDefault();
    showFeedbackHint('気づいたことを入力してください');
    feedbackText.focus();
    return;
  }
  // オフラインだと Safari がエラーになるので開かない（書いた文は残す）
  if (!navigator.onLine) {
    event.preventDefault();
    showFeedbackHint('ネットにつながっていません。つながってからもう一度押してください');
    return;
  }
  setFeedbackLink(buildIssueUrl(text));
  setTimeout(() => feedbackDialog.close(), 0); // リンクが開くのを邪魔しないよう、この処理の後で閉じる
});

// ===== 日付が変わったら表示を更新（アプリを開きっぱなしにしていた場合） =====
// goMorning：アプリに戻ってきたときは朝画面に戻す（操作中に勝手に切り替わらないよう、時間の経過だけでは戻さない）
function refreshIfDayChanged(goMorning) {
  if (todayStr() === renderedToday) return;
  render();
  renderMorningHead();
  loadMorningData();
  if (goMorning) showScreen('morning');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  renderMorningHead(); // 挨拶は時間帯で変わるので毎回更新
  refreshIfDayChanged(true);
  refreshMorningIfOld();
});
setInterval(() => refreshIfDayChanged(false), 60 * 1000);

// ===== 起動 =====
items = loadItems();
setDayMode('today');
render();
showScreen('morning');
renderMorningHead();
setupPlaceSelect();
loadMorningData(); // 天気・ニュース。失敗しても各欄に「取得できませんでした」と出るだけで、ほかは普通に動く
document.getElementById('version').textContent = `かんたん予定 バージョン ${APP_VERSION}`;

// service worker の登録（オフラインで開けるようにする）。
// ファイルを直接開いたとき（file://）は使えないので登録しない
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 失敗してもアプリは普通に使える */ });
  });
}

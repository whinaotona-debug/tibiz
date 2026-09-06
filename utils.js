import { state } from './state.js?v=267';

/**
 * UI用フリガナ。親には出さない。子供でONのときだけ自前マークアップ。
 * ネイティブ <ruby> はブラウザ差で行が崩れるので使わない。
 */
export function rb(kanji, kana) {
  const base = esc(kanji);
  if (state.role !== 'child' || !state.furigana) return base;
  return `<span class="ie-ruby"><span class="ie-ruby-rt" aria-hidden="true">${esc(kana)}</span><span class="ie-ruby-rb">${base}</span></span>`;
}

/** ルビの直後に続く文字を、漢字と同じ底辺に揃える */
export function rbPair(kanji, kana, after = '') {
  const tail = after ? `<span class="ie-ruby-after">${esc(after)}</span>` : '';
  return `<span class="ie-ruby-pair">${rb(kanji, kana)}${tail}</span>`;
}

/**
 * ユーザーが入力した文字列をHTMLに埋め込む前に無害化する。
 * 子供が入力した仕事名などが親の画面でスクリプトとして動くのを防ぐ。
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 仕事名＋任意の読み方。子供かつフリガナONのときだけルビが出る */
export function jobTitleHtml(title, kana) {
  const t = esc(title || '無題');
  const k = String(kana || '').trim();
  if (!k || state.role !== 'child' || !state.furigana) return t;
  return `<span class="ie-ruby ie-ruby-wrap"><span class="ie-ruby-rt">${esc(k)}</span><span class="ie-ruby-rb">${t}</span></span>`;
}

export function applyFuriganaState() {
  const on = state.role === 'child' && !!state.furigana;
  document.body.classList.toggle('furigana-on', on);
}

export function requestPushPermission() {
  if (!("Notification" in window)) {
    console.warn("このブラウザはプッシュ通知をサポートしていません。");
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") console.log("プッシュ通知の許可が得られました。");
    });
  }
}

export function sendPushNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body: body, icon: 'logo.png' });
    } catch (e) {
      console.warn("通知の表示に失敗:", e);
    }
  } else if (Notification.permission === "default") {
    // まだ許可前なら一度聞いてから送る
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        try {
          new Notification(title, { body: body, icon: 'logo.png' });
        } catch (e) {}
      }
    });
  }
}

export function getIcon(name) {
  const icons = {
    'home': `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>`,
    // ★ チケットアイコンを本物らしく（両端に切り欠きと切り取り線）変更
    'ticket': `<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M12 5v2"></path><path d="M12 17v2"></path><path d="M12 11v2"></path>`,
    'settings': `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
    'history': `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`,
    'propose': `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>`,
    'exchange': `<path d="M17 3l4 4-4 4"></path><path d="M3 17l4-4 4 4"></path><path d="M21 7H7a4 4 0 0 0-4 4v1"></path><path d="M3 17h14a4 4 0 0 0 4-4v-1"></path>`,
    'invest': `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>`,
    'bank': `<rect x="3" y="10" width="18" height="10" rx="2" ry="2"></rect><path d="M7 10V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"></path><path d="M12 14v2"></path>`,
    'task': `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>`,
    'calendar': `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>`,
    'wish': `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 8h8"></path><path d="M8 12h5"></path>`,
    'gift': `<polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>`,
    'eye': `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`,
    'eye-off': `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`,
    'trash': `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>`,
    'repeat': `<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`,
    'refresh': `<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>`,
    'pay': `<rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>`,
    'help': `<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>`,
    'news': `<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8"></path><path d="M15 18h-5"></path><path d="M10 6h8v4h-8V6Z"></path>`,
    'childAdd': `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>`
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name] || ''}</svg>`;
}

export function formatPaymentAmountLabel(p) {
  if (!p) return '';
  if (p.amountKind === 'percentLastMonth') {
    const pct = Number(p.percent);
    if (!Number.isFinite(pct) || pct <= 0) return '前月の稼ぎの％';
    return `前月の${pct}％`;
  }
  return `−${Number(p.amount) || 0}円`;
}

/** 前月（日本時間）にお仕事承認とギフトで得た円 */
export function lastMonthEarnedPoints(tasks, balloons, now = new Date()) {
  const j = japanParts(now);
  let year = j.year;
  let month = j.month - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  let sum = 0;
  for (const t of tasks || []) {
    if (t.status !== 'approved') continue;
    const at = t.approvedAt || t.completedAt;
    if (!at) continue;
    const p = japanParts(new Date(at));
    if (p.year === year && p.month === month) sum += Math.max(0, Number(t.points) || 0);
  }
  for (const b of balloons || []) {
    if (b.status !== 'received') continue;
    const at = b.receivedAt || b.createdAt;
    if (!at) continue;
    const p = japanParts(new Date(at));
    if (p.year === year && p.month === month) sum += Math.max(0, Number(b.points) || 0);
  }
  return sum;
}

export function scheduledPaymentAmount(p, tasks, balloons, now = new Date()) {
  if (!p) return 0;
  if (p.amountKind === 'percentLastMonth') {
    const pct = Math.min(100, Math.max(0, Number(p.percent) || 0));
    if (pct <= 0) return 0;
    return Math.floor(lastMonthEarnedPoints(tasks, balloons, now) * pct / 100);
  }
  return Math.max(0, Number(p.amount) || 0);
}

export function formatTimeLeft(deadlineTime) {
  if (!deadlineTime) return '期限なし';
  const diff = deadlineTime - Date.now();
  if (diff < 0) return '期限切れ';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days >= 1) return `あと${days}日`;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours >= 1) return `あと${hours}時間`;
  
  const minutes = Math.floor(diff / (1000 * 60));
  return `あと${minutes}分`;
}

/** 繰り返しタスクから taskTemplates の ID を取り出す */
export function getTemplateIdFromTask(task) {
  if (!task) return null;
  if (task.templateId) return task.templateId;
  const key = task.generatedKey || task.generatedKey;
  if (!key) return null;
  const m = String(key).match(/^rep_(.+)_(\d{4}-\d{1,2}-\d{1,2})$/);
  return m ? m[1] : null;
}

export function formatRepeatLabel(temp) {
  if (!temp) return '定期';
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  const days = (temp.days || []).map(d => Number(d)).filter(d => Number.isFinite(d));
  if (temp.type === 'weekly') {
    const label = days.slice().sort((a, b) => a - b).map(d => weekNames[d] || '?').join('');
    return `毎週${label || '？'}${temp.time ? ` ${temp.time}` : ''}`;
  }
  const day = days[0] ?? '?';
  return `毎月${day}日${temp.time ? ` ${temp.time}` : ''}`;
}

export function formatPaymentSchedule(p) {
  if (!p) return '';
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  if (p.mode === 'once') {
    let once = `単発 ${p.dueDate || ''}`;
    if (p.amountKind === 'percentLastMonth') {
      const pct = Number(p.percent);
      if (Number.isFinite(pct) && pct > 0) once += `・前月の稼ぎの${pct}％`;
    }
    return once;
  }
  let sched = '';
  if (p.interval === 'weekly') {
    const days = (p.days || []).slice().sort((a, b) => a - b).map(d => weekNames[d]).join('');
    sched = `毎週${days || '？'}`;
  } else {
    const day = (p.days && p.days[0]) || '?';
    sched = `毎月${day}日`;
  }
  if (p.countMode === 'infinite') sched = `${sched}・無限`;
  else {
    const left = p.remainingCount ?? p.totalCount ?? '?';
    sched = `${sched}・残り${left}回`;
  }
  if (p.amountKind === 'percentLastMonth') {
    const pct = Number(p.percent);
    if (Number.isFinite(pct) && pct > 0) sched += `・前月の稼ぎの${pct}％`;
  }
  return sched;
}

/** 日付キー YYYY-M-D を比較用数値に */
export function dateKeyToValue(key) {
  if (!key) return 0;
  const [y, m, d] = String(key).split('-').map(Number);
  return y * 10000 + m * 100 + d;
}

/** 日本時間の日付キーを n 日ずらす */
export function shiftJapanDayKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const ms = new Date(`${y}-${pad2(m)}-${pad2(d)}T12:00:00+09:00`).getTime() + (Number(deltaDays) || 0) * 86400000;
  return japanTodayKey(new Date(ms));
}

/**
 * 支払い設定が作られた日本日付。これより前の期日は落とさない。
 */
function paymentCreatedDayKey(p) {
  const at = Number(p?.createdAt) || 0;
  if (!(at > 0)) return null;
  return japanTodayKey(new Date(at));
}

/**
 * 自動支払いの「直近の引落日」（今日以前）。
 * 戻り値: 日付キー。まだ来ていない／設定前の期日なら null。
 */
export function lastScheduledPaymentDueKey(p, todayStr = japanTodayKey()) {
  if (!p || p.status !== 'active') return null;
  const todayVal = dateKeyToValue(todayStr);
  const createdKey = paymentCreatedDayKey(p);
  const createdVal = createdKey ? dateKeyToValue(createdKey) : null;

  if (p.mode === 'once') {
    if (!p.dueDate) return null;
    if (todayVal < dateKeyToValue(p.dueDate)) return null;
    return p.dueDate;
  }

  const days = (p.days || []).map(Number).filter(Number.isFinite);
  if (!days.length) return null;

  if (p.interval === 'weekly') {
    for (let back = 0; back < 14; back++) {
      const key = shiftJapanDayKey(todayStr, -back);
      if (createdVal != null && dateKeyToValue(key) < createdVal) break;
      const [y, m, d] = key.split('-').map(Number);
      const j = japanParts(new Date(`${y}-${pad2(m)}-${pad2(d)}T12:00:00+09:00`));
      if (days.includes(j.weekday)) return key;
    }
    return null;
  }

  // monthly
  for (let back = 0; back < 62; back++) {
    const key = shiftJapanDayKey(todayStr, -back);
    if (createdVal != null && dateKeyToValue(key) < createdVal) break;
    const [y, m, d] = key.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (days.some(day => Math.min(day, last) === d)) return key;
  }
  return null;
}

/**
 * いま引落すべきか。
 * 定期は「期日の当日」だけ落とす（昨日以前の分をまとめて回収しない）。
 * 単発は指定日以降の未引落をその日に落とす。
 */
export function isScheduledPaymentDue(p, todayStr = japanTodayKey()) {
  if (!p || p.status !== 'active') return false;
  if (p.mode === 'once' && p.lastChargedKey) return false;

  const dueKey = lastScheduledPaymentDueKey(p, todayStr);
  if (!dueKey) return false;
  if (p.lastChargedKey && dateKeyToValue(p.lastChargedKey) >= dateKeyToValue(dueKey)) return false;

  const createdKey = paymentCreatedDayKey(p);
  if (createdKey && dateKeyToValue(dueKey) < dateKeyToValue(createdKey)) return false;

  // 毎週・毎月は当日のみ（25日設定を26日にまとめて落とさない）
  if (p.mode !== 'once' && String(dueKey) !== String(todayStr)) return false;

  return true;
}

const JST = 'Asia/Tokyo';
const WEEKDAY_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 日本時間の壁時計。サーバー（UTC）でもスマホでも同じ「今日」になる。
 * weekday は日曜=0（テンプレの曜日指定と同じ）。
 */
export function japanParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value;
  const weekday = WEEKDAY_EN[get('weekday')] ?? 0;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday,
    weekday: weekday
  };
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function japanTodayKey(date = new Date()) {
  const j = japanParts(date);
  return `${j.year}-${j.month}-${j.day}`;
}

/** 日本時間で、date の前日の日付キー */
export function japanYesterdayKey(date = new Date()) {
  return japanTodayKey(new Date(japanDayStartMs(date) - 1));
}

/** 日本時間の年月キー（例: 2026-8） */
export function japanMonthKey(date = new Date()) {
  const j = japanParts(date);
  return `${j.year}-${j.month}`;
}

export function monthKeyNum(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return 0;
  return y * 12 + m;
}

export function nextJapanMonthKey(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return japanMonthKey();
  if (m >= 12) return `${y + 1}-1`;
  return `${y}-${m + 1}`;
}

/** 家庭内銀行の月利（0.5%）。日利は amount × この値 ÷ 30 */
export const BANK_MONTHLY_RATE = 0.005;

export function bankDepositPrincipal(b) {
  return Math.round(Number(b?.principal ?? b?.amount) || 0);
}

/** 表示用残高（内部 amount の小数は切り捨て。accruedInterest は含めない） */
export function bankDepositBalance(b) {
  return Math.floor(Number(b?.amount) || 0);
}

export function bankDepositInterestEarned(b) {
  const amount = Number(b?.amount) || 0;
  const principal = Number(b?.principal ?? amount) || 0;
  return Math.max(0, Math.floor(amount - principal));
}

export function bankTotalBalance(banks) {
  return (banks || []).reduce((s, b) => s + bankDepositBalance(b), 0);
}

export function bankTotalInterest(banks) {
  return (banks || []).reduce((s, b) => s + bankDepositInterestEarned(b), 0);
}

/** LINE のアプリ内ブラウザか（UA のみ。referrer は Safari 誤判定の原因になるため使わない） */
export function isLineInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /\bLine\//i.test(ua) || /\bLIAPP\b/i.test(ua);
}

const INSTALL_PHASE_KEY = 'ie_install_phase';

function getInstallPhase() {
  try {
    return sessionStorage.getItem(INSTALL_PHASE_KEY) || '';
  } catch {
    return '';
  }
}

function setInstallPhase(phase) {
  try {
    if (phase) sessionStorage.setItem(INSTALL_PHASE_KEY, phase);
    else sessionStorage.removeItem(INSTALL_PHASE_KEY);
  } catch { /* ignore */ }
}

/** @deprecated sessionStorage に移行 */
const INSTALL_BROWSER_HELP_KEY = 'ienomics_install_browser_help';

export function showInstallBrowserHelp() {
  setInstallPhase('browser');
  try { localStorage.removeItem(INSTALL_BROWSER_HELP_KEY); } catch { /* ignore */ }
}

export function clearInstallBrowserHelp() {
  setInstallPhase('done');
  try { localStorage.removeItem(INSTALL_BROWSER_HELP_KEY); } catch { /* ignore */ }
}

export function isInstallBrowserHelpShown() {
  return getInstallPhase() === 'browser';
}

/** @deprecated */
export function isInstallConfirmed() {
  return getInstallPhase() === 'done';
}

export function confirmInstallFromHome() {
  clearInstallBrowserHelp();
}

/** ホーム画面に追加して開いているか（display-mode 本命 + iOS 補助） */
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch { /* ignore */ }
  return window.navigator?.standalone === true;
}

/** ① PWA ② アプリ内 ③ 通常ブラウザ */
export function getOpenContext() {
  if (isStandalonePwa()) return 'pwa';
  if (isLineInAppBrowser()) return 'in-app';
  return 'browser';
}

/** スマホ・タブレット（同期画面でホーム追加を案内する対象） */
export function isMobileInstallTarget() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  try {
    if (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024) return true;
  } catch { /* ignore */ }
  return false;
}

/** 同期する画面でホーム追加の案内が必要か（通常モバイルブラウザのみ） */
export function needsSetupInstallPrompt() {
  const ctx = getOpenContext();
  if (ctx !== 'browser') return false;
  return isMobileInstallTarget();
}

/** LINE 内ブラウザ用（起動直後のみ） */
export function getLineInstallGateKind() {
  if (getOpenContext() === 'in-app') return 'line';
  return null;
}

/** 同期する画面用：'browser' | null（通常ブラウザは自動判定で案内） */
export function getSetupBrowserPromptKind() {
  if (!needsSetupInstallPrompt()) return null;
  return 'browser';
}

/** PWA 起動時に案内済みとして記録 */
export function markInstallPromptDoneIfStandalone() {
  if (isStandalonePwa()) setInstallPhase('done');
}

/** @deprecated 起動直後ゲートは LINE のみ */
export function getInstallGateKind() {
  return getLineInstallGateKind();
}

export function isIosBrowser() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function msFromJapanDayKey(dayKey) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return japanDayStartMs();
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T00:00:00+09:00`).getTime();
}

export function japanDayStartMs(date = new Date()) {
  const j = japanParts(date);
  return new Date(`${j.year}-${pad2(j.month)}-${pad2(j.day)}T00:00:00+09:00`).getTime();
}

/** Firestore Timestamp や文字列もミリ秒にする */
export function deadlineToMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * 期限切れのうち、日付が変わった分（昨日以前）は片付ける。
 * 当日分は 23:59 までは一覧に残す。
 */
export function shouldSweepExpiredTask(task, now = Date.now()) {
  const ms = deadlineToMs(task?.deadline);
  if (!ms || ms >= now) return false;
  if (!['open', 'accepted', 'proposed', 'rejected', 'proposal_rejected'].includes(task.status)) return false;
  const startToday = japanDayStartMs(new Date(now));
  if (ms < startToday) return true;
  return now >= japanDeadlineMs(23, 59, new Date(now));
}

export function japanDeadlineMs(hours, minutes, date = new Date()) {
  const j = japanParts(date);
  const h = Number.isFinite(hours) ? hours : 19;
  const m = Number.isFinite(minutes) ? minutes : 0;
  return new Date(`${j.year}-${pad2(j.month)}-${pad2(j.day)}T${pad2(h)}:${pad2(m)}:00+09:00`).getTime();
}

export function msUntilJapanMidnight(date = new Date()) {
  const next = japanDayStartMs(date) + 24 * 60 * 60 * 1000 + 80;
  return Math.max(200, next - date.getTime());
}

export function formatJapanClock(date = new Date()) {
  const j = japanParts(date);
  const week = ['日', '月', '火', '水', '木', '金', '土'][j.weekday];
  return `${j.month}/${j.day}(${week}) ${pad2(j.hour)}:${pad2(j.minute)}`;
}

function japanShiftDays(j, n) {
  const noon = new Date(`${j.year}-${pad2(j.month)}-${pad2(j.day)}T12:00:00+09:00`).getTime();
  return japanParts(new Date(noon + n * 86400000));
}

function startOfLocalDay(d = new Date()) {
  return new Date(japanDayStartMs(d));
}

function toDateKey(d) {
  return japanTodayKey(d);
}

/** 近い自動支払いを日数順に最大件数返す { title, daysLeft, amountYen, amountLabel } */
export function getUpcomingPayments(payments, tasks, balloons, limit = 2) {
  const active = (payments || []).filter(p => p.status === 'active');
  if (active.length === 0) return [];

  const today = startOfLocalDay();
  const todayStr = toDateKey(today);
  const rows = [];

  for (const p of active) {
    const next = calcNextPaymentDate(p, today, todayStr);
    if (!next) continue;
    const daysLeft = Math.max(0, Math.round((startOfLocalDay(next) - today) / 86400000));
    const amountYen = scheduledPaymentAmount(p, tasks, balloons);
    rows.push({
      title: p.title || '支払い',
      daysLeft,
      amountYen,
      amountLabel: p.amountKind === 'percentLastMonth'
        ? `${formatPaymentAmountLabel(p)}（${amountYen}円）`
        : `${amountYen}円`
    });
  }

  rows.sort((a, b) => a.daysLeft - b.daysLeft || b.amountYen - a.amountYen);
  return rows.slice(0, Math.max(1, limit));
}

export function getNextPaymentInfo(payments) {
  return getUpcomingPayments(payments, [], [], 1)[0] || null;
}

function calcNextPaymentDate(p, today, todayStr) {
  if (p.mode === 'once') {
    if (!p.dueDate) return null;
    const [y, m, d] = String(p.dueDate).split('-').map(Number);
    const due = new Date(y, m - 1, d);
    if (p.lastChargedKey) return null;
    return due;
  }

  if (p.interval === 'weekly') {
    const days = (p.days || []).map(Number);
    const todayJ = japanParts(today);
    for (let i = 0; i <= 7; i++) {
      const candJ = japanShiftDays(todayJ, i);
      if (!days.includes(candJ.weekday)) continue;
      const candStr = `${candJ.year}-${candJ.month}-${candJ.day}`;
      if (i === 0 && p.lastChargedKey === todayStr) continue;
      return new Date(`${candJ.year}-${pad2(candJ.month)}-${pad2(candJ.day)}T00:00:00+09:00`);
    }
    return null;
  }

  if (p.interval === 'monthly') {
    const day = Number((p.days && p.days[0]) || 1);
    const todayJ = japanParts(today);
    const build = (y, m) => {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d = Math.min(day, last);
      return new Date(`${y}-${pad2(m)}-${pad2(d)}T00:00:00+09:00`);
    };
    let cand = build(todayJ.year, todayJ.month);
    const candKey = japanTodayKey(cand);
    if (cand.getTime() < today.getTime() || (candKey === todayStr && p.lastChargedKey === todayStr)) {
      const next = japanShiftDays({ ...todayJ, day: 1 }, 32);
      cand = build(next.year, next.month);
    }
    return cand;
  }
  return null;
}

/** 今月のスタンプ(1〜30)と連続お手伝い日数 */
export function getHelpStampData(tasks) {
  const approved = (tasks || []).filter(t => t.status === 'approved');
  const nowJ = japanParts();
  const year = nowJ.year;
  const month = nowJ.month - 1;
  const daysInMonth = new Date(Date.UTC(nowJ.year, nowJ.month, 0)).getUTCDate();
  const cardDays = Math.min(30, daysInMonth);

  const workDayKeys = new Set();
  const stamped = new Set();

  for (const t of approved) {
    const ts = t.completedAt || t.approvedAt || t.createdAt;
    if (!ts) continue;
    const j = japanParts(new Date(ts));
    workDayKeys.add(`${j.year}-${j.month}-${j.day}`);
    if (j.year === nowJ.year && j.month === nowJ.month) {
      if (j.day >= 1 && j.day <= cardDays) stamped.add(j.day);
    }
  }

  let streak = 0;
  let cursor = { ...nowJ };
  if (!workDayKeys.has(`${cursor.year}-${cursor.month}-${cursor.day}`)) {
    cursor = japanShiftDays(cursor, -1);
  }
  while (workDayKeys.has(`${cursor.year}-${cursor.month}-${cursor.day}`)) {
    streak++;
    cursor = japanShiftDays(cursor, -1);
  }

  return { cardDays, stamped, streak, year, month };
}

/**
 * 承認済み仕事を日本時間の日付ごとにまとめる（新しい日が先）。
 * @returns {{ key, year, month, day, weekday, total, items }[]}
 */
export function groupApprovedEarningsByDay(tasks) {
  const map = new Map();
  for (const t of tasks || []) {
    if (t.status !== 'approved') continue;
    const ts = t.approvedAt || t.completedAt || t.createdAt;
    if (!ts) continue;
    const j = japanParts(new Date(ts));
    const key = `${j.year}-${pad2(j.month)}-${pad2(j.day)}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: j.year,
        month: j.month,
        day: j.day,
        weekday: j.weekday,
        total: 0,
        items: []
      });
    }
    const g = map.get(key);
    const pts = Number(t.points) || 0;
    g.total += pts;
    g.items.push(t);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => (b.approvedAt || b.completedAt || b.createdAt || 0) - (a.approvedAt || a.completedAt || a.createdAt || 0));
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/**
 * 履歴用。獲得・使った・ギフトを日付ごとにまとめる（新しい日が先）。
 * items: { kind, label, points, at }
 */
export function groupPointActivityByDay({ tasks, tickets, exchanges, paymentLogs, banks, balloons, wishes }) {
  const rows = [];

  for (const t of tasks || []) {
    if (t.status !== 'approved') continue;
    const at = t.approvedAt || t.completedAt || t.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'earn',
      label: t.title || 'お仕事',
      titleKana: t.titleKana || '',
      points: Number(t.points) || 0,
      at
    });
  }

  for (const b of balloons || []) {
    if (b.status !== 'received') continue;
    const at = b.receivedAt || b.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'gift',
      label: b.message ? `ギフト「${b.message}」` : 'ギフト',
      points: Number(b.points) || 0,
      at
    });
  }

  for (const w of wishes || []) {
    if (w.status !== 'approved') continue;
    const at = w.approvedAt || w.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'gift',
      label: w.reason ? `おねがい「${w.reason}」` : 'こづかいのお願い',
      points: Number(w.points) || 0,
      at
    });
  }

  for (const t of tickets || []) {
    if (!['bought', 'used'].includes(t.status)) continue;
    const at = t.boughtAt || t.usedAt || t.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'spend',
      label: `チケット「${t.title || ''}」`,
      points: -(Number(t.price) || 0),
      at
    });
  }

  for (const e of exchanges || []) {
    if (e.status !== 'approved') continue;
    const at = e.approvedAt || e.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'spend',
      label: '換金',
      points: -(Number(e.points) || 0),
      at
    });
  }

  for (const p of paymentLogs || []) {
    const at = p.chargedAt || p.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'spend',
      label: p.title ? `支払い引落「${p.title}」` : '支払い引落',
      points: -(Number(p.points) || Number(p.amount) || 0),
      at
    });
  }

  for (const b of banks || []) {
    const at = b.createdAt;
    if (!at) continue;
    rows.push({
      kind: 'spend',
      label: '銀行へ預ける',
      points: -bankDepositPrincipal(b),
      at
    });
  }

  const map = new Map();
  for (const row of rows) {
    const j = japanParts(new Date(row.at));
    const key = `${j.year}-${pad2(j.month)}-${pad2(j.day)}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: j.year,
        month: j.month,
        day: j.day,
        weekday: j.weekday,
        earned: 0,
        spent: 0,
        gifted: 0,
        items: []
      });
    }
    const g = map.get(key);
    const pts = Number(row.points) || 0;
    if (row.kind === 'earn') g.earned += pts;
    else if (row.kind === 'gift') g.gifted += pts;
    else g.spent += Math.abs(pts);
    g.items.push(row);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** 市場レート（決定論的。range: 'week' | 'month' | 'all'） */
export const MARKET_ORDER = ['日本', 'アメリカ', '原油', '金'];

export const MARKET_META = {
  日本: { id: 'japan', label: '日本株（日経平均）', short: '日本株（日経平均）', buyLabel: '日本株（日経平均）を買う', color: '#334155', dash: [] },
  アメリカ: { id: 'us', label: '米国株（S&P 500）', short: '米国株（S&P 500）', buyLabel: '米国株（S&P 500）を買う', color: '#94a3b8', dash: [4, 4] },
  原油: { id: 'oil', label: '原油', short: '原油', buyLabel: '原油を買う', color: '#b45309', dash: [2, 2] },
  金: { id: 'gold', label: '金', short: '金', buyLabel: '金を買う', color: '#ca8a04', dash: [6, 3] }
};

export function marketNameFromId(id) {
  const hit = Object.entries(MARKET_META).find(([, m]) => m.id === id);
  return hit ? hit[0] : null;
}

/* ===== スプレッドシートの相場 =====
   Googleスプレッドシートを「ウェブに公開」した表を読んで、実際の値動きだけを使う。
   つながっていないあいだは倍率1.0（動かない）にし、疑似の上下は使わない。 */

// 列の見出しは家庭ごとに書き方が違うので、それらしい言葉で拾う
const SHEET_COLUMN_ALIASES = {
  日本: ['日本', '日本株', '日経', '日経平均', 'nikkei', 'japan', 'jp'],
  アメリカ: ['アメリカ', '米国', '米国株', 'sp500', 's&p500', 's&p', 'nasdaq', 'dow', 'us', 'usa'],
  原油: ['原油', 'オイル', 'oil', 'wti', 'crude', 'brent'],
  金: ['金', 'ゴールド', 'gold', 'xau']
};
const SHEET_DATE_ALIASES = ['日付', '日時', '年月日', 'date', 'day', 'datetime'];

/** 表のURLを、そのまま読めるCSVのURLに直す */
export function normalizeSheetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.includes('output=csv') || raw.includes('/gviz/tq')) return raw;

  // 「ウェブに公開」した /pub 形式
  if (raw.includes('/spreadsheets/d/e/')) {
    const [base, queryText = ''] = raw.split('?');
    const query = new URLSearchParams(queryText);
    query.set('single', 'true');
    query.set('output', 'csv');
    const path = `${base.replace(/\/(pubhtml|pub|edit|view)?\/*$/, '')}/pub`;
    return `${path}?${query.toString()}`;
  }

  // 通常の共有URL
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch) {
    const gidMatch = raw.match(/[#?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
  }
  return raw;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

function matchColumn(header, aliases) {
  const h = String(header || '').trim().toLowerCase();
  if (!h) return false;
  if (aliases.some(a => h === a)) return true;
  return aliases.some(a => a.length >= 2 && h.includes(a));
}

function parseSheetNumber(value) {
  const cleaned = String(value ?? '').replace(/[,¥$￥\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSheetDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // Google の Date(2026,7,17) 形式
  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (gviz) {
    return Date.UTC(Number(gviz[1]), Number(gviz[2]), Number(gviz[3]), 3) ;
  }
  const ymd = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) {
    return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 3);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 日付重複があれば後ろ（新しい取得結果）を優先して整列 */
function normalizePricePoints(points) {
  const map = new Map();
  for (const p of points) {
    if (!Number.isFinite(p.ms) || !Number.isFinite(p.price) || p.price <= 0) continue;
    map.set(p.ms, p.price);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, price]) => ({ ms, price }));
}

/**
 * CSVの本文から、市場ごとの値動きを取り出す。
 * 倍率は使わず、実際の価格をそのまま rate に入れる。
 * （以前の倍率基準ズレで、日をまたぐと数倍に見える不具合が出ていた）
 */
export function parseMarketSheetCsv(text) {
  const rows = parseCsv(String(text || ''));
  if (rows.length < 2) throw new Error('表のデータが足りません');

  const header = rows[0];
  const dateIndex = header.findIndex(h => matchColumn(h, SHEET_DATE_ALIASES));
  const columns = {};
  for (const [name, aliases] of Object.entries(SHEET_COLUMN_ALIASES)) {
    const index = header.findIndex((h, i) => i !== dateIndex && matchColumn(h, aliases));
    if (index >= 0) columns[name] = index;
  }
  if (!Object.keys(columns).length) {
    throw new Error('日本・アメリカ・原油・金 の列が見つかりません');
  }

  const series = {};
  for (const [name, index] of Object.entries(columns)) {
    const points = [];
    for (let r = 1; r < rows.length; r++) {
      const price = parseSheetNumber(rows[r][index]);
      if (price == null) continue;
      const ms = dateIndex >= 0 ? parseSheetDate(rows[r][dateIndex]) : r;
      points.push({ ms: ms ?? r, price });
    }
    const cleaned = normalizePricePoints(points);
    if (cleaned.length < 2) continue;
    series[name] = cleaned.map(p => ({ ms: p.ms, rate: p.price, price: p.price }));
  }
  if (!Object.keys(series).length) throw new Error('数字の入った行が見つかりません');
  return series;
}

let sheetSeries = null;

export function setMarketSheetSeries(series) {
  sheetSeries = series && Object.keys(series).length ? series : null;
}

export function getMarketSheetMarkets() {
  return sheetSeries ? Object.keys(sheetSeries) : [];
}

/** 表の最終日と、今日から何日遅れているか */
export function getMarketSheetInfo(now = new Date()) {
  if (!sheetSeries) return null;
  let lastMs = null;
  for (const pts of Object.values(sheetSeries)) {
    if (!pts?.length) continue;
    const ms = pts[pts.length - 1].ms;
    if (lastMs == null || ms > lastMs) lastMs = ms;
  }
  if (lastMs == null) return null;
  const last = japanParts(new Date(lastMs));
  const today = japanParts(now);
  const staleDays = Math.round(
    (Date.UTC(today.year, today.month - 1, today.day) -
      Date.UTC(last.year, last.month - 1, last.day)) / 86400000
  );
  return {
    lastMs,
    lastLabel: `${last.year}/${last.month}/${last.day}`,
    staleDays,
    isStale: staleDays > 4
  };
}

function sheetRateAt(name, ms) {
  const points = sheetSeries?.[name];
  if (!points || !points.length) return null;
  let value = points[0].rate;
  for (const p of points) {
    if (p.ms > ms) break;
    value = p.rate;
  }
  return value;
}

function sheetLatestRate(name) {
  const points = sheetSeries?.[name];
  return points && points.length ? points[points.length - 1].rate : null;
}

/** 銘柄名 → ニュース欄の見出し名 */
export const NEWS_ABOUT_BY_MARKET = {
  日本: '日経平均',
  アメリカ: 'S&P500',
  原油: '原油',
  金: '金'
};

/** ニュース見出し名 → 相場表の銘柄名 */
export const MARKET_BY_NEWS_ABOUT = {
  日経平均: '日本',
  'S&P500': 'アメリカ',
  原油: '原油',
  金: '金'
};

/** 表の直近2日の変化率（%）。取れなければ null */
export function getMarketMovePct(name) {
  const points = sheetSeries?.[name];
  if (!points || points.length < 2) return null;
  const a = Number(points[points.length - 2]?.rate);
  const b = Number(points[points.length - 1]?.rate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return ((b - a) / a) * 100;
}

/**
 * 学習用ニュースの「何が起きている？」1文。
 * アプリの相場表の直近変化だけを述べ、架空の事件は書かない。
 * 固定の％は news.json に書かず、ここで表から補完する。
 */
export function getNewsWhatHappened(about) {
  const market = MARKET_BY_NEWS_ABOUT[about];
  const label = about || market || '';
  if (!market) {
    return label
      ? `${label}について、経済のつながりを学ぶための解説です。`
      : '経済のつながりを学ぶための解説です。';
  }
  const pct = getMarketMovePct(market);
  if (!Number.isFinite(pct)) {
    return `${label}の直近の動きは、いま表からまだ読めません。下の「なぜ？」「くらしには？」で仕組みを見てみましょう。`;
  }
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0.4) {
    return `${label}の価格が上がっています（アプリの相場・前日比 約${abs}%）。`;
  }
  if (pct < -0.4) {
    return `${label}の価格が下がっています（アプリの相場・前日比 約${abs}%）。`;
  }
  return `${label}の価格はほぼ横ばいです（アプリの相場・前日比 約${abs}%）。`;
}

/** 5秒で読める1行。blurb があれば使い、値動きも添える（実在速報には見せない） */
export function getMarketFlashLine(marketName, newsItems) {
  const about = NEWS_ABOUT_BY_MARKET[marketName] || marketName;
  const pct = getMarketMovePct(marketName);
  const hit = (newsItems || []).find(n => n.about === about);
  const move = Number.isFinite(pct)
    ? (pct > 0.4
      ? `${about}↑ 約${pct.toFixed(1)}%`
      : pct < -0.4
        ? `${about}↓ 約${Math.abs(pct).toFixed(1)}%`
        : `${about}→ ほぼ横ばい`)
    : '';
  if (hit?.blurb && move) return `${move}　${hit.blurb}`;
  if (hit?.blurb) return hit.blurb;
  if (move) return move;
  if (hit?.title) return hit.title;
  return '';
}

export function rateForMarket(rates, name) {
  const r = rates && rates[name];
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/** 買ったときの価格。古い持ち株は購入日の表から復元する。
 * 正解: 今の価値 = 入れたpt × (今の価格 / 買った価格)。売る額は画面の今の価値。 */
export function getBuyRate(inv, currentRate) {
  const invested = Number(inv?.investedPoints) || 0;
  const shares = Number(inv?.shares);
  const implied = invested > 0 && shares > 0 ? invested / shares : null;
  const cur = Number(currentRate);
  const ok = (r) => {
    const n = Number(r);
    if (!(n > 0)) return false;
    if (!(cur > 0)) return true;
    // 相場が数千なのに買値1、のような壊れた値は使わない（元本850が数万に見える）
    return n >= cur / 8 && n <= cur * 8;
  };

  const stored = Number(inv?.buyRate);
  if (ok(stored)) return stored;
  if (ok(implied)) return implied;

  const hist = Number(inv?.createdAt) > 0 ? sheetRateAt(inv.name, inv.createdAt) : null;
  if (hist > 0) return hist;
  return cur > 0 ? cur : 1;
}

/** 口数。今の価値は getHoldingShares(inv, rate) * rate */
export function getHoldingShares(inv, rate) {
  const invested = Number(inv.investedPoints) || 0;
  const buy = getBuyRate(inv, rate);
  return invested > 0 && buy > 0 ? invested / buy : 0;
}

export function getHoldingValue(inv, rate) {
  return getHoldingShares(inv, rate) * (Number(rate) || 0);
}

/** 株全体の現在価値。stockCap を超えた値上がり分は反映しない。 */
export function getInvestmentPortfolioValue(investments, rates, stockCap) {
  const raw = (investments || []).reduce((sum, inv) => {
    const rate = rateForMarket(rates, inv.name);
    return sum + getHoldingShares(inv, rate) * rate;
  }, 0);
  const cap = Number(stockCap);
  return Math.round(Number.isFinite(cap) && cap > 0 ? Math.min(raw, cap) : raw);
}

/** 株上限を各保有銘柄へ現在価値の比率で配分した売却価値。 */
export function getInvestmentValues(investments, rates, stockCap) {
  const rows = (investments || []).map(inv => {
    const rate = rateForMarket(rates, inv.name);
    return { id: inv.id, raw: getHoldingShares(inv, rate) * rate };
  });
  const rawTotal = rows.reduce((sum, row) => sum + row.raw, 0);
  const cap = Number(stockCap);
  const scale = Number.isFinite(cap) && cap > 0 && rawTotal > cap ? cap / rawTotal : 1;
  return Object.fromEntries(rows.map(row => [row.id, Math.round(row.raw * scale)]));
}

/** 長い時系列を、先頭・末尾を残して最大 maxN 点に間引く */
function thinSeries(points, maxN = 56) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= maxN) return points.slice();
  const out = [];
  const last = points.length - 1;
  let prevIdx = -1;
  for (let i = 0; i < maxN; i++) {
    const idx = Math.round((i * last) / (maxN - 1));
    if (idx === prevIdx) continue;
    out.push(points[idx]);
    prevIdx = idx;
  }
  return out;
}

/** 軸ラベルは常に 月/日（〇/〇） */
function chartDayLabel(ms) {
  const j = japanParts(new Date(ms));
  return `${j.month}/${j.day}`;
}

/** その銘柄（または全体）で最初に運用を始めた時刻 */
function firstInvestMs(investments, logs, name = null) {
  let min = null;
  const consider = (v) => {
    const n = Number(v);
    if (!(n > 0)) return;
    // 明らかに壊れた古い日付は無視
    if (n < Date.parse('2024-01-01T00:00:00+09:00')) return;
    if (min == null || n < min) min = n;
  };
  for (const inv of investments || []) {
    if (name && inv.name !== name) continue;
    if (inv.status === 'sold' && !(Number(inv.investedPoints) > 0)) continue;
    consider(inv.createdAt);
  }
  for (const log of logs || []) {
    if (log.type === 'eod') continue;
    // 自動補完ログは開始日判定に使わない（昔の日に元本が載る原因になる）
    if (log.backfilled) continue;
    if (name && log.name !== name) continue;
    if (!isTradeLog(log)) continue;
    consider(log.at);
  }
  return min;
}

/**
 * 市場レートの時系列。
 * range: 'day' | 'week' | 'month'
 * opts.fromMs: 運用開始日。これより前の日はグラフに出さない。
 */
export function getMarketRates(range = 'month', opts = {}) {
  const now = new Date();
  const rates = { labels: [], ms: [] };
  for (const name of MARKET_ORDER) rates[name] = [];

  const reference = MARKET_ORDER
    .map(name => sheetSeries?.[name])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];

  const fillRates = (points) => {
    let pts = points;
    if (pts.length === 1) {
      const only = pts[0];
      pts = [{ ms: only.ms - 86400000 }, only];
    }
    for (const p of pts) {
      rates.labels.push(chartDayLabel(p.ms));
      rates.ms.push(p.ms);
      for (const name of MARKET_ORDER) {
        const fallback = sheetLatestRate(name) ?? 1;
        rates[name].push(sheetRateAt(name, p.ms) ?? fallback);
      }
    }
    return rates;
  };

  const end = japanDayStartMs(now);
  const fromFloor = opts.fromMs != null ? japanDayStartMs(new Date(opts.fromMs)) : null;

  let steps = 30;
  if (range === 'day') steps = 1;
  else if (range === 'week') steps = 7;
  else if (range === 'month') steps = 30;

  let points;
  if (reference) {
    points = reference.slice(-steps);
  } else {
    points = [];
    for (let i = steps - 1; i >= 0; i--) {
      points.push({ ms: japanDayStartMs(new Date(now.getTime() - i * 86400000)) });
    }
  }
  // 株を入れる前の日は切る（表が古い日まであっても元本0の線を引かない）
  if (fromFloor != null) {
    points = points.filter(p => p.ms >= fromFloor);
    if (!points.length) points = [{ ms: end }];
  }
  return fillRates(points);
}

/** いま運用中の株だけ（売却済みは除く） */
export function getActiveInvestments(investments) {
  return (investments || []).filter(inv => inv.status !== 'sold');
}

/** グラフに出せる銘柄（いま持っている + 売却済みの履歴があるもの）。EOD用など */
export function getChartMarketNames(investments, logs) {
  const names = new Set();
  for (const inv of investments || []) {
    if (MARKET_ORDER.includes(inv.name)) names.add(inv.name);
  }
  for (const log of logs || []) {
    if (MARKET_ORDER.includes(log.name)) names.add(log.name);
  }
  return MARKET_ORDER.filter(n => names.has(n));
}

/** いま保有中の銘柄だけ（自分の資産推移グラフ用） */
export function getHeldMarketNames(investments) {
  const names = new Set();
  for (const inv of getActiveInvestments(investments)) {
    if (MARKET_ORDER.includes(inv.name)) names.add(inv.name);
  }
  return MARKET_ORDER.filter(n => names.has(n));
}

function isTradeLog(log) {
  const t = log?.type;
  return t === 'buy' || t === 'sell';
}

/** ある銘柄について、untilMs までに発生した buy/sell を再生（EOD・グラフ用） */
export function replayInvestmentPosition(logs, name, untilMs, { excludeBackfilled = true } = {}) {
  let principal = 0;
  let shares = 0;
  const events = (logs || [])
    .filter(l => l.name === name && isTradeLog(l))
    .filter(l => !excludeBackfilled || !l.backfilled)
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  for (const log of events) {
    const at = Number(log.at) || 0;
    if (!at || at > untilMs) continue;
    const pts = Number(log.investedPoints) || 0;
    const sh = Number(log.shares) || 0;
    if (log.type === 'buy') {
      principal += pts;
      shares += sh;
    } else if (log.type === 'sell') {
      principal = Math.max(0, principal - pts);
      shares = Math.max(0, shares - sh);
    }
  }
  return { principal, shares };
}

function eodLogForDay(logs, name, dayKey) {
  let best = null;
  for (const log of logs || []) {
    if (log.type !== 'eod' || log.name !== name) continue;
    if (String(log.dayKey || '') !== dayKey) continue;
    if (!best || (Number(log.at) || 0) > (Number(best.at) || 0)) best = log;
  }
  return best;
}

function applyEodCapToRows(rows, stockCap) {
  const cap = Number(stockCap);
  const totalRaw = rows.reduce((sum, r) => sum + (Number(r.assetsRaw) || 0), 0);
  const scale = Number.isFinite(cap) && cap > 0 && totalRaw > cap ? cap / totalRaw : 1;
  return rows.map(r => ({
    name: r.name,
    investedPoints: Math.round(Number(r.investedPoints) || 0),
    shares: Number(r.shares) || 0,
    assets: Math.round((Number(r.assetsRaw) || 0) * scale),
    at: r.at
  }));
}

function eodAssetRaw(name, shares, principal, priceMs) {
  const sh = Number(shares) || 0;
  const price = sheetRateAt(name, priceMs) ?? sheetLatestRate(name) ?? 1;
  if (sh > 0 && price > 0) return sh * price;
  return Number(principal) || 0;
}

/** 日次EOD行（銘柄別 + __total__）。buy/sellログ再生のみ。investments累計は使わない */
export function buildInvestmentEodRows(investments, logs, dayKey, stockCap = null) {
  const start = msFromJapanDayKey(dayKey);
  const end = start + 86400000 - 1;
  const names = getChartMarketNames(investments, logs);
  const perName = [];
  for (const name of names) {
    const pos = replayInvestmentPosition(logs, name, end, { excludeBackfilled: true });
    if (!(pos.principal > 0 || pos.shares > 0)) continue;
    perName.push({
      name,
      investedPoints: pos.principal,
      shares: pos.shares,
      assetsRaw: eodAssetRaw(name, pos.shares, pos.principal, end),
      at: end
    });
  }
  const capped = applyEodCapToRows(perName, stockCap);
  const totalPrincipal = capped.reduce((s, r) => s + r.investedPoints, 0);
  const totalAssets = capped.reduce((s, r) => s + r.assets, 0);
  if (totalPrincipal > 0 || totalAssets > 0) {
    capped.push({
      name: CHART_TOTAL,
      investedPoints: totalPrincipal,
      shares: 0,
      assets: totalAssets,
      at: end
    });
  }
  return capped;
}

export const INVESTMENT_EOD_MIGRATION_KEY = '242';

function collectEodMigrationDayKeys(logs, throughDayKey) {
  const keys = new Set();
  for (const log of logs || []) {
    if (log.type === 'eod' && log.dayKey && log.dayKey <= throughDayKey) keys.add(log.dayKey);
  }
  let firstMs = null;
  for (const log of logs || []) {
    if ((log.type === 'buy' || log.type === 'sell') && !log.backfilled) {
      const at = Number(log.at) || 0;
      if (at > 0 && (firstMs == null || at < firstMs)) firstMs = at;
    }
  }
  if (firstMs == null) return [...keys].sort();
  const throughMs = msFromJapanDayKey(throughDayKey);
  for (let ms = japanDayStartMs(new Date(firstMs)); ms <= throughMs; ms += 86400000) {
    keys.add(japanTodayKey(new Date(ms)));
  }
  return [...keys].filter(k => k <= throughDayKey).sort();
}

/** 保存済み EOD と buy/sell 再生結果を比較（移行・グラフ検証用） */
export function analyzeInvestmentEodMigration(investments, logs, stockCap, { throughDayKey = null, sheetReady = true } = {}) {
  const through = throughDayKey || japanYesterdayKey();
  const dayKeys = collectEodMigrationDayKeys(logs, through);
  const toFix = [];
  const unchanged = [];

  for (const dayKey of dayKeys) {
    const computed = buildInvestmentEodRows(investments, logs, dayKey, stockCap);
    const computedByName = new Map(computed.map(r => [r.name, r]));
    const existingEods = (logs || []).filter(l => l.type === 'eod' && l.dayKey === dayKey);
    const nameSet = new Set([...computedByName.keys(), ...existingEods.map(e => e.name)]);

    for (const name of nameSet) {
      const endAt = msFromJapanDayKey(dayKey) + 86400000 - 1;
      const expected = computedByName.get(name) || {
        name,
        investedPoints: 0,
        shares: 0,
        assets: 0,
        at: endAt
      };
      const stored = existingEods.find(e => e.name === name);
      const ep = Math.round(Number(expected.investedPoints) || 0);
      const ea = Math.round(Number(expected.assets) || 0);

      if (!stored) {
        if (ep > 0 || ea > 0) {
          toFix.push({ dayKey, name, action: 'create', row: expected });
        }
        continue;
      }

      const sp = Math.round(Number(stored.investedPoints) || 0);
      const sa = Math.round(Number(stored.assets) || 0);
      const principalMismatch = Math.abs(sp - ep) > 0.5;
      const assetsMismatch = sheetReady && Math.abs(sa - ea) > 1;
      if (principalMismatch || assetsMismatch) {
        toFix.push({
          dayKey,
          name,
          action: ep > 0 || ea > 0 ? 'replace' : 'zero',
          row: expected,
          stored: { principal: sp, assets: sa, finalized: !!stored.finalized }
        });
      } else {
        unchanged.push({ dayKey, name });
      }
    }
  }

  return { toFix, unchanged, dayKeys, throughDayKey: through };
}

function eodMatchesReplay(stored, expected) {
  if (!stored || !expected) return false;
  const sp = Math.round(Number(stored.investedPoints) || 0);
  const ep = Math.round(Number(expected.investedPoints) || 0);
  const sa = Math.round(Number(stored.assets) || 0);
  const ea = Math.round(Number(expected.assets) || 0);
  return Math.abs(sp - ep) <= 0.5 && Math.abs(sa - ea) <= 1;
}

/** 過去日グラフ: 保存 EOD が buy/sell 再生と一致するときだけ採用、不一致は再生結果 */
function getPastDayChartSnapshot(investments, logList, dayKey, stockCap, targetName, isTotal) {
  const computedRows = buildInvestmentEodRows(investments, logList, dayKey, stockCap);
  const expected = isTotal
    ? (computedRows.find(r => r.name === CHART_TOTAL) || { investedPoints: 0, assets: 0 })
    : (computedRows.find(r => r.name === targetName) || { investedPoints: 0, assets: 0 });

  const storedEod = isTotal
    ? eodLogForDay(logList, CHART_TOTAL, dayKey)
    : eodLogForDay(logList, targetName, dayKey);

  if (storedEod && eodMatchesReplay(storedEod, expected)) {
    return {
      principal: Math.round(Number(storedEod.investedPoints) || 0),
      assets: Math.round(Number(storedEod.assets) || 0)
    };
  }

  return {
    principal: expected.investedPoints || 0,
    assets: expected.assets || 0
  };
}

/** 今日のdraft（現在時点の buy/sell 再生 + 現在相場） */
function buildTodayDraftSnapshot(investments, logs, stockCap) {
  const endMs = Date.now();
  const names = getChartMarketNames(investments, logs);
  const perName = [];
  for (const name of names) {
    const pos = replayInvestmentPosition(logs, name, endMs, { excludeBackfilled: true });
    if (!(pos.principal > 0 || pos.shares > 0)) continue;
    perName.push({
      name,
      investedPoints: pos.principal,
      shares: pos.shares,
      assetsRaw: eodAssetRaw(name, pos.shares, pos.principal, endMs),
      at: endMs
    });
  }
  const capped = applyEodCapToRows(perName, stockCap);
  const byName = new Map(capped.map(r => [r.name, r]));
  const total = capped.reduce((acc, r) => ({
    investedPoints: acc.investedPoints + r.investedPoints,
    assets: acc.assets + r.assets
  }), { investedPoints: 0, assets: 0 });
  return { byName, total };
}

export const CHART_TOTAL = '__total__';

/**
 * いま保有中の1銘柄について、追加購入を日付ごとに分けたロット。
 * 口数は必ず principal / 健全な買値 で求める（ログの shares や壊れた buyRate=1 を信用しない）。
 * 追加購入分を購入前の日付へ遡らせない。
 */
function saneMarketRate(candidate, refRate) {
  const n = Number(candidate);
  const ref = Number(refRate);
  if (!(n > 0)) return null;
  // カード側 getBuyRate と同じ：相場と桁が違う買値は捨てる
  if (ref > 0 && (n < ref / 8 || n > ref * 8)) return null;
  return n;
}

function lotBuyRate(inv, atMs, logRate) {
  const name = inv?.name;
  const sheetAt = atMs > 0 ? sheetRateAt(name, atMs) : null;
  const latest = sheetLatestRate(name);
  const ref = (sheetAt > 0 ? sheetAt : null) || (latest > 0 ? latest : null) || 1;
  const invested = Number(inv?.investedPoints) || 0;
  const docShares = Number(inv?.shares);
  const implied = invested > 0 && docShares > 0 ? invested / docShares : null;
  return saneMarketRate(logRate, ref)
    || saneMarketRate(inv?.buyRate, ref)
    || saneMarketRate(implied, ref)
    || saneMarketRate(sheetAt, ref)
    || saneMarketRate(latest, ref)
    || ref;
}

function buyLotsForActiveInv(inv, logs) {
  const name = inv?.name;
  const heldPts = Number(inv?.investedPoints) || 0;
  if (!name || !(heldPts > 0)) return [];

  const created = Number(inv.createdAt) || 0;
  const createdDay = created > 0 ? japanDayStartMs(new Date(created)) : 0;
  const buys = (logs || [])
    .filter(l => l.name === name && l.type === 'buy' && Number(l.at) > 0)
    .filter(l => !createdDay || japanDayStartMs(new Date(l.at)) >= createdDay)
    .sort((a, b) => (a.at || 0) - (b.at || 0));

  const lots = [];
  for (const b of buys) {
    const pts = Number(b.investedPoints) || 0;
    if (!(pts > 0)) continue;
    const at = Number(b.at) || 0;
    const rate = lotBuyRate(inv, at, b.rate);
    const sh = rate > 0 ? pts / rate : 0;
    if (!(sh > 0)) continue;
    lots.push({ at, principal: pts, shares: sh });
  }

  let loggedPts = lots.reduce((sum, l) => sum + l.principal, 0);
  if (heldPts > loggedPts + 0.5) {
    const gap = heldPts - loggedPts;
    const at = created > 0 ? created : Date.now();
    const rate = lotBuyRate(inv, at, inv.buyRate);
    const sh = rate > 0 ? gap / rate : 0;
    if (sh > 0) {
      lots.unshift({ at, principal: gap, shares: sh });
      lots.sort((a, b) => (a.at || 0) - (b.at || 0));
    }
    loggedPts = lots.reduce((sum, l) => sum + l.principal, 0);
  } else if (loggedPts > heldPts + 0.5) {
    let excess = loggedPts - heldPts;
    for (let i = lots.length - 1; i >= 0 && excess > 0.5; i--) {
      const take = Math.min(lots[i].principal, excess);
      const prev = lots[i].principal;
      lots[i].principal = prev - take;
      if (prev > 0) lots[i].shares *= lots[i].principal / prev;
      excess -= take;
      if (!(lots[i].principal > 0.5)) lots.splice(i, 1);
    }
  }

  if (!lots.length) {
    const at = created > 0 ? created : Date.now();
    const rate = lotBuyRate(inv, at, inv.buyRate);
    lots.push({
      at,
      principal: heldPts,
      shares: rate > 0 ? heldPts / rate : 0
    });
  }
  return lots;
}

/** ある日までに有効なロット合計（追加購入前の日には後からの口数を載せない） */
function positionFromBuyLots(lots, dayMs) {
  const dayStart = japanDayStartMs(new Date(dayMs));
  let principal = 0;
  let shares = 0;
  for (const lot of lots || []) {
    const at = Number(lot.at) || 0;
    if (!at || japanDayStartMs(new Date(at)) > dayStart) continue;
    principal += Number(lot.principal) || 0;
    shares += Number(lot.shares) || 0;
  }
  return { principal, shares };
}

/**
 * 運用資産の期間内推移。
 * 過去日: buy/sell 再生と一致する保存 EOD。不一致は再生結果（investments 累計は使わない）。
 * 今日: buy/sell ログ再生 + 現在相場の draft。
 */
export function getPortfolioHistory(investments, range = 'week', name = null, logs = null, stockCap = null) {
  const logList = logs || [];
  const list = getActiveInvestments(investments);
  const nameSet = new Set(getHeldMarketNames(list));
  for (const log of logList) {
    if (log.type === 'eod' && log.name && log.name !== CHART_TOTAL && MARKET_ORDER.includes(log.name)) {
      nameSet.add(log.name);
    }
    if (isTradeLog(log) && MARKET_ORDER.includes(log.name)) nameSet.add(log.name);
  }
  const names = MARKET_ORDER.filter(n => nameSet.has(n));

  const wantTotal = name === CHART_TOTAL || name == null || name === '';
  const targetName = wantTotal
    ? CHART_TOTAL
    : ((name && names.includes(name)) ? name : CHART_TOTAL);
  const isTotal = targetName === CHART_TOTAL;
  const empty = {
    labels: [],
    ms: [],
    principal: [],
    assets: [],
    name: targetName,
    isTotal,
    empty: true
  };

  const hasEod = logList.some(l => l.type === 'eod');
  const hasTrades = logList.some(l => isTradeLog(l) && !l.backfilled);
  if (!names.length && !hasEod && !hasTrades) return empty;

  let fromMs = null;
  for (const log of logList) {
    if (log.type === 'eod' && log.dayKey) {
      const ms = msFromJapanDayKey(log.dayKey);
      if (ms > 0 && (fromMs == null || ms < fromMs)) fromMs = ms;
    }
    if (isTradeLog(log) && !log.backfilled) {
      const at = Number(log.at) || 0;
      if (at > 0 && (fromMs == null || at < fromMs)) fromMs = at;
    }
  }

  const safeRange = ['day', 'week', 'month'].includes(range) ? range : 'week';
  const rates = getMarketRates(safeRange, fromMs != null ? { fromMs } : {});
  const todayKey = japanTodayKey();
  const principal = [];
  const assets = [];

  for (let i = 0; i < rates.labels.length; i++) {
    const ms = rates.ms[i];
    const dayKey = japanTodayKey(new Date(ms));

    if (dayKey === todayKey) {
      const draft = buildTodayDraftSnapshot(investments, logList, stockCap);
      if (isTotal) {
        principal.push(draft.total.investedPoints);
        assets.push(draft.total.assets);
      } else {
        const row = draft.byName.get(targetName) || { investedPoints: 0, assets: 0 };
        principal.push(row.investedPoints);
        assets.push(row.assets);
      }
    } else {
      const row = getPastDayChartSnapshot(investments, logList, dayKey, stockCap, targetName, isTotal);
      principal.push(row.principal);
      assets.push(row.assets);
    }
  }

  const hasData = principal.some(p => p > 0) || assets.some(a => a > 0);
  if (!hasData) return empty;

  return { labels: rates.labels, ms: rates.ms, principal, assets, name: targetName, isTotal, empty: false };
}

/** 売買・評価用の現在レート（表示期間に依存しない）。表の実データだけ。 */
export function getCurrentMarketRates() {
  const out = {};
  for (const name of MARKET_ORDER) out[name] = sheetLatestRate(name) ?? 1;
  return out;
}

/** いま表から相場が取れる市場だけ */
export function getTradeableMarkets() {
  return getMarketSheetMarkets().filter(name => MARKET_ORDER.includes(name));
}

/** buy/sell 再生・上限適用の自己検証（v242 EOD 修正） */
export function selfTestInvestmentEodLogic() {
  const endOf = (dayKey) => msFromJapanDayKey(dayKey) + 86400000 - 1;
  const at = (dayKey, hour) => msFromJapanDayKey(dayKey) + hour * 3600000;
  const logs = [
    { type: 'buy', name: 'テスト株', investedPoints: 500, shares: 10, at: at('2026-08-24', 12) },
    { type: 'buy', name: 'テスト株', investedPoints: 300, shares: 6, at: at('2026-08-26', 12) }
  ];
  const invDoc = { name: 'テスト株', investedPoints: 1000, shares: 20 };

  const cases = [];
  cases.push(['8/24=500', replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-24')).principal === 500]);
  cases.push(['8/25=500', replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-25')).principal === 500]);
  cases.push(['8/26=800', replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-26')).principal === 800]);
  cases.push(['8/25 no extra buy', replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-25')).principal === 500]);
  cases.push(['ignores inv doc', replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-24')).principal === 500 && invDoc.investedPoints === 1000]);
  const capped = applyEodCapToRows([{ name: 'A', investedPoints: 800, shares: 8, assetsRaw: 1200, at: 0 }], 1000);
  cases.push(['cap on assets only', capped[0].investedPoints === 800 && capped[0].assets === 1000]);
  cases.push(['past stable after later buy',
    replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-24')).principal === 500 &&
    replayInvestmentPosition(logs, 'テスト株', endOf('2026-08-25')).principal === 500
  ]);

  const failed = cases.filter(([, ok]) => !ok).map(([name]) => name);
  return { ok: failed.length === 0, failed, cases: cases.map(([name, ok]) => ({ name, ok })) };
}
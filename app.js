import { state } from './state.js?v=262';
import { render, drawInvestChart } from './ui.js?v=262';
import { applyFuriganaState, requestPushPermission, sendPushNotification, getTemplateIdFromTask, dateKeyToValue, getCurrentMarketRates, japanTodayKey, japanYesterdayKey, japanParts, japanDeadlineMs, msUntilJapanMidnight, marketNameFromId, MARKET_META, MARKET_ORDER, getInvestmentPortfolioValue, getHoldingValue, getHoldingShares, getInvestmentValues, getActiveInvestments, buildInvestmentEodRows, analyzeInvestmentEodMigration, INVESTMENT_EOD_MIGRATION_KEY, selfTestInvestmentEodLogic, normalizeSheetUrl, parseMarketSheetCsv, setMarketSheetSeries, scheduledPaymentAmount, shouldSweepExpiredTask, isScheduledPaymentDue, lastScheduledPaymentDueKey, bankDepositBalance, clearInstallBrowserHelp, isStandalonePwa, getLineInstallGateKind } from './utils.js?v=262';
import { showAlert, showConfirm, showPrompt, showToast, setBusy } from './dialog.js?v=262';
import { startTutorial, hasSeenTutorial } from './tutorial.js?v=262';
import { initPush, isPushActive, isPushSupported, requestPushPermission as askPushPermission, unregisterPush, getPushError } from './push.js?v=262';
import { db, auth, firebaseApp } from './firebase.js?v=262';
import {
  computeBankInterestState,
  bankInterestStateChanged,
  bankInterestWritePayload,
  initialBankDepositFields,
  selfTestBankInterestLogic
} from './bankInterest.js?v=262';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, setDoc, getDoc, getDocs, increment, deleteDoc, writeBatch, runTransaction, arrayUnion, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, signInAnonymously, signOut, isSignInWithEmailLink, signInWithEmailLink, updatePassword, verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

const BOOT_PERF_MODULE_START = performance.now();
let BOOT_PERF_BOOT_START = null;

const APP_URL = 'https://whinaotona-debug.github.io/ienomics/index.html';
const DEFAULT_STOCK_CAP = 10000;
function parseFamilyStockCap(data) {
  if (!data || data.stockCap == null || data.stockCap === '') return DEFAULT_STOCK_CAP;
  const n = Number(data.stockCap);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_STOCK_CAP;
  if (n === 0) return null;
  return n;
}
function todayKeyString() {
  return japanTodayKey();
}
function taskGeneratedKey(t) {
  return t?.generatedKey || t?.generatedKey || '';
} 
let unsubscribes = [];

/**
 * Firestore の複数 onSnapshot が同じタイミングで来ても、
 * 全画面 render を1フレームにまとめる（リアルタイム性は維持）。
 * ユーザー操作は従来どおり即 render() を呼ぶ。
 */
let renderRaf = 0;
function scheduleRender() {
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    render();
  });
}

/* ===== 起動ウォッチドッグ =====
 * index.html の「よみこみ中...」は render() が走るまで残る。
 * auth / getDoc / onSnapshot が止まったときに永久停止しないようにする。 */
const BOOT_SLOW_MS = 12000;
const BOOT_AWAIT_MS = 25000;
let bootReady = false;
let bootWatchTimer = null;
let bootPhase = 'script';

function bootLog(msg, detail) {
  if (detail !== undefined) console.log(`[boot] ${bootPhase}: ${msg}`, detail);
  else console.log(`[boot] ${bootPhase}: ${msg}`);
}

function bootPerfSuffix() {
  const now = performance.now();
  const moduleMs = Math.round(now - BOOT_PERF_MODULE_START);
  if (BOOT_PERF_BOOT_START == null) {
    return ` +${moduleMs}ms (module)`;
  }
  const bootMs = Math.round(now - BOOT_PERF_BOOT_START);
  return ` +${bootMs}ms (module +${moduleMs}ms)`;
}

function bootDebugLog(msg, detail) {
  const line = `[boot-debug] ${msg}${bootPerfSuffix()}`;
  if (detail !== undefined) console.log(line, detail);
  else console.log(line);
}

function markBootPerfBootStart() {
  BOOT_PERF_BOOT_START = performance.now();
}

bootDebugLog('module evaluated');
bootDebugLog('eod self-test', selfTestInvestmentEodLogic());
bootDebugLog('bank interest self-test', selfTestBankInterestLogic());
window.__ieBootPerfLog = bootDebugLog;

let listenerSnapLogged = {};
let bootFamiliesSnapReady = false;
let bootTasksSnapReady = false;
let bootFirstRenderDone = false;
let setupListenersPhase2Done = false;

function resetBootRenderGate() {
  bootFamiliesSnapReady = false;
  bootTasksSnapReady = false;
  bootFirstRenderDone = false;
  setupListenersPhase2Done = false;
}

/** Phase1: families+tasks 初回到着まで render しない。以降は通常の scheduleRender */
function scheduleBootAwareRender() {
  if (bootFirstRenderDone) {
    scheduleRender();
    return;
  }
  if (bootFamiliesSnapReady && bootTasksSnapReady) {
    bootFirstRenderDone = true;
    bootDebugLog('boot first render gate open');
    scheduleRender();
    registerSetupListenersPhase2();
  }
}

function registerSetupListenersPhase2() {
  if (setupListenersPhase2Done || !state.familyCode) return;
  setupListenersPhase2Done = true;
  bootDebugLog('setupListeners phase2 start', { familyCode: state.familyCode });
  attachSetupListenersPhase2();
  bootDebugLog('setupListeners phase2 done');
}

function setBootPhase(phase) {
  bootPhase = phase;
  bootLog('phase');
}

function markBootReady(reason) {
  if (bootReady) return;
  bootReady = true;
  try { window.__ieBootReady = true; } catch (e) {}
  if (bootWatchTimer) {
    clearTimeout(bootWatchTimer);
    bootWatchTimer = null;
  }
  console.log(`[boot] ready (${reason}) phase=${bootPhase}`);
}

function showBootSlowScreen() {
  if (bootReady) return;
  if (getLineInstallGateKind() || window.__ieInstallGateLine) return;
  const app = document.getElementById('app');
  if (!app) return;
  bootLog('slow UI shown — still waiting for Firebase');
  console.warn('[boot] slow: still waiting after', BOOT_SLOW_MS, 'ms, phase=', bootPhase);
  app.innerHTML = `
    <div class="h-full flex flex-col items-center justify-center gap-4 px-6 text-center font-bold text-[#5f7970]" role="status">
      <div class="ie-boot-spinner" aria-hidden="true"></div>
      <p class="text-sm text-[#2c3d38]">読み込みに時間がかかっています</p>
      <p class="text-[11px] leading-relaxed text-[#7a8f88]">通信状況を確認してもう一度お試しください。<br>しばらくしてから自動で進む場合もあります。</p>
      <button type="button" onclick="typeof reloadApp==='function'?reloadApp():location.reload()" class="solid-btn primary-btn px-5 py-3 text-xs font-bold mt-1">もう一度読み込む</button>
    </div>`;
}

function startBootWatchdog() {
  if (bootWatchTimer) clearTimeout(bootWatchTimer);
  bootWatchTimer = setTimeout(() => {
    if (bootReady) return;
    showBootSlowScreen();
  }, BOOT_SLOW_MS);
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}がタイムアウトしました`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** 実画面に遷移したときだけ true（関数の有無ではない） */
window.__ieBootReady = false;
/** ui.js の render が実画面を描いたときに呼ぶ */
window.__ieMarkBootReady = markBootReady;

/**
 * 同じ処理が同時に走らないようにする。
 * 二重タップでポイントが二重に増減するのを防ぐ。
 */
const runningActions = new Set();
async function guard(key, fn, { busy = true, busyLabel = '通信中...' } = {}) {
  if (runningActions.has(key)) return;
  runningActions.add(key);
  if (busy) setBusy(true, busyLabel);
  try {
    return await fn();
  } catch (error) {
    console.error(`[${key}]`, error);
    await showAlert(friendlyError(error), { title: 'うまくいきませんでした' });
  } finally {
    runningActions.delete(key);
    if (busy) setBusy(false);
  }
}

/** Firebase のエラーコードを、家族が読んで分かる文にする */
function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'permission-denied') {
    return 'もう一度お試しください。';
  }
  if (code === 'unavailable' || code === 'auth/network-request-failed') {
    return 'ネットワークにつながりませんでした。通信状況を確認してもう一度お試しください。';
  }
  if (code === 'auth/too-many-requests' || code === 'functions/resource-exhausted') {
    return error?.message || '試行回数が多すぎます。しばらく待ってからお試しください。';
  }
  const msg = String(error?.message || '').trim();
  if (!msg || /権限|permission|Permission|authorized|Unauthorized/i.test(msg)) {
    return 'もう一度お試しください。';
  }
  return msg;
}

const functionsAsia = getFunctions(firebaseApp, 'asia-northeast1');

/** Callable のエラーを既存の auth/* 分岐に合わせる */
function mapAuthEmailCallableError(error) {
  const details = error?.details;
  const authCode = details?.authCode;
  if (authCode) {
    const err = new Error(error?.message || 'メール送信に失敗しました');
    err.code = authCode;
    return err;
  }
  const code = String(error?.code || '');
  if (code === 'functions/already-exists' || code.endsWith('/already-exists')) {
    const err = new Error(error?.message || 'このメールアドレスはすでに登録されています');
    err.code = 'auth/email-already-in-use';
    return err;
  }
  if (code === 'functions/not-found' || code.endsWith('/not-found')) {
    const err = new Error(error?.message || 'このメールアドレスのアカウントが見つかりません');
    err.code = 'auth/user-not-found';
    return err;
  }
  if (code === 'functions/invalid-argument' || code.endsWith('/invalid-argument')) {
    const err = new Error(error?.message || 'メールアドレスの形式が正しくありません');
    err.code = 'auth/invalid-email';
    return err;
  }
  return error;
}

/** 紛らわしい文字（0/O、1/I/L）を避けた6文字の同期IDを、重複しないように作る */
async function generateFamilyCode() {
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    let code = '';
    for (let i = 0; i < 6; i++) code += CHARS[buf[i] % CHARS.length];
    const snap = await getDoc(doc(db, "families", code));
    if (!snap.exists()) return code;
  }
  throw new Error('同期IDを作れませんでした。もう一度お試しください。');
}

/** 子供端末は匿名アカウントでログインする（Firestoreのルールで守るため） */
async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  setBootPhase('anon-auth');
  const cred = await withTimeout(signInAnonymously(auth), BOOT_AWAIT_MS, '匿名ログイン');
  return cred.user;
}

/**
 * 端末内だけで出す通知。
 * サーバー通知（FCM）が動いているときは、同じ内容が2回出るので何もしない。
 * FCM が使えない環境（未設定・許可なし・古いブラウザ）のときの控えとして残している。
 */
function localNotify(title, body) {
  if (isPushActive()) return;
  sendPushNotification(title, body);
}

window.installGateContinue = async () => {
  if (isStandalonePwa()) {
    clearInstallBrowserHelp();
    render();
    resumeBootAfterInstallGate();
    return;
  }
  await showAlert(
    'ホーム画面に追加したら、アイコンから開き直してください。',
    { title: 'まだブラウザのままです' }
  );
};

function resumeBootAfterInstallGate() {
  if (getLineInstallGateKind() || window.__ieInstallGateLine) return;
  boot().catch((error) => console.error('[boot] resume failed', error));
}

/** 初回ガイド終了後に通知の許可を案内する（1回だけ） */
const PUSH_ONBOARD_KEY = 'ienomics_push_onboard_asked';

function onboardingTutorialFinish() {
  promptPushOnboarding();
}

async function promptPushOnboarding() {
  if (!state.familyCode || !state.role) return;
  if (localStorage.getItem(PUSH_ONBOARD_KEY)) return;
  localStorage.setItem(PUSH_ONBOARD_KEY, 'true');
  if (!(await isPushSupported())) return;
  if (Notification.permission !== 'default') return;

  const ok = await showConfirm(
    '新しいお仕事やギフトが届いたときなど、アプリを閉じていてもお知らせします。',
    { title: 'イエノミクスは通知を出します。許可しますか？', okLabel: '許可する', cancelLabel: 'あとで' }
  );
  if (!ok) return;

  const permission = await askPushPermission();
  if (permission === 'denied') {
    await showAlert(
      '通知がブロックされています。\n\n端末の設定 → 通知（またはブラウザのサイト設定）から、イエノミクスの通知を許可してください。',
      { title: '通知がオフになっています' }
    );
    return;
  }
  if (permission !== 'granted') return;

  const pushOk = await initPush({ familyCode: state.familyCode, role: state.role });
  render();
  if (pushOk) {
    await showAlert(
      'アプリを閉じていても、新しいお仕事やギフトが通知センターに届きます。',
      { title: '通知をオンにしました' }
    );
  } else {
    const reason = getPushError();
    await showAlert(
      `通知の準備ができませんでした。\n\n理由: ${reason || '不明'}`,
      { title: '通知をオンにできませんでした' }
    );
  }
}

/** 通知の受け取りを準備する。すでに許可済みならそのまま有効になる。 */
async function setupPush() {
  if (!state.familyCode || !state.role) return;
  const ok = await initPush({ familyCode: state.familyCode, role: state.role });
  if (ok) console.log('[push] サーバー通知が有効になりました');
}

/** 設定画面の「通知をオンにする」から呼ぶ。iOS はタップ経由でないと許可が取れない。 */
window.enablePushNotifications = async () => {
  if (!(await isPushSupported())) {
    return showAlert(
      'この画面では通知を使えません。\n\niPhone・iPad の場合は、Safari の共有ボタンから「ホーム画面に追加」をして、追加されたアイコンからアプリを開き直してください。',
      { title: '通知に対応していません' }
    );
  }

  const permission = await askPushPermission();
  if (permission === 'denied') {
    return showAlert(
      '通知がブロックされています。\n\n端末の設定 → 通知（またはブラウザのサイト設定）から、イエノミクスの通知を許可してください。',
      { title: '通知がオフになっています' }
    );
  }
  if (permission !== 'granted') return;

  const ok = await initPush({ familyCode: state.familyCode, role: state.role });
  render();
  if (ok) {
    await showAlert(
      'アプリを閉じていても、新しいお仕事やギフトが通知センターに届きます。',
      { title: '通知をオンにしました' }
    );
  } else {
    const reason = getPushError();
    await showAlert(
      `通知の準備ができませんでした。\n\n理由: ${reason || '不明'}`,
      { title: '通知をオンにできませんでした' }
    );
  }
};

/** この端末を、その家族のメンバーとして登録する（失敗しても書き込みは続行） */
async function claimChildMembership(code) {
  if (!code) return;
  try {
    const user = await ensureAnonymousAuth();
    await updateDoc(doc(db, "families", code), {
      childUids: arrayUnion(user.uid),
      childLinked: true
    });
  } catch (error) {
    console.warn('メンバー登録スキップ:', error);
  }
}

/** 子供側の書き込み前に、匿名ログインだけ確かめる */
async function ensureChildMember() {
  if (state.role !== 'child') return;
  if (!state.familyCode) throw new Error('同期IDがありません');
  await ensureAnonymousAuth();
  await claimChildMembership(state.familyCode);
}

// ★ 追加：今日追加したテンプレートのIDを記憶しておく箱（セッション中の一時記憶）
let generatedToday = {};
let deadlineTimer = null;
let midnightTimer = null;
let watchedDayKey = null;
const DEADLINE_CHECK_MS = 30 * 1000;
const MINUTE = 60 * 1000;
/** 1時間前: 残り59〜61分。30分前: 残り29〜31分（サーバー remindDeadlines と同じ） */
const DEADLINE_REMIND_SLOTS = [
  { id: '60', label: 'あと1時間', minMin: 59, maxMin: 61 },
  { id: '30', label: 'あと30分', minMin: 29, maxMin: 31 }
];

function getDeadlineNotifiedMap() {
  try {
    return JSON.parse(localStorage.getItem('ienomics_deadline_notified') || '{}');
  } catch {
    return {};
  }
}

function saveDeadlineNotifiedMap(map) {
  localStorage.setItem('ienomics_deadline_notified', JSON.stringify(map));
}

function checkDeadlineReminders() {
  // 期限の見張りはサーバー側（remindDeadlines）が1分ごとにやってくれる。
  // アプリを閉じていても届くので、両方動くと二重になる。
  if (isPushActive()) return;
  if (!state.familyCode || !Array.isArray(state.tasks) || state.tasks.length === 0) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = Date.now();
  const notified = getDeadlineNotifiedMap();
  let changed = false;

  for (const t of state.tasks) {
    if (!t.deadline) continue;
    if (!['open', 'accepted'].includes(t.status)) continue;

    const remaining = t.deadline - now;
    const remainMin = Math.floor(remaining / MINUTE);
    for (const slot of DEADLINE_REMIND_SLOTS) {
      if (remainMin < slot.minMin || remainMin > slot.maxMin) continue;
      const key = `${t.id}:${slot.id}:${t.deadline}`;
      if (notified[key]) continue;
      notified[key] = 1;
      changed = true;
      if (state.role === 'child') {
        localNotify("期限が近づいています！", `「${t.title}」の期限が${slot.label}です。急ぎましょう！`);
      } else {
        localNotify("期限アラーム", `「${t.title}」の期限が${slot.label}です`);
      }
    }
  }

  if (changed) saveDeadlineNotifiedMap(notified);
}

function startDeadlineWatcher() {
  stopDeadlineWatcher();
  setupPush();
  checkDeadlineReminders();
  processScheduledPayments();
  cleanupExpiredDeadlineTasks();
  checkAndGenerateRepeatedTasks();
  scheduleMidnightTick();
  startEodLogTimer();
  deadlineTimer = setInterval(() => {
    checkDeadlineReminders();
    processScheduledPayments();
    cleanupExpiredDeadlineTasks();
    // 日付が変わっていたら、定期の「今日分」フラグを捨てて作り直す
    ensureTodayGeneration();
  }, DEADLINE_CHECK_MS);
}

function stopDeadlineWatcher() {
  if (deadlineTimer) {
    clearInterval(deadlineTimer);
    deadlineTimer = null;
  }
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  stopEodLogTimer();
}

/** 次の日本時間0:00（少し過ぎた直後）までのミリ秒 */
function msUntilNextMidnight() {
  return msUntilJapanMidnight();
}

/**
 * アプリを開きっぱなしでも、0:00ちょうどに定期を出す。
 * タイマーはスマホがスリープすると遅れることがあるので、サーバー側の0:00実行と併用する。
 */
function scheduleMidnightTick() {
  if (midnightTimer) clearTimeout(midnightTimer);
  midnightTimer = setTimeout(async () => {
    generatedToday = {};
    watchedDayKey = todayKeyString();
    const created = await checkAndGenerateRepeatedTasks();
    if (created > 0) showToast(`今日の定期のお仕事を${created}件追加しました`);
    await writeInvestmentEodLogs(japanYesterdayKey(), true);
    await applyBankMonthlyInterest();
    scheduleMidnightTick();
  }, msUntilNextMidnight());
}

/** 日付が変わっていたら、その日の定期を今すぐ作る */
async function ensureTodayGeneration() {
  const today = todayKeyString();
  if (watchedDayKey === today) {
    await checkAndGenerateRepeatedTasks();
    return;
  }
  watchedDayKey = today;
  generatedToday = {};
  const created = await checkAndGenerateRepeatedTasks();
  if (created > 0) showToast(`今日の定期のお仕事を${created}件追加しました`);
}

// バックグラウンドから戻ったときも、日付またぎを拾う
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render();
      if (!getLineInstallGateKind() && !window.__ieInstallGateLine) {
        resumeBootAfterInstallGate();
      }
      if (state.familyCode) {
        ensureTodayGeneration();
        scheduleMidnightTick();
        catchupInvestmentEodLogs();
        applyBankMonthlyInterest().catch(e => console.warn('[bank interest]', e));
      }
    }
  });
}

let isCleaningExpiredTasks = false;

/** 昨日以前の期限切れ仕事を消す。親子どちらでも動かす（親端末が閉じていると残るのを防ぐ） */
async function cleanupExpiredDeadlineTasks() {
  if (!state.familyCode || isCleaningExpiredTasks) return;
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) return;

  const nowMs = Date.now();
  const targets = state.tasks.filter(t => shouldSweepExpiredTask(t, nowMs));

  if (targets.length === 0) return;

  isCleaningExpiredTasks = true;
  try {
    for (const t of targets) {
      try {
        if (t.generatedKey || t.generatedKey) {
          generatedToday[taskGeneratedKey(t)] = true;
          await updateDoc(doc(db, "tasks", t.id), {
            status: 'deleted',
            deletedAt: Date.now(),
            autoDeleted: true
          });
        } else {
          await updateDoc(doc(db, "tasks", t.id), {
            status: 'deleted',
            deletedAt: Date.now(),
            autoDeleted: true
          });
        }
      } catch (err) {
        console.error("期限切れタスク削除エラー:", err);
      }
    }
  } finally {
    isCleaningExpiredTasks = false;
  }
}

let isProcessingPayments = false;
let paymentProcessQueued = false;
let lastPaymentErrorToastAt = 0;

function paymentDoneUpdates(payData, dueKey) {
  const updates = { lastChargedKey: dueKey };
  if (payData.mode === 'once') updates.status = 'done';
  else if (payData.countMode === 'finite') {
    const left = Math.max(0, (payData.remainingCount ?? 1) - 1);
    updates.remainingCount = left;
    if (left <= 0) updates.status = 'done';
  }
  return updates;
}

function snapExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
}

/**
 * 上の口座残高（families.points）から1件落とす。家庭内銀行には触らない。
 * 戻り値: 'charged' | 'synced' | 'skipped' | 'zero'
 */
async function chargeOneScheduledPayment(p, todayStr = todayKeyString(), now = new Date()) {
  const familyCode = String(p?.familyCode || state.familyCode || '');
  if (!familyCode || !p?.id) return 'skipped';
  if (!isScheduledPaymentDue(p, todayStr)) return 'skipped';

  const dueKey = lastScheduledPaymentDueKey(p, todayStr) || todayStr;
  const amount = Math.round(Number(scheduledPaymentAmount(p, state.tasks, state.balloons, now)) || 0);
  const payRef = doc(db, "scheduledPayments", p.id);
  const chargeRef = doc(db, "paymentLogs", `${p.id}_${dueKey}`);
  const famRef = doc(db, "families", familyCode);
  const title = p.title || '支払い';

  if (!(amount > 0)) {
    await updateDoc(payRef, paymentDoneUpdates(p, dueKey));
    return 'zero';
  }

  // すでに履歴があれば、設定側だけ揃えて終わり（残高は二重に引かない）
  const existingCharge = await getDoc(chargeRef);
  if (snapExists(existingCharge)) {
    const paySnap = await getDoc(payRef);
    if (snapExists(paySnap)) {
      const payData = paySnap.data();
      const alreadyMarked = payData.lastChargedKey
        && dateKeyToValue(payData.lastChargedKey) >= dateKeyToValue(dueKey);
      if (payData.status === 'active' && !alreadyMarked) {
        const sync = { lastChargedKey: dueKey };
        if (payData.mode === 'once') sync.status = 'done';
        await updateDoc(payRef, sync);
      }
    }
    return 'synced';
  }

  const famSnap = await getDoc(famRef);
  if (!snapExists(famSnap)) {
    throw new Error('口座データが見つかりません');
  }
  const ptsBefore = Number(famSnap.data().points) || 0;
  const ptsAfter = ptsBefore - amount;
  const wentNegative = ptsAfter < 0;

  // 銀行預け入れと同じ手順: 履歴作成 → 口座を減らす → 支払い設定を更新
  await setDoc(chargeRef, {
    familyCode,
    paymentId: p.id,
    title,
    amount,
    points: amount,
    chargedAt: Date.now(),
    createdAt: Date.now(),
    chargeKey: dueKey,
    ...(wentNegative ? { wentNegative: true } : {})
  });

  try {
    await updateDoc(famRef, { points: increment(-amount) });
    const paySnap = await getDoc(payRef);
    if (snapExists(paySnap)) {
      await updateDoc(payRef, paymentDoneUpdates(paySnap.data(), dueKey));
    }
  } catch (err) {
    try { await deleteDoc(chargeRef); } catch (_) { /* ignore */ }
    throw err;
  }

  if (familyCode === state.familyCode) {
    state.points = ptsAfter;
  }

  if (wentNegative) {
    localNotify(
      "支払い引落（残高不足）",
      `「${title}」 −${amount}円。口座がマイナスになりました`
    );
  } else {
    localNotify(
      "支払いが引き落とされました",
      `「${title}」 −${amount}円`
    );
  }
  return 'charged';
}

async function processScheduledPayments() {
  if (!state.familyCode) return;
  if (!Array.isArray(state.scheduledPayments) || state.scheduledPayments.length === 0) return;
  if (isProcessingPayments) {
    paymentProcessQueued = true;
    return;
  }

  isProcessingPayments = true;
  const now = new Date();
  const todayStr = todayKeyString();
  let firstError = null;
  let chargedAny = false;

  try {
    for (const p of state.scheduledPayments) {
      if (!isScheduledPaymentDue(p, todayStr)) continue;
      try {
        const result = await chargeOneScheduledPayment(p, todayStr, now);
        if (result === 'charged') chargedAny = true;
      } catch (err) {
        console.error("支払い処理エラー:", p.id, err);
        if (!firstError) firstError = err;
      }
    }
    if (chargedAny) scheduleRender();
    if (firstError) {
      const t = Date.now();
      if (t - lastPaymentErrorToastAt > 60000) {
        lastPaymentErrorToastAt = t;
        showToast('支払いの自動引落を再試行しています');
      }
    }
  } finally {
    isProcessingPayments = false;
    if (paymentProcessQueued) {
      paymentProcessQueued = false;
      setTimeout(() => { processScheduledPayments(); }, 50);
    }
  }
}

applyFuriganaState();

let bootStarted = false;
let authListenerAttached = false;

/**
 * 起動処理は一度だけ。
 * v233でモジュール評価直後に boot すると、Auth 永続化の復元前に
 * user===null を拾って起動が壊れることがあるため、load 完了後に開始する（v232相当）。
 * __ieBootReady による15秒保険の完了判定は維持する。
 */
async function boot() {
  render();
  if (getLineInstallGateKind() || window.__ieInstallGateLine) {
    markBootReady('install-gate');
    return;
  }
  if (bootStarted) return;
  bootStarted = true;
  try {
    localStorage.removeItem('ienomics_install_ok');
    localStorage.removeItem('ienomics_install_browser_help');
  } catch { /* 旧フラグを廃止 */ }
  markBootPerfBootStart();
  bootDebugLog('boot start', { bootStarted: true, role: state.role, familyCode: state.familyCode });
  setBootPhase('boot');
  startBootWatchdog();
  bootLog('boot start', { role: state.role, familyCode: state.familyCode });
  loadMarketNews();

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');

  // パスワード再設定メールのリンクから戻ってきた場合
  if (mode === 'resetPassword' && oobCode) {
    try {
      setBootPhase('password-reset');
      await verifyPasswordResetCode(auth, oobCode);
      state.resetPasswordCode = oobCode;
      state.setupMode = 'password_reset_form';
      window.history.replaceState(null, null, window.location.pathname);
      render();
      return;
    } catch (error) {
      bootLog('password reset failed', error);
      await showAlert("パスワード再設定リンクが無効、または期限切れです。もう一度お試しください。", { title: 'リンクが使えません' });
      window.history.replaceState(null, null, window.location.pathname);
      state.setupMode = 'parent_forgot';
      render();
      return;
    }
  }

  if (isSignInWithEmailLink(auth, window.location.href)) {
    setBootPhase('email-link');
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = await showPrompt("セキュリティ確認のため、登録したメールアドレスをもう一度入力してください。", {
        title: 'メールアドレスの確認',
        placeholder: 'you@example.com'
      });
    }
    if (!email) {
      await showAlert("認証がキャンセルされました。");
      render(); return;
    }
    try {
      const result = await withTimeout(
        signInWithEmailLink(auth, email, window.location.href),
        BOOT_AWAIT_MS,
        'メールリンクログイン'
      );
      window.localStorage.removeItem('emailForSignIn');
      const uid = result.user.uid;
      const userDoc = await withTimeout(getDoc(doc(db, "users", uid)), BOOT_AWAIT_MS, 'ユーザー情報の取得');
      
      if (!userDoc.exists()) {
        state.requirePasswordSetup = true;
        window.history.replaceState(null, null, window.location.pathname);
        render();
      } else {
        localStorage.setItem('ienomics_role', 'parent');
        state.role = 'parent'; state.view = 'home';
        applyFuriganaState();
        window.history.replaceState(null, null, window.location.pathname);
        await runMigrationAndLoadChildren(uid);
      }
    } catch (error) {
      bootLog('email-link failed', error);
      await showAlert(friendlyError(error), { title: 'ログインできませんでした' });
      render();
    }
    return;
  }

  setBootPhase('await-auth');
  if (authListenerAttached) return;
  authListenerAttached = true;

  // 永続セッション復元前の「一時的な null」で親ログインを消さない
  bootDebugLog('authStateReady start');
  try {
    setBootPhase('auth-ready');
    await withTimeout(auth.authStateReady(), BOOT_AWAIT_MS, '認証の準備');
    bootLog('authStateReady', { uid: auth.currentUser?.uid || null });
    bootDebugLog('authStateReady done', { uid: auth.currentUser?.uid || null });
  } catch (error) {
    bootLog('authStateReady failed', error);
    bootDebugLog('authStateReady error', { error: String(error?.message || error) });
  }

  bootDebugLog('attaching auth listener');
  auth.onAuthStateChanged(async (user) => {
    setBootPhase(user ? (user.isAnonymous ? 'auth-anon' : 'auth-user') : 'auth-null');
    bootLog('onAuthStateChanged', { uid: user?.uid || null, role: state.role });
    bootDebugLog('auth callback', {
      uid: user?.uid || null,
      isAnonymous: !!user?.isAnonymous,
      role: state.role,
      familyCode: state.familyCode
    });
    try {
      if (state.role === 'parent') {
        bootDebugLog('parent start');
        if (user && !user.isAnonymous) {
          await runMigrationAndLoadChildren(user.uid);
        } else {
          localStorage.removeItem('ienomics_role'); localStorage.removeItem('ienomics_familyCode');
          state.role = null; state.familyCode = null; render();
        }
      } else if (state.role === 'child' && state.familyCode) {
        bootDebugLog('child start');
        if (!user) {
          bootDebugLog('anonymous auth start');
          try {
            await ensureAnonymousAuth();
            bootDebugLog('anonymous auth done');
          } catch (error) {
            console.error('[boot] 匿名ログイン失敗:', error);
            await showAlert(friendlyError(error), { title: '接続できませんでした' });
            render();
          }
          return;
        }
        try {
          setBootPhase('claim-member');
          bootDebugLog('claim membership start');
          await claimChildMembership(state.familyCode);
          bootDebugLog('claim membership done');
        } catch (error) {
          console.warn('[boot] メンバー登録を再試行できませんでした:', error);
        }
        setBootPhase('setup-listeners');
        bootDebugLog('child setupListeners start');
        setupListeners();
        bootDebugLog('child setupListeners done');
      } else {
        render();
      }
    } catch (error) {
      console.error('[boot] onAuthStateChanged failed', error);
      await showAlert(friendlyError(error), { title: '読み込みに失敗しました' });
      render();
    }
  });
}

function queueBoot() {
  boot().catch((error) => {
    console.error('[boot] fatal', error);
    if (!getLineInstallGateKind() && !window.__ieInstallGateLine) showBootSlowScreen();
  });
}

// Firebase より先にインストール案内を出す
try { render(); } catch (e) { console.warn('[install-gate] early render', e); }

// v232同様、load 後に起動（取りこぼし時は即時）
if (document.readyState === 'complete') {
  queueBoot();
} else {
  window.addEventListener('load', queueBoot, { once: true });
}

async function runMigrationAndLoadChildren(uid) {
  setBootPhase('migrate-load-children');
  bootDebugLog('migration start');
  try {
    bootDebugLog('user getDoc start');
    const userDoc = await withTimeout(getDoc(doc(db, "users", uid)), BOOT_AWAIT_MS, 'ユーザー情報の取得');
    bootDebugLog('user getDoc done', { exists: userDoc.exists() });
    if (userDoc.exists() && userDoc.data().familyCode) {
      const oldCode = userDoc.data().familyCode;
      bootDebugLog('family migration getDoc start');
      const familyDoc = await withTimeout(getDoc(doc(db, "families", oldCode)), BOOT_AWAIT_MS, '家族データの取得');
      bootDebugLog('family migration getDoc done', { exists: familyDoc.exists() });
      if (familyDoc.exists() && !familyDoc.data().parentUid) {
        await updateDoc(doc(db, "families", oldCode), { parentUid: uid, childName: "メイン口座" });
      }
    }
  } catch (error) {
    bootLog('migration getDoc failed', error);
    // 一覧購読は続けて試し、完全停止は避ける
  }
  loadParentChildren(uid);
}

/**
 * state.children のうち、いま選んでいる子の情報を画面用の state に写す。
 * 切り替え直後は Firestore からの通知が来ないので、ここで自分で反映しないと
 * 名前・残高・連携状態が前の子のまま残ってしまう。
 */
function applyActiveChild() {
  const active = (state.children || []).find(c => c.id === state.familyCode);
  if (!active) return false;
  state.childName = active.childName;
  state.points = active.points || 0;
  state.stockCap = parseFamilyStockCap(active);
  state.childLinked = active.childLinked !== false;
  return true;
}

function loadParentChildren(parentUid) {
  setBootPhase('parent-children-snap');
  bootDebugLog('loadParentChildren start');
  const q = query(collection(db, "families"), where("parentUid", "==", parentUid));
  if (window.unsubChildren) window.unsubChildren();
  bootDebugLog('parent children listener attached');
  window.unsubChildren = onSnapshot(q, (snapshot) => {
    bootLog('children snapshot', { size: snapshot.size });
    bootDebugLog('parent children snapshot', { size: snapshot.size });
    const list = [];
    snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    state.children = list.sort((a, b) => a.createdAt - b.createdAt);
    if (list.length > 0) {
      const prevCode = state.familyCode;
      if (!list.some(c => c.id === state.familyCode)) state.familyCode = list[0].id;
      localStorage.setItem('ienomics_familyCode', state.familyCode);
      applyActiveChild();
      // ポイント更新のたびにここが走る。毎回 setupListeners すると
      // 定期発注の判定が途中でキャンセルされて、仕事が出てこないことがある。
      if (state.familyCode !== prevCode || unsubscribes.length === 0) {
        bootDebugLog('parent children before setupListeners');
        setupListeners();
      } else {
        scheduleRender();
      }
    } else {
      state.familyCode = null; state.childName = ''; state.points = 0; state.stockCap = null; state.childLinked = false; scheduleRender();
    }
  }, (err) => {
    console.error('[boot] children onSnapshot error', err);
    // 権限エラー等で初回が来ないと「よみこみ中」のままになる
    if (state.familyCode && unsubscribes.length === 0) {
      try { setupListeners(); } catch (e) { console.error('[boot] setupListeners after children error', e); }
    }
    scheduleRender();
  });
}

// 繰り返し発注: 親端末のみ・確定ドキュメントID・論理削除で二重発注/削除増殖を防ぐ
let isGenerating = false;
let isDeduping = false;

async function dedupeRepeatedTasks() {
  if (state.role !== 'parent' || isDeduping || !state.familyCode) return;
  const groups = {};
  for (const t of state.tasks) {
    if (!taskGeneratedKey(t) || t.status === 'deleted') continue;
    const gk = taskGeneratedKey(t);
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(t);
  }
  const extras = [];
  for (const key of Object.keys(groups)) {
    const list = groups[key].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (let i = 1; i < list.length; i++) extras.push(list[i]);
  }
  if (extras.length === 0) return;
  isDeduping = true;
  try {
    for (const t of extras) {
      await deleteDoc(doc(db, "tasks", t.id));
    }
  } catch (error) {
    console.error("重複タスク整理エラー:", error);
  } finally {
    isDeduping = false;
  }
}

/** 定期テンプレの曜日・日付を数字の配列にする（文字で保存されていても判定できるように） */
function normalizeTemplateDays(days) {
  if (!Array.isArray(days)) return [];
  return days.map(d => Number(d)).filter(d => Number.isFinite(d));
}

/** 今日このテンプレから発注すべきか（日本時間） */
function shouldGenerateTemplateToday(temp, now = new Date()) {
  if (!temp) return false;
  const days = normalizeTemplateDays(temp.days);
  const j = japanParts(now);
  if (temp.type === 'weekly') return days.includes(j.weekday);
  if (temp.type === 'monthly') {
    const last = new Date(Date.UTC(j.year, j.month, 0)).getUTCDate();
    return days.some(d => Math.min(d, last) === j.day);
  }
  return false;
}

async function checkAndGenerateRepeatedTasks() {
  // ドキュメントIDが決まっているので、親子どちらが作っても二重にならない。
  // 親の端末が閉じていると子供側に仕事が出ないのを防ぐため、どちらでも生成する。
  if (!state.familyCode || !state.tasksReady || isGenerating) return 0;
  if (!state.taskTemplates || state.taskTemplates.length === 0) return 0;
  isGenerating = true;
  let created = 0;

  try {
    if (state.role === 'parent') await dedupeRepeatedTasks();

    const now = new Date();
    const todayStr = todayKeyString();
    watchedDayKey = todayStr;

    // 削除済みも含めてキーがあれば「今日は処理済み」（論理削除で再発注を防ぐ）
    const existingKeys = new Set(
      state.tasks.map(t => taskGeneratedKey(t)).filter(Boolean)
    );

    for (const temp of state.taskTemplates) {
      try {
        const generatedKey = `rep_${temp.id}_${todayStr}`;
        const time = String(temp.time || '').trim();
        const deadlineMs = time
          ? japanDeadlineMs(Number(time.split(':')[0]), Number(time.split(':')[1]) || 0, now)
          : null;

        if (generatedToday[generatedKey] || existingKeys.has(generatedKey)) {
          generatedToday[generatedKey] = true;
          continue;
        }

        // 確定IDのドキュメントが既にあればスキップ（他端末・サーバーとの競合対策）
        const taskRef = doc(db, "tasks", generatedKey);
        const existingDoc = await getDoc(taskRef);
        if (existingDoc.exists()) {
          generatedToday[generatedKey] = true;
          existingKeys.add(generatedKey);
          // 以前UTCで作った期限がずれている分は、日本時間に直す
          const data = existingDoc.data() || {};
          if (
            deadlineMs != null &&
            data.deadline !== deadlineMs &&
            ['open', 'accepted'].includes(data.status)
          ) {
            await updateDoc(taskRef, { deadline: deadlineMs });
          }
          continue;
        }

        if (!shouldGenerateTemplateToday(temp, now)) continue;

        generatedToday[generatedKey] = true;
        existingKeys.add(generatedKey);

        // 定期は受注手続きなしで、いきなり進行中（accepted）にする
        await setDoc(taskRef, {
          familyCode: state.familyCode,
          title: temp.title,
          titleKana: temp.titleKana || '',
          points: Number(temp.points) || 0,
          status: 'accepted',
          generatedKey: generatedKey,
          templateId: temp.id,
          autoAccepted: true,
          createdAt: Date.now(),
          deadline: deadlineMs
        });
        created += 1;
      } catch (inner) {
        // 1件の失敗で残り全部を止めない
        console.error("繰り返しタスク1件の生成エラー:", temp?.id, inner);
      }
    }
  } catch (error) {
    console.error("繰り返しタスク生成エラー:", error);
  } finally {
    isGenerating = false;
  }
  return created;
}

/**
 * 見ていた口座が親に削除されたときの後片付け（子供の端末用）。
 * 通知の宛先も消しておかないと、消えた口座宛の通知が届き続ける。
 */
let familyRemovedHandled = false;
async function handleFamilyRemoved() {
  if (familyRemovedHandled) return;
  familyRemovedHandled = true;

  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];
  await unregisterPush();
  try { await signOut(auth); } catch (e) {}

  localStorage.removeItem('ienomics_role');
  localStorage.removeItem('ienomics_familyCode');
  state.role = null;
  state.familyCode = null;
  state.childName = '';
  state.points = 0;
  state.stockCap = null;
  state.childLinked = false;
  state.setupMode = null;
  render();

  await showAlert(
    'この口座は親の端末で削除されました。\nもう一度使うには、新しい同期IDを入れ直してください。',
    { title: '口座がなくなりました' }
  );
  familyRemovedHandled = false;
}

function attachFirestoreCollectionListener(c, k, { bootGated = false } = {}) {
  const finishRender = bootGated ? scheduleBootAwareRender : scheduleRender;
  const unsub = onSnapshot(query(collection(db, c), where("familyCode", "==", state.familyCode)), (s) => {
    if (!listenerSnapLogged[c]) {
      listenerSnapLogged[c] = true;
      bootDebugLog('listener snapshot', { collection: c, size: s.size });
      if (k === 'tasks') bootTasksSnapReady = true;
    }
    const a = [];
    s.forEach(d => a.push({ id: d.id, ...d.data() }));
    a.sort((a, b) => (b.chargedAt || b.at || b.createdAt || b.boughtAt || b.approvedAt || 0) - (a.chargedAt || a.at || a.createdAt || a.boughtAt || a.approvedAt || 0));

    if (!state.isInitialLoad) {
      s.docChanges().forEach(change => {
        if (k !== "tasks") return;
        const t = change.doc.data();
        if (!t || t.status === 'deleted') return;
        const prev = state.tasks.find(x => x.id === change.doc.id);

        if (change.type === "added") {
          // 親が発注 → 子供へ
          if (state.role === 'child' && t.status === 'open') {
            localNotify(
              "新しいお仕事！",
              `「${t.title}」（${t.points}円）が発注されました！`
            );
          }
          // 定期は受注なしで始まる → 子供へ
          if (state.role === 'child' && t.status === 'accepted' && (t.autoAccepted || t.generatedKey || t.generatedKey)) {
            localNotify(
              "今日の定期のお仕事",
              `「${t.title}」（${t.points}円）が始まりました！`
            );
          }
          // 子供が見積り → 親へ
          if (state.role === 'parent' && t.status === 'proposed') {
            const name = state.childName || 'こども';
            localNotify(
              "見積りが届きました",
              `${name}ちゃんから「${t.title}」（希望 ${t.points}円）`
            );
          }
        }

        if (change.type === "modified") {
          // 親が見積りを承認して発注状態に → 子供へ
          if (state.role === 'child' && t.status === 'open' && prev?.status === 'proposed') {
            localNotify(
              "見積りが承認されました！",
              `「${t.title}」がお仕事として発注されました`
            );
          }
          // 親が見積りを却下 → 子供へ
          if (state.role === 'child' && t.status === 'proposal_rejected' && prev?.status === 'proposed') {
            localNotify(
              "見積りが却下されました",
              `「${t.title}」の見積りは却下されました`
            );
          }
          // 子供が完了報告 → 親へ
          if (state.role === 'parent' && t.status === 'completed' && prev?.status !== 'completed') {
            localNotify(
              "お仕事完了！",
              `${state.childName || 'こども'}ちゃんが「${t.title}」を完了しました！`
            );
          }
          // 親が差し戻し → 子供へ
          if (state.role === 'child' && t.status === 'accepted' && prev?.status === 'completed') {
            localNotify(
              "やり直し指示",
              `「${t.title}」のやり直し（差し戻し）が届きました。`
            );
          }
          // 親が付与・承認 → 子供へ
          if (state.role === 'child' && t.status === 'approved' && prev?.status === 'completed') {
            localNotify(
              "お仕事が承認されました！",
              `「${t.title}」で ${t.points}円 ゲット！`
            );
          }
        }
      });
    }

    state[k] = a;
    if (k === "tasks") {
      const firstLoad = state.isInitialLoad;
      state.isInitialLoad = false;
      state.tasksReady = true;
      // 初回読込時のみ自動発注（削除のたびに再生成しない）
      if (firstLoad) checkAndGenerateRepeatedTasks();
      else dedupeRepeatedTasks();
      checkDeadlineReminders();
      cleanupExpiredDeadlineTasks();
    }
    if (k === "scheduledPayments") {
      processScheduledPayments();
    }
    if (k === "investments" || k === "investmentLogs") {
      scheduleBackfillInvestmentBuyLogs();
      scheduleInvestmentEodMigration();
    }
    if (k === "banks") {
      applyBankMonthlyInterest().catch(e => console.warn('[bank interest]', e));
    }
    // ホーム未使用のため、ホーム表示中は全画面renderを省略（stateは更新済み）
    if (state.view === 'home' && (k === 'tickets' || k === 'paymentLogs')) return;
    finishRender();
  });
  unsubscribes.push(unsub);
}

function attachSetupListenersPhase2() {
  attachFirestoreCollectionListener("tickets", "tickets");
  attachFirestoreCollectionListener("wishes", "wishes");
  attachFirestoreCollectionListener("investments", "investments");
  attachFirestoreCollectionListener("investmentLogs", "investmentLogs");
  attachFirestoreCollectionListener("exchanges", "exchanges");
  attachFirestoreCollectionListener("banks", "banks");
  attachFirestoreCollectionListener("balloons", "balloons");
  attachFirestoreCollectionListener("paymentLogs", "paymentLogs");
}

function setupListeners() {
  if (!state.familyCode) return;
  setBootPhase('listeners');
  bootLog('setupListeners', { familyCode: state.familyCode, role: state.role });
  bootDebugLog('setupListeners start', { familyCode: state.familyCode, role: state.role });
  listenerSnapLogged = {};
  resetBootRenderGate();

  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];
  state.tasksReady = false;
  state.isInitialLoad = true;
  startDeadlineWatcher();

  const unsubFamily = onSnapshot(doc(db, "families", state.familyCode), (d) => {
    if (!listenerSnapLogged.families) {
      listenerSnapLogged.families = true;
      bootFamiliesSnapReady = true;
      bootDebugLog('listener snapshot', { collection: 'families', size: d.exists() ? 1 : 0 });
    }
    if (d.exists()) {
      const data = d.data();
      state.points = data.points || 0;
      state.stockCap = parseFamilyStockCap(data);
      state.childLinked = data.childLinked !== false;
      if (state.role === 'child') state.childName = data.childName || 'こども';
      applyMarketSheetUrl(data.marketSheetUrl || '');
      scheduleBootAwareRender();
    }
    // 親がこの口座を削除した。子供の端末に古い残高を見せ続けないよう初期設定へ戻す。
    // 親の端末は、口座一覧の変化を見て自動で別の子に移るのでここでは何もしない。
    else if (state.role === 'child') handleFamilyRemoved();
    else scheduleBootAwareRender();
  }, (err) => {
    console.error('[boot] family onSnapshot error', err);
    scheduleRender();
  });
  unsubscribes.push(unsubFamily);

  const unsubTemp = onSnapshot(query(collection(db, "taskTemplates"), where("familyCode", "==", state.familyCode)), (s) => {
    if (!listenerSnapLogged.taskTemplates) {
      listenerSnapLogged.taskTemplates = true;
      bootDebugLog('listener snapshot', { collection: 'taskTemplates', size: s.size });
    }
    const list = [];
    s.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    state.taskTemplates = list;
    checkAndGenerateRepeatedTasks();
    scheduleBootAwareRender();
  });
  unsubscribes.push(unsubTemp);

  attachFirestoreCollectionListener("tasks", "tasks", { bootGated: true });
  attachFirestoreCollectionListener("scheduledPayments", "scheduledPayments", { bootGated: true });
  bootDebugLog('setupListeners phase1 done');
}

window.setView = (viewName) => {
  if (viewName !== 'templateEdit') state.editingTemplateId = null;
  if (viewName !== 'paymentEdit') state.editingPaymentId = null;
  if (viewName === 'calendar') {
    const j = japanParts();
    // ホームから開いたときは今月・今日に戻す
    state.calendarYear = j.year;
    state.calendarMonth = j.month;
    state.calendarSelectedDay = j.day;
  }
  state.view = viewName;
  render();
  // 支払い画面を開いたときも未引落を静かに再試行（ダイアログは出さない）
  if (viewName === 'payments') {
    setTimeout(() => { processScheduledPayments(); }, 0);
  }
};

window.setInvestRange = (range) => {
  if (!['day', 'week', 'month'].includes(range)) return;
  state.investRange = range;
  render();
};

window.setInvestChartName = (name) => {
  state.investChartName = String(name || '') || null;
  render();
};

window.shiftCalendarMonth = (delta) => {
  const j = japanParts();
  if (!state.calendarYear || !state.calendarMonth) {
    state.calendarYear = j.year;
    state.calendarMonth = j.month;
  }
  let y = state.calendarYear;
  let m = state.calendarMonth + Number(delta || 0);
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  state.calendarYear = y;
  state.calendarMonth = m;
  if (y === j.year && m === j.month) state.calendarSelectedDay = j.day;
  else state.calendarSelectedDay = 1;
  render();
};

window.selectCalendarDay = (day) => {
  state.calendarSelectedDay = Number(day) || 1;
  render();
};

/** キャッシュを避けて最新のアプリを読み込み直す */
window.reloadApp = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('_upd', String(Date.now()));
  // 認証用のクエリは残しつつ強制リロード
  window.location.replace(url.toString());
};

/** 同期IDをクリップボードへ。子供の端末に打ち込むとき、長いIDを手打ちしなくて済む */
window.copySyncCode = async () => {
  const code = state.familyCode;
  if (!code) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
    } else {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('同期IDをコピーしました');
  } catch (e) {
    await showAlert(`同期ID: ${code}`, { title: 'コピーできませんでした' });
  }
};
window.setSetupMode = (mode) => { state.setupMode = mode; state.setupStep = 1; render(); };
window.cancelSetup = () => { state.setupMode = null; state.setupStep = 1; render(); };

window.openTemplateEdit = async (templateId) => {
  if (state.role !== 'parent') return;
  const temp = state.taskTemplates.find(t => t.id === templateId);
  if (!temp) return showAlert("この定期設定は見つかりません（すでに削除された可能性があります）");
  state.editingTemplateId = templateId;
  state.view = 'templateEdit';
  render();
};

/** 設定から使い方ガイドを開く。ホームに戻ってから案内を始める。 */
window.startAppTutorial = () => {
  state.view = 'home';
  render();
  startTutorial(state.role === 'parent' ? 'parent' : 'child');
};

function readRepeatFormDays() {
  const repeatType = window.repeatType || 'weekly';
  let days = [];
  if (repeatType === 'weekly') {
    document.querySelectorAll('input[name="repeat-weeks"]:checked').forEach(cb => days.push(parseInt(cb.value)));
  } else {
    days.push(parseInt(document.getElementById('repeat-day-select').value));
  }
  return { repeatType, days, time: (document.getElementById('repeat-time')?.value || '').trim() };
}

window.updateTemplate = async () => {
  const id = state.editingTemplateId;
  if (!id) return;
  const title = document.getElementById('tmpl-title').value.trim();
  const titleKana = (document.getElementById('tmpl-title-kana')?.value || '').trim();
  const points = parseInt(document.getElementById('tmpl-points').value);
  if (!title || !points) return showAlert("内容と報酬を入力してください");
  const { repeatType, days, time } = readRepeatFormDays();
  if (repeatType === 'weekly' && days.length === 0) return showAlert("曜日を1つ以上選んでください");

  await guard(`updateTemplate:${id}`, async () => {
    await updateDoc(doc(db, "taskTemplates", id), {
      title, titleKana, points, type: repeatType, days, time
    });

    // 今日すでに出ている未完了の定期ジョブも内容を揃える
    const deadlineMs = time
      ? japanDeadlineMs(Number(time.split(':')[0]), Number(time.split(':')[1]) || 0)
      : null;

    for (const t of state.tasks) {
      const tid = getTemplateIdFromTask(t);
      if (tid !== id) continue;
      if (!['open', 'accepted', 'rejected'].includes(t.status)) continue;
      await updateDoc(doc(db, "tasks", t.id), {
        title, titleKana, points, deadline: deadlineMs, templateId: id
      });
    }

    state.editingTemplateId = null;
    setView('templates');
    showToast("定期発注を更新しました");
  }, { busyLabel: '更新しています...' });
};

window.deleteTemplate = async () => {
  const id = state.editingTemplateId;
  if (!id) return;
  const ok = await showConfirm(
    "今後は自動で追加されなくなります。\n（今日すでに出ている仕事は残ります）",
    { title: 'この定期発注を削除しますか？', okLabel: '削除する', tone: 'danger' }
  );
  if (!ok) return;
  await guard(`deleteTemplate:${id}`, async () => {
    await deleteDoc(doc(db, "taskTemplates", id));
    state.editingTemplateId = null;
    setView('templates');
    showToast("定期発注を削除しました");
  }, { busyLabel: '削除しています...' });
};

window.switchActiveChild = (code) => {
  if (!code || code === state.familyCode) return;
  state.familyCode = code;
  localStorage.setItem('ienomics_familyCode', code);
  generatedToday = {}; // 別の子供に切り替えたら「今日作ったよスタンプ」をリセット
  // 名前・残高・連携状態を先に反映する。これをしないと連携待ち画面から抜けられない。
  applyActiveChild();
  state.view = 'home';
  setupListeners();
  render();
  // 通知の宛先は同期IDごとに登録してあるので、見る子を変えたら付け替える。
  // これをしないと、切り替えたあとの子の通知が親の端末に届かない。
  if (isPushActive()) initPush({ familyCode: code, role: state.role }).catch(() => {});
};

window.toggleFurigana = () => {
  if (state.role !== 'child') return;
  state.furigana = !state.furigana;
  localStorage.setItem('ienomics_furigana', state.furigana);
  applyFuriganaState();
  render();
};

window.addTask = async () => { 
  const t = document.getElementById('task-title').value.trim();
  const titleKana = (document.getElementById('task-title-kana')?.value || '').trim();
  const p = parseInt(document.getElementById('task-points').value);
  const isRepeat = document.getElementById('task-repeat-toggle').checked;

  if (!t) return showAlert("仕事の内容を入力してください");
  if (!p || p <= 0) return showAlert("報酬は1円以上で入力してください");

  const repeatType = window.repeatType || 'weekly';
  let days = [];
  if (isRepeat) {
    if (repeatType === 'weekly') {
      document.querySelectorAll('input[name="repeat-weeks"]:checked').forEach(cb => days.push(parseInt(cb.value)));
      if (days.length === 0) return showAlert("繰り返す曜日を1つ以上選んでください");
    } else {
      days.push(parseInt(document.getElementById('repeat-day-select').value));
    }
  }

  await guard('addTask', async () => {
    if (isRepeat) {
      const time = (document.getElementById('repeat-time')?.value || '').trim();

      await addDoc(collection(db, "taskTemplates"), {
        familyCode: state.familyCode, title: t, titleKana, points: p, type: repeatType, days: days, time: time, createdAt: Date.now()
      });
      setView('home');
      showToast("定期発注として保存しました");
    } else {
      const d = document.getElementById('task-deadline').value;
      const deadline = d ? new Date(d).getTime() : null;
      await addDoc(collection(db, "tasks"), { 
        familyCode: state.familyCode, title: t, titleKana, points: p, deadline, status: 'open', createdAt: Date.now() 
      }); 
      setView('home');
      showToast("お仕事を発注しました");
    }
  }, { busyLabel: '発注しています...' });
};

window.completeTask = async (id) => guard(`completeTask:${id}`, async () => {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const isExpired = Boolean(task.deadline && Date.now() > task.deadline);
  await updateDoc(doc(db, "tasks", id), { 
    status: 'completed', 
    completedAt: Date.now(),
    isExpired
  }); 
  showToast("完了を報告しました");
}, { busyLabel: '送信しています...' });

/**
 * 承認とポイント付与を1つのトランザクションで行う。
 * 途中で失敗しても「承認だけ済んでポイントが増えない」状態にならない。
 */
window.approveTask = async (id, p) => {
  const amount = Number(p) || 0;

  await guard(`approveTask:${id}`, async () => {
    const taskRef = doc(db, "tasks", id);
    const famRef = doc(db, "families", state.familyCode);
    let granted = 0;

    await runTransaction(db, async (tx) => {
      const taskSnap = await tx.get(taskRef);
      if (!taskSnap.exists()) throw new Error('この仕事は見つかりませんでした');
      if (taskSnap.data().status === 'approved') return; // 二重付与を防ぐ

      const famSnap = await tx.get(famRef);
      if (!famSnap.exists()) throw new Error('口座が見つかりませんでした');

      const pts = famSnap.data().points || 0;
      granted = Math.max(0, amount);
      tx.update(taskRef, { status: 'approved', approvedAt: Date.now() });
      if (granted > 0) tx.update(famRef, { points: pts + granted });
    });

    showToast(granted > 0 ? `${granted}円 を付与しました` : '承認しました');
  }, { busyLabel: '付与しています...' });
};

window.rejectTask = async (id) => {
  const ok = await showConfirm("お断りすると、この仕事は受注されません。", { title: 'このお仕事をお断りしますか？', okLabel: 'お断りする' });
  if (!ok) return;
  await guard(`rejectTask:${id}`, () => updateDoc(doc(db, "tasks", id), { status: 'rejected' }));
};

window.returnTask = async (id) => {
  const ok = await showConfirm("もう一度やってもらうよう、子供に差し戻します。", { title: 'やり直しを指示しますか？', okLabel: '差し戻す' });
  if (!ok) return;
  await guard(`returnTask:${id}`, () => updateDoc(doc(db, "tasks", id), { status: 'accepted', statusBefore: 'completed' }));
};
window.saveNewPassword = async () => {
  const pass = document.getElementById('new-password').value;
  const passConf = document.getElementById('new-password-confirm').value;
  if (pass.length < 6) return showAlert("パスワードは6文字以上にしてください。");
  if (pass !== passConf) return showAlert("パスワードが一致しません！");

  const entered = await showPrompt("管理するお子様の名前を入力してください", { title: 'お子様の登録', placeholder: '例: はなこ' });
  const childName = (entered || '').trim() || "こども";

  state.isSending = true;
  state.setupLoadingMessage = 'アカウントを準備しています...';
  render();

  try {
    const user = auth.currentUser;
    await updatePassword(user, pass);
    state.setupLoadingMessage = 'お子様の口座を作成しています...';
    render();
    await setDoc(doc(db, "users", user.uid), { role: 'parent' });
    const code = await generateFamilyCode();
    await setDoc(doc(db, "families", code), {
      parentUid: user.uid,
      childUids: [],
      childName: childName,
      points: 0,
      stockCap: DEFAULT_STOCK_CAP,
      childLinked: false,
      createdAt: Date.now()
    });
    state.requirePasswordSetup = false;
    state.isSending = false;
    state.setupLoadingMessage = '';
    state.role = 'parent';
    state.view = 'home';
    applyFuriganaState();
    await showAlert(`同期IDは【 ${code} 】です。\nお子様の端末でこのIDを入力すると連携できます。`, { title: '設定が完了しました' });
    runMigrationAndLoadChildren(user.uid);
  } catch (error) {
    state.isSending = false;
    state.setupLoadingMessage = '';
    render();
    await showAlert(friendlyError(error), { title: '設定できませんでした' });
  }
};

window.proposeTask = async () => {
  const t = document.getElementById('prop-title').value.trim();
  const titleKana = (document.getElementById('prop-title-kana')?.value || '').trim();
  const p = parseInt(document.getElementById('prop-points').value);
  const d = document.getElementById('prop-deadline').value;
  if (!t) return showAlert("やりたいことを入力してください");
  if (!p || p <= 0) return showAlert("ほしいポイントを1以上で入力してください");

  await guard('proposeTask', async () => {
    await ensureChildMember();
    await addDoc(collection(db, "tasks"), {
      familyCode: state.familyCode,
      title: t,
      titleKana,
      points: p,
      deadline: d ? new Date(d).getTime() : null,
      status: 'proposed',
      createdAt: Date.now()
    });
    setView('home');
    showToast("見積りを送りました");
  }, { busyLabel: '送信しています...' });
};

window.approveProposal = async (id) => guard(`approveProposal:${id}`, async () => {
  await updateDoc(doc(db, "tasks", id), { status: 'open' });
  showToast("見積りを承認しました");
});

window.rejectProposal = async (id) => {
  const ok = await showConfirm("却下すると、この見積りは仕事になりません。", { title: 'この見積りを却下しますか？', okLabel: '却下する' });
  if (!ok) return;
  await guard(`rejectProposal:${id}`, () => updateDoc(doc(db, "tasks", id), { status: 'proposal_rejected', rejectedAt: Date.now() }));
};

window.acceptTask = async (id) => guard(`acceptTask:${id}`, async () => {
  await updateDoc(doc(db, "tasks", id), { status: 'accepted' });
  showToast("受注しました");
});

window.addTicket2 = async () => {
  const t = document.getElementById('t-title').value.trim();
  const p = parseInt(document.getElementById('t-pts').value);
  if (!t) return showAlert("チケットの品名を入力してください");
  if (!p || p <= 0) return showAlert("必要なポイントを1以上で入力してください");
  await guard('addTicket', async () => {
    await addDoc(collection(db, "tickets"), { familyCode: state.familyCode, title: t, price: p, status: 'available', createdAt: Date.now() });
    document.getElementById('t-title').value = '';
    document.getElementById('t-pts').value = '';
    showToast("チケットを追加しました");
  }, { busyLabel: '追加しています...' });
};

window.buyTicket = async (id, p) => {
  const price = Number(p) || 0;
  if (state.points < price) return showAlert(`ポイントが足りません（所持: ${state.points}円 / 必要: ${price}円）`);
  const ok = await showConfirm(`${price}円 を使って購入します。`, { title: 'このチケットを買いますか？', okLabel: '購入する' });
  if (!ok) return;

  await guard(`buyTicket:${id}`, async () => {
    const ticketRef = doc(db, "tickets", id);
    const famRef = doc(db, "families", state.familyCode);
    await runTransaction(db, async (tx) => {
      const tSnap = await tx.get(ticketRef);
      if (!tSnap.exists() || tSnap.data().status !== 'available') throw new Error('このチケットはすでに購入されています');
      const famSnap = await tx.get(famRef);
      const pts = famSnap.data().points || 0;
      if (pts < price) throw new Error('ポイントが足りません');
      tx.update(ticketRef, { status: 'bought', boughtAt: Date.now() });
      tx.update(famRef, { points: pts - price });
    });
    showToast("チケットを買いました");
  }, { busyLabel: '購入しています...' });
};

window.useTicket = async (id) => guard(`useTicket:${id}`, async () => {
  await updateDoc(doc(db, "tickets", id), { status: 'used', usedAt: Date.now() });
  showToast("使用済みにしました");
});

/** いま持っている株に売買ログが無いとき、買った日のログを1件作る（グラフ用） */
let investmentLogBackfillBusy = false;
let investmentLogBackfillTimer = 0;
function scheduleBackfillInvestmentBuyLogs() {
  if (investmentLogBackfillTimer) return;
  investmentLogBackfillTimer = setTimeout(() => {
    investmentLogBackfillTimer = 0;
    backfillInvestmentBuyLogs();
  }, 0);
}
async function backfillInvestmentBuyLogs() {
  if (!state.familyCode || investmentLogBackfillBusy) return;
  const invs = getActiveInvestments(state.investments);
  const logs = state.investmentLogs || [];
  if (!invs.length) return;

  const rates = getCurrentMarketRates();
  const missing = [];
  for (const inv of invs) {
    const name = inv.name;
    if (!name) continue;
    const held = Number(inv.investedPoints) || 0;
    if (!(held > 0)) continue;

    const tradeLogs = logs.filter(l => l.name === name && (l.type === 'buy' || l.type === 'sell'));
    const net = tradeLogs.reduce((sum, l) => {
      const pts = Number(l.investedPoints) || 0;
      return sum + (l.type === 'sell' ? -pts : pts);
    }, 0);

    // ログの合計が持ち株より大きい＝重複ログ。足し増ししない
    if (net > held + 0.5) continue;
    if (net + 0.5 >= held) continue;

    const gap = held - Math.max(0, net);
    if (!(gap >= 1)) continue;

    const created = Number(inv.createdAt) || 0;
    const sheetBuy = created > 0 ? (Number(inv.buyRate) || rates[name] || 1) : (rates[name] || 1);
    const rate = Number(inv.buyRate) > 0 ? Number(inv.buyRate) : sheetBuy;
    const safeRate = rate > 0 ? rate : 1;
    // 壊れた買値で口数が爆発しないよう、今の相場の1/8〜8倍に収める
    const cur = rates[name] || safeRate;
    const buy = (safeRate >= cur / 8 && safeRate <= cur * 8) ? safeRate : cur;
    // 部分ログがある不足分は「今」付与。createdAt へまとめると過去日を汚染する
    const hasPartialLogs = net > 0.5;
    const backfillAt = (!hasPartialLogs && created > 0) ? created : Date.now();

    missing.push({
      name,
      investedPoints: gap,
      shares: gap / buy,
      rate: buy,
      at: backfillAt
    });
  }
  if (!missing.length) return;

  investmentLogBackfillBusy = true;
  try {
    await Promise.all(missing.map(row =>
      addDoc(collection(db, "investmentLogs"), {
        familyCode: state.familyCode,
        name: row.name,
        type: 'buy',
        investedPoints: row.investedPoints,
        shares: row.shares,
        rate: row.rate,
        at: row.at,
        backfilled: true
      })
    ));
  } catch (e) {
    console.error('[investmentLogs backfill]', e);
  } finally {
    investmentLogBackfillBusy = false;
  }
}

let investmentEodBusy = false;
let eodLogTimer = null;

function eodLogDocId(familyCode, name, dayKey) {
  const safe = encodeURIComponent(String(name || '')).replace(/%/g, '');
  return `eod_${familyCode}_${safe}_${dayKey}`;
}

function eodRowNeedsWrite(existing, row) {
  if (!existing) return true;
  if (!existing.finalized) return true;
  const sp = Math.round(Number(existing.investedPoints) || 0);
  const ep = Math.round(Number(row.investedPoints) || 0);
  const sa = Math.round(Number(existing.assets) || 0);
  const ea = Math.round(Number(row.assets) || 0);
  return Math.abs(sp - ep) > 0.5 || Math.abs(sa - ea) > 1;
}

/** 指定した日本日付の EOD。finalized でも buy/sell 再生と不一致なら上書き */
async function writeInvestmentEodLogs(dayKey, finalized, { appendLogs = [] } = {}) {
  if (!state.familyCode || !dayKey || investmentEodBusy) return;
  const logs = [...(state.investmentLogs || []), ...appendLogs];

  const rows = buildInvestmentEodRows(state.investments, logs, dayKey, state.stockCap);
  if (!rows.length) return;

  const toWrite = rows.filter(row => {
    const existing = logs.find(l =>
      l.type === 'eod' && l.dayKey === dayKey && l.name === row.name
    );
    return eodRowNeedsWrite(existing, row);
  });
  if (!toWrite.length) return;

  investmentEodBusy = true;
  try {
    await Promise.all(toWrite.map(row => setDoc(doc(db, 'investmentLogs', eodLogDocId(state.familyCode, row.name, dayKey)), {
      familyCode: state.familyCode,
      name: row.name,
      type: 'eod',
      dayKey,
      investedPoints: row.investedPoints,
      shares: row.shares,
      assets: row.assets,
      at: row.at,
      finalized: !!finalized
    }, { merge: true })));
  } catch (e) {
    console.warn('[investmentLogs eod]', e);
  } finally {
    investmentEodBusy = false;
  }
}

let eodMigrationBusy = false;
let eodMigrationScheduled = false;
let eodMigrationWaitTicks = 0;

function eodMigrationStorageKey(familyCode) {
  return `ieEodMigrated_${familyCode}_${INVESTMENT_EOD_MIGRATION_KEY}`;
}

function scheduleInvestmentEodMigration() {
  if (eodMigrationScheduled || !state.familyCode) return;
  if (!Array.isArray(state.investmentLogs)) return;
  eodMigrationScheduled = true;
  setTimeout(() => {
    eodMigrationScheduled = false;
    runInvestmentEodMigrationIfNeeded();
  }, 300);
}

/** 旧方式で汚染された EOD を buy/sell 再生で特定し、誤りだけ置換（finalized も対象） */
async function runInvestmentEodMigrationIfNeeded() {
  if (!state.familyCode || eodMigrationBusy) return;
  const lsKey = eodMigrationStorageKey(state.familyCode);
  if (localStorage.getItem(lsKey) === 'done') return;
  if (!Array.isArray(state.investmentLogs)) return;

  const sheetReady = state.marketSheetStatus === 'ok';
  if (!sheetReady && eodMigrationWaitTicks < 20) {
    eodMigrationWaitTicks += 1;
    scheduleInvestmentEodMigration();
    return;
  }

  eodMigrationBusy = true;
  try {
    const analysis = analyzeInvestmentEodMigration(
      state.investments,
      state.investmentLogs,
      state.stockCap,
      { sheetReady }
    );

    bootDebugLog('eod migration analysis', {
      through: analysis.throughDayKey,
      dayCount: analysis.dayKeys.length,
      toFix: analysis.toFix.length,
      unchanged: analysis.unchanged.length,
      targetDays: [...new Set(analysis.toFix.map(f => f.dayKey))].sort(),
      samples: analysis.toFix.slice(0, 25).map(f => ({
        dayKey: f.dayKey,
        name: f.name,
        action: f.action,
        stored: f.stored,
        expected: { principal: f.row.investedPoints, assets: f.row.assets }
      }))
    });

    if (!analysis.toFix.length) {
      localStorage.setItem(lsKey, 'done');
      return;
    }

    const todayKey = japanTodayKey();
    await Promise.all(analysis.toFix.map(fix => setDoc(
      doc(db, 'investmentLogs', eodLogDocId(state.familyCode, fix.name, fix.dayKey)),
      {
        familyCode: state.familyCode,
        name: fix.name,
        type: 'eod',
        dayKey: fix.dayKey,
        investedPoints: Math.round(Number(fix.row.investedPoints) || 0),
        shares: Number(fix.row.shares) || 0,
        assets: Math.round(Number(fix.row.assets) || 0),
        at: fix.row.at,
        finalized: fix.dayKey < todayKey
      },
      { merge: true }
    )));

    bootDebugLog('eod migration applied', { count: analysis.toFix.length });
    localStorage.setItem(lsKey, 'done');
  } catch (e) {
    console.warn('[eod migration]', e);
  } finally {
    eodMigrationBusy = false;
  }
}

async function refreshTodayInvestmentEod(appendLogs = []) {
  await writeInvestmentEodLogs(japanTodayKey(), false, { appendLogs });
}

async function catchupInvestmentEodLogs() {
  if (!state.familyCode) return;
  await writeInvestmentEodLogs(japanYesterdayKey(), true);
  await writeInvestmentEodLogs(japanTodayKey(), false);
}

function startEodLogTimer() {
  stopEodLogTimer();
  catchupInvestmentEodLogs();
  eodLogTimer = setInterval(() => catchupInvestmentEodLogs(), 24 * 60 * 60 * 1000);
}

function stopEodLogTimer() {
  if (eodLogTimer) {
    clearInterval(eodLogTimer);
    eodLogTimer = null;
  }
}

window.sellCustom = async (id) => {
  const inv = getActiveInvestments(state.investments).find(i => i.id === id);
  if (!inv) return showAlert('この投資は見つかりませんでした');
  const cur = getCurrentMarketRates();
  const r = cur[inv.name];
  if (!(r > 0)) return showAlert('いまの相場が取れませんでした');
  const values = getInvestmentValues(getActiveInvestments(state.investments), cur, state.stockCap);
  const value = Math.max(0, values[id] ?? Math.round(getHoldingValue(inv, r)));
  const ok = await showConfirm(
    `今の価値は ${value}円 です。売ってポイントに戻します。`,
    { title: '売却しますか？', okLabel: '売却する' }
  );
  if (!ok) return;
  await guard(`sellCustom:${id}`, async () => {
    const famRef = doc(db, "families", state.familyCode);
    const invRef = doc(db, "investments", id);
    const at = Date.now();
    await runTransaction(db, async (tx) => {
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('この投資は見つかりませんでした');
      const data = invSnap.data() || {};
      if (data.status === 'sold') throw new Error('この投資はすでに売却済みです');
      const famSnap = await tx.get(famRef);
      if (!famSnap.exists()) throw new Error('口座が見つかりませんでした');
      const pts = famSnap.data().points || 0;
      if (value > 0) tx.update(famRef, { points: pts + value });
      // 消さず残す。過去の元本・運用資産をグラフで再現するため
      tx.update(invRef, {
        status: 'sold',
        soldAt: at,
        soldValue: value,
        soldRate: r
      });
    });
    try {
      const sellLog = {
        familyCode: state.familyCode,
        name: inv.name,
        type: 'sell',
        investedPoints: Number(inv.investedPoints) || 0,
        shares: getHoldingShares(inv, r),
        value,
        rate: r,
        at
      };
      await addDoc(collection(db, "investmentLogs"), sellLog);
      await refreshTodayInvestmentEod([sellLog]);
    } catch (e) {
      console.warn('[investmentLogs]', e);
    }
    setView('invest');
    showToast(`${value}円 になりました`);
  }, { busyLabel: '売却しています...' });
};

window.investCustom = async (n) => { 
  if (state.points < 0) return showAlert("残高がマイナスのため、株の購入はできません。お手伝いでポイントを取り戻しましょう！");
  const valStr = document.getElementById('invest-amount').value;
  if (!valStr) return showAlert("投資する金額(円)を入力してください");
  const a = parseInt(valStr); 
  if (isNaN(a) || a <= 0) return showAlert("正しい金額を入力してください");
  if (state.points < a) return showAlert(`ポイントが足りません（所持: ${state.points}円）`); 

  const dbName = marketNameFromId(n);
  if (!dbName) return showAlert("この市場は選べません");
  if (state.marketSheetStatus !== 'ok') {
    return showAlert('設定でスプレッドシートをつないでから買ってください', { title: '実際の相場がまだありません' });
  }
  if (!(state.marketSheetMarkets || []).includes(dbName)) {
    return showAlert(`表に「${dbName}」の列がありません`, { title: 'この市場は買えません' });
  }
  const meta = MARKET_META[dbName];

  await guard(`invest:${n}`, async () => {
    const cur = getCurrentMarketRates();
    const r = cur[dbName];
    if (!(r > 0)) throw new Error('いまの相場が取れませんでした');
    const at = Date.now();
    const buyShares = a / r;

    await updateDoc(doc(db, "families", state.familyCode), { points: increment(-a) });
    const ex = getActiveInvestments(state.investments).find(i => i.name === dbName);
    if (ex) {
      const oldInvested = Number(ex.investedPoints) || 0;
      const oldShares = getHoldingShares(ex, r);
      const newInvested = oldInvested + a;
      const newShares = oldShares + buyShares;
      await updateDoc(doc(db, "investments", ex.id), {
        investedPoints: newInvested,
        shares: newShares,
        buyRate: newShares > 0 ? newInvested / newShares : r
      });
    } else {
      await addDoc(collection(db, "investments"), {
        familyCode: state.familyCode,
        name: dbName,
        investedPoints: a,
        shares: buyShares,
        buyRate: r,
        createdAt: at
      });
    }
    const buyLog = {
      familyCode: state.familyCode,
      name: dbName,
      type: 'buy',
      investedPoints: a,
      shares: buyShares,
      rate: r,
      at
    };
    await addDoc(collection(db, "investmentLogs"), buyLog).catch(e => console.warn('[investmentLogs]', e));
    await refreshTodayInvestmentEod([buyLog]);
    setView('invest');
    showToast(`${meta.label}を ${a}円 買いました`);
  }, { busyLabel: '購入しています...' });
};

window.sendWish = async () => {
  const a = parseInt(document.getElementById('wish-points')?.value, 10);
  const reason = (document.getElementById('wish-reason')?.value || '').trim();
  if (!a || a <= 0) return showAlert('ほしい円を入れてね');
  if (!reason) return showAlert('なぜ必要かを書いてね');
  await guard('sendWish', async () => {
    await ensureChildMember();
    await addDoc(collection(db, 'wishes'), {
      familyCode: state.familyCode,
      points: a,
      reason,
      childName: state.childName || '',
      status: 'pending',
      createdAt: Date.now()
    });
    setView('home');
    showToast('おねがいをおくったよ');
  }, { busyLabel: 'おくっています...' });
};

window.approveWish = async (id, p) => {
  const amount = Number(p) || 0;
  if (amount <= 0) return;
  const ok = await showConfirm(
    `${amount}円をお子さまの口座に足します。`,
    { title: 'こづかいをわたしますか？', okLabel: 'わたす' }
  );
  if (!ok) return;
  await guard(`approveWish:${id}`, async () => {
    const wishRef = doc(db, 'wishes', id);
    const famRef = doc(db, 'families', state.familyCode);
    await runTransaction(db, async (tx) => {
      const wSnap = await tx.get(wishRef);
      if (!wSnap.exists() || wSnap.data().status !== 'pending') throw new Error('このお願いはすでに処理されています');
      const famSnap = await tx.get(famRef);
      if (!famSnap.exists()) throw new Error('口座が見つかりませんでした');
      const pts = famSnap.data().points || 0;
      tx.update(famRef, { points: pts + amount });
      tx.update(wishRef, { status: 'approved', approvedAt: Date.now() });
    });
    showToast('こづかいを渡しました');
  }, { busyLabel: 'わたしています...' });
};

window.rejectWish = async (id) => {
  const ok = await showConfirm('お子さまに届きます。', { title: 'このお願いをことわりますか？', okLabel: 'ことわる' });
  if (!ok) return;
  await guard(`rejectWish:${id}`, () => updateDoc(doc(db, 'wishes', id), { status: 'rejected', rejectedAt: Date.now() }));
  showToast('ことわりました');
};

window.requestExchange = async () => {
  if (state.points < 0) return showAlert("残高がマイナスのため、換金申請はできません。お手伝いでポイントを取り戻しましょう！");
  const a = parseInt(document.getElementById('exchange-amount').value);
  if (!a || a <= 0) return showAlert("換金したいポイントを入力してください");
  if (state.points < a) return showAlert(`ポイントが足りません（所持: ${state.points}円）`);
  await guard('requestExchange', async () => {
    await ensureChildMember();
    await addDoc(collection(db, "exchanges"), { familyCode: state.familyCode, points: a, yen: a, status: 'pending', createdAt: Date.now() });
    setView('home');
    showToast("換金を申請しました");
  }, { busyLabel: '申請しています...' });
};

window.approveExchange = async (id, p) => {
  const amount = Number(p) || 0;
  if (state.points < amount) return showAlert(`ポイントが足りません（残高: ${state.points}円）`);
  const ok = await showConfirm(`${amount}円を口座から引き、現金 ${amount}円をお子さまに渡します。`, { title: 'この換金を承認しますか？', okLabel: '承認する' });
  if (!ok) return;

  await guard(`approveExchange:${id}`, async () => {
    const exRef = doc(db, "exchanges", id);
    const famRef = doc(db, "families", state.familyCode);
    await runTransaction(db, async (tx) => {
      const exSnap = await tx.get(exRef);
      if (!exSnap.exists() || exSnap.data().status !== 'pending') throw new Error('この申請はすでに処理されています');
      const famSnap = await tx.get(famRef);
      const pts = famSnap.data().points || 0;
      if (pts < amount) throw new Error('ポイントが足りません');
      tx.update(famRef, { points: pts - amount });
      tx.update(exRef, { status: 'approved', approvedAt: Date.now() });
    });
    showToast("換金を承認しました");
  }, { busyLabel: '承認しています...' });
};

window.rejectExchange = async (id) => {
  const ok = await showConfirm("お子さまに却下として通知されます。", { title: 'この換金申請を却下しますか？', okLabel: '却下する' });
  if (!ok) return;
  await guard(`rejectExchange:${id}`, () => updateDoc(doc(db, "exchanges", id), { status: 'rejected' }));
};

/**
 * 銀行利息（日次累積・翌月1日に前月分を amount へ入金）。旧一括エンジンは削除済み。
 */
let bankInterestBusy = false;
async function applyBankMonthlyInterest() {
  if (!state.familyCode || bankInterestBusy || !state.banks?.length) return;
  bankInterestBusy = true;
  try {
    for (const b of state.banks) {
      if (!b?.id) continue;
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'banks', b.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const next = computeBankInterestState(data, Date.now());
          const before = {
            amount: data.amount,
            principal: data.principal,
            accruedInterest: data.accruedInterest,
            lastAccruedDate: data.lastAccruedDate,
            lastSettledMonth: data.lastSettledMonth,
            interestEngineVersion: data.interestEngineVersion,
            lastInterestKey: data.lastInterestKey
          };
          if (!bankInterestStateChanged(before, next)) return;
          tx.update(ref, bankInterestWritePayload(next));
        });
      } catch (e) {
        console.warn('[bank interest]', b.id, e);
      }
    }
  } finally {
    bankInterestBusy = false;
  }
}

window.depositBank = async () => {
  const a = parseInt(document.getElementById('bank-amount').value);
  if (!a || a <= 0) return showAlert("預ける金額を入力してください");
  if (state.points < a) return showAlert(`ポイントが足りません（所持: ${state.points}円）`);
  await guard('depositBank', async () => {
    const at = Date.now();
    const fields = initialBankDepositFields(a, at, at);
    await updateDoc(doc(db, "families", state.familyCode), { points: increment(-a) });
    await addDoc(collection(db, "banks"), {
      familyCode: state.familyCode,
      ...fields
    });
    setView('bank');
    showToast(`${a}円 を預けました`);
  }, { busyLabel: '預けています...' });
};

window.withdrawBank = async () => {
  if (!state.banks.length) return showAlert("預けているポイントがありません");
  const deposits = (state.banks || []).slice();
  let total = 0;
  for (const b of deposits) {
    total += bankDepositBalance(computeBankInterestState(b, Date.now()));
  }
  const ok = await showConfirm(
    "預金と利息をまとめてポイントに戻します。",
    { title: '全額を引き出しますか？', okLabel: '引き出す' }
  );
  if (!ok) return;
  await guard('withdrawBank', async () => {
    const famRef = doc(db, "families", state.familyCode);
    let withdrawn = 0;
    await runTransaction(db, async (tx) => {
      const famSnap = await tx.get(famRef);
      if (!famSnap.exists()) throw new Error('口座が見つかりませんでした');
      const bankSnaps = [];
      for (const b of deposits) {
        if (!b?.id) continue;
        const ref = doc(db, "banks", b.id);
        bankSnaps.push({ ref, snap: await tx.get(ref) });
      }
      let sum = 0;
      for (const { ref, snap } of bankSnaps) {
        if (!snap.exists()) continue;
        const next = computeBankInterestState(snap.data(), Date.now());
        sum += Math.floor(Number(next.amount) || 0);
        tx.delete(ref);
      }
      const pts = famSnap.data().points || 0;
      if (sum > 0) tx.update(famRef, { points: pts + sum });
      withdrawn = sum;
    });
    setView('home');
    showToast(`${withdrawn}円 引き出しました`);
  }, { busyLabel: '引き出しています...' });
};

/* ===== 相場CSV（GitHub Pages で公開。Googleシートは使わない） ===== */

const LEGACY_MARKET_SHEET_ID = '2PACX-1vQH6dOvrrmdx5rSEd-yTFGqi5ZJ-9qsxKxpslLoETxSCXKdzvdzgWS7dzLTYjPwrc2dRROqqnNAFewk';

function defaultMarketCsvUrl() {
  const key = japanTodayKey().replace(/-/g, '');
  return new URL(`market.csv?d=${key}`, document.baseURI).href;
}

const MARKET_SHEET_RELOAD_MS = 15 * 60 * 1000;
let marketSheetTimer = null;
let marketSheetLoadedUrl = null;
let marketSheetLastSig = '';

function marketSheetSignature(series) {
  if (!series) return '';
  return MARKET_ORDER.map(name => {
    const pts = series[name];
    if (!pts?.length) return `${name}:`;
    const last = pts[pts.length - 1];
    return `${name}:${last.ms}:${last.rate}`;
  }).join('|');
}

/** 家族データのURLが変わったときだけ読み直す。空／旧シートなら標準CSVを使う */
function applyMarketSheetUrl(url) {
  const raw = String(url || '').trim();
  const next = (!raw || raw.includes(LEGACY_MARKET_SHEET_ID))
    ? defaultMarketCsvUrl()
    : raw;
  state.marketSheetUrl = next;

  if (next === marketSheetLoadedUrl) return;
  marketSheetLoadedUrl = next;

  if (marketSheetTimer) {
    clearInterval(marketSheetTimer);
    marketSheetTimer = null;
  }
  loadMarketSheet(next, { quiet: false });
  loadMarketNews();
  marketSheetTimer = setInterval(() => {
    loadMarketSheet(next, { quiet: true });
    loadMarketNews();
  }, MARKET_SHEET_RELOAD_MS);
}

function defaultNewsUrl() {
  const key = japanTodayKey().replace(/-/g, '');
  return new URL(`news.json?d=${key}`, document.baseURI).href;
}

function isNewsHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function loadMarketNews() {
  try {
    const res = await fetch(defaultNewsUrl(), { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const items = (Array.isArray(json?.items) ? json.items : [])
      .map(row => ({
        about: String(row?.about || '').trim().slice(0, 40),
        title: String(row?.title || '').trim().slice(0, 180),
        blurb: String(row?.blurb || '').trim().slice(0, 120),
        topics: (Array.isArray(row?.topics) ? row.topics : [])
          .map(t => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 5),
        what: String(row?.what || '').trim().slice(0, 400),
        why: String(row?.why || '').trim().slice(0, 800),
        life: String(row?.life || '').trim().slice(0, 800),
        stocks: String(row?.stocks || '').trim().slice(0, 800),
        body: String(row?.body || '').trim().slice(0, 4000),
        url: String(row?.url || '').trim(),
        source: String(row?.source || row?.domain || '').replace(/^www\./, '').slice(0, 80)
      }))
      .filter(row => row.about && isNewsHttpUrl(row.url));
    const updatedAt = String(json?.updatedAt || '').trim();
    const kind = json?.kind === 'weekend' ? 'weekend' : 'market';
    const disclaimer = String(json?.disclaimer || '').trim().slice(0, 240);
    const next = JSON.stringify({ items, updatedAt, kind, disclaimer });
    const prev = JSON.stringify({
      items: state.marketNews || [],
      updatedAt: state.marketNewsUpdatedAt || '',
      kind: state.marketNewsKind || '',
      disclaimer: state.marketNewsDisclaimer || ''
    });
    if (next === prev) return;
    state.marketNews = items;
    state.marketNewsUpdatedAt = updatedAt;
    state.marketNewsKind = kind;
    state.marketNewsDisclaimer = disclaimer;
    // ホームではニュース未使用のため、取得完了だけでは全画面renderしない
    if (state.view !== 'home') scheduleRender();
  } catch {
    // ニュースが無くても相場は動かす
  }
}

async function loadMarketSheet(url, { quiet = false } = {}) {
  if (!quiet) {
    state.marketSheetStatus = 'loading';
    state.marketSheetError = '';
    scheduleRender();
  }
  try {
    const res = await fetch(normalizeSheetUrl(url), { cache: 'no-store' });
    if (!res.ok) throw new Error(`表を読めませんでした（${res.status}）`);
    const series = parseMarketSheetCsv(await res.text());
    const sig = marketSheetSignature(series);
    const changed = sig !== marketSheetLastSig;
    marketSheetLastSig = sig;
    setMarketSheetSeries(series);
    state.marketSheetStatus = 'ok';
    state.marketSheetMarkets = Object.keys(series);
    state.marketSheetUpdatedAt = Date.now();
    if (!quiet || changed) {
      scheduleRender();
    } else if (state.view === 'home' || state.view === 'invest') {
      // 画面はそのまま、グラフだけ最新レートへ
      setTimeout(() => drawInvestChart(), 0);
    }
    if (state.familyCode) {
      refreshTodayInvestmentEod().catch(e => console.warn('[investmentLogs eod]', e));
      scheduleInvestmentEodMigration();
    }
  } catch (error) {
    console.error('[marketSheet]', error);
    setMarketSheetSeries(null);
    marketSheetLastSig = '';
    state.marketSheetStatus = 'error';
    state.marketSheetMarkets = [];
    state.marketSheetError = error?.message || '表を読めませんでした';
    scheduleRender();
  }
}

/** 相場の表を読み直す（設定画面のボタン用） */
window.reloadMarketSheet = () => {
  loadMarketSheet(state.marketSheetUrl || defaultMarketCsvUrl(), { quiet: false });
};

/**
 * 相場のスプレッドシートURLを保存する。
 * 相場は兄弟で共通なので、その親の子ども全員に同じURLを入れる。
 */
window.saveMarketSheetUrl = async () => {
  if (state.role !== 'parent' || !state.familyCode) return;
  const el = document.getElementById('market-sheet-input');
  if (!el) return;
  const url = String(el.value || '').trim();
  if (url && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) {
    return showAlert('Googleスプレッドシートのアドレス（https://docs.google.com/spreadsheets/...）を貼ってください');
  }

  await guard('saveMarketSheetUrl', async () => {
    const codes = (state.children || []).map(c => c.id);
    if (!codes.includes(state.familyCode)) codes.push(state.familyCode);
    await Promise.all(codes.map(code =>
      updateDoc(doc(db, "families", code), {
        marketSheetUrl: url || deleteField()
      })
    ));
    applyMarketSheetUrl(url);
    showToast(url ? 'スプレッドシートにつなぎました' : 'スプレッドシートの接続を外しました');
    render();
  }, { busyLabel: '保存しています...' });
};

/** いま表示中の子の運用上限を保存。空欄または 0 は制限なし */
window.saveStockCap = async () => {
  if (state.role !== 'parent' || !state.familyCode) return;
  const el = document.getElementById('stock-cap-input');
  if (!el) return;
  const raw = String(el.value || '').trim();
  let cap = DEFAULT_STOCK_CAP;
  if (raw !== '') {
    cap = parseInt(raw, 10);
    if (!Number.isFinite(cap) || cap < 0) return showAlert('上限は 0 以上の整数で入力してください');
    if (cap === 0) cap = null;
  }
  const currentValue = getInvestmentPortfolioValue(
    getActiveInvestments(state.investments),
    getCurrentMarketRates(),
    null
  );
  if (cap != null && currentValue > cap) {
    const ok = await showConfirm(
      `いまの運用資産は ${currentValue.toLocaleString()}円 です。表示と売却額は ${cap.toLocaleString()}円 までになり、これ以上は増えません。`,
      { title: '運用上限を設定しますか？', okLabel: '設定する' }
    );
    if (!ok) return;
  }
  await guard('saveStockCap', async () => {
    await updateDoc(doc(db, "families", state.familyCode), {
      stockCap: cap == null ? 0 : cap,
      pointsCap: deleteField()
    });
    state.stockCap = cap;
    showToast(cap == null ? '運用上限を解除しました' : `運用上限を ${cap.toLocaleString()}円 にしました`);
    render();
  }, { busyLabel: '保存しています...' });
};

window.sendBalloon = async () => {
  const p = parseInt(document.getElementById('balloon-points').value);
  const m = document.getElementById('balloon-message').value.trim();
  if (!p || p <= 0) return showAlert("贈るポイントを入力してください");
  await guard('sendBalloon', async () => {
    await addDoc(collection(db, "balloons"), {
      familyCode: state.familyCode,
      points: p,
      message: m,
      status: 'unread',
      createdAt: Date.now()
    });
    setView('home');
    showToast("ギフトを送りました");
  }, { busyLabel: '送っています...' });
};

/** ギフトを受け取る。メッセージは state から読むので、属性に本文を埋め込まなくてよい。 */
window.openBalloon = async (id) => {
  const gift = (state.balloons || []).find(b => b.id === id && b.status !== 'received');
  if (!gift) return showAlert("このギフトはもう受け取り済みです");
  const amount = Number(gift.points) || 0;

  const received = await guard(`openBalloon:${id}`, async () => {
    const giftRef = doc(db, "balloons", id);
    const famRef = doc(db, "families", state.familyCode);
    let granted = null;
    await runTransaction(db, async (tx) => {
      const gSnap = await tx.get(giftRef);
      if (!gSnap.exists()) return;
      const data = gSnap.data() || {};
      if (data.status === 'received') return;
      const famSnap = await tx.get(famRef);
      if (!famSnap.exists()) return;
      const pts = famSnap.data().points || 0;
      granted = amount;
      if (granted > 0) tx.update(famRef, { points: pts + granted });
      tx.update(giftRef, { status: 'received', receivedAt: Date.now() });
    });
    return granted;
  }, { busyLabel: '受け取っています...' });

  if (received == null) return;
  if (received > 0) {
    const body = gift.message
      ? `「${gift.message}」\n\nボーナス ${received}円 を受け取りました！`
      : `ボーナス ${received}円 を受け取りました！`;
    await showAlert(body, { title: 'ギフトが届きました', tone: 'gift' });
  }
};


window.addNewChild = async () => {
  const entered = await showPrompt("追加するお子様の名前を入力してください", { title: 'お子様を追加', placeholder: '例: たろう' });
  const name = (entered || '').trim();
  if (!name) return;
  const user = auth.currentUser;
  if (!user) return showAlert("ログインしていません。もう一度ログインしてください。");

  const code = await guard('addNewChild', async () => {
    const newCode = await generateFamilyCode();
    await setDoc(doc(db, "families", newCode), {
      parentUid: user.uid,
      childUids: [],
      childName: name,
      points: 0,
      stockCap: DEFAULT_STOCK_CAP,
      childLinked: false,
      createdAt: Date.now()
    });
    return newCode;
  }, { busyLabel: '登録しています...' });

  if (!code) return;
  await showAlert(`お子様の端末で同期ID【 ${code} 】を入力してください。`, { title: `「${name}」を登録しました` });
  switchActiveChild(code);
};

// 同期IDにひもづくデータの置き場所。お子さまを削除するときはここを全部さらう。
// pushTokens は一覧で引けない決まりにしてあるので、Cloud Functions 側で掃除する。
const FAMILY_DATA_COLLECTIONS = [
  'tasks', 'taskTemplates', 'tickets', 'wishes', 'exchanges', 'investments', 'investmentLogs',
  'banks', 'balloons', 'scheduledPayments', 'paymentLogs'
];

/** ある同期IDにひもづく書類を、まとめ書きの上限（500件）を超えないように分けて消す */
async function deleteFamilyDocs(collectionName, familyCode) {
  const snap = await getDocs(query(collection(db, collectionName), where("familyCode", "==", familyCode)));
  const refs = snap.docs.map(d => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

window.deleteChild = async (code) => {
  const list = state.children || [];
  const target = list.find(c => c.id === code);
  if (!target) return;

  const name = target.childName || 'このお子さま';

  // 最後の1人を消すと口座がなくなり、親は新しく作り直す入口を失ってしまう
  if (list.length <= 1) {
    return showAlert(
      'ひとりだけのときは削除できません。\n先に別のお子さまを追加してから削除してください。',
      { title: '削除できません' }
    );
  }

  const ok = await showConfirm(
    `「${name}」のお仕事・ポイント・株・チケット・履歴が、すべて消えます。\n元に戻すことはできません。`,
    { title: `「${name}」を削除しますか？`, okLabel: '確認へ進む', tone: 'danger' }
  );
  if (!ok) return;

  // 押しまちがいで消えてしまわないよう、名前を書いてもらう
  const typed = await showPrompt(
    `本当に消す場合は、下に「${name}」と入力してください。`,
    { title: '最後の確認', placeholder: name, okLabel: '削除する', tone: 'danger' }
  );
  if (typed === null || typed === undefined) return;
  if (String(typed).trim() !== name) {
    return showAlert('名前が合いませんでした。削除はしていません。', { title: '削除を取り消しました' });
  }

  const next = list.find(c => c.id !== code);

  const done = await guard(`deleteChild:${code}`, async () => {
    for (const collectionName of FAMILY_DATA_COLLECTIONS) {
      await deleteFamilyDocs(collectionName, code);
    }
    // 家族の書類はいちばん最後に消す。先に消すとルールの家族チェックが通らなくなり、
    // 残ったデータを消せなくなってしまう。
    await deleteDoc(doc(db, "families", code));
    return true;
  }, { busyLabel: `「${name}」のデータを消しています...` });

  if (!done) return;

  showToast(`「${name}」を削除しました`);
  if (next) switchActiveChild(next.id);
};

window.logoutAccount = async () => {
  const ok = await showConfirm(
    'この端末からログアウトします。家族との連携やデータは解除されません。',
    { title: 'ログアウトしますか？', okLabel: 'ログアウト', cancelLabel: 'キャンセル' }
  );
  if (!ok) return;
  await unregisterPush();
  if (window.unsubChildren) window.unsubChildren();
  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];
  stopDeadlineWatcher();
  try { await signOut(auth); } catch (e) {}
  localStorage.removeItem('ienomics_role');
  localStorage.removeItem('ienomics_familyCode');
  state.role = null;
  state.familyCode = null;
  state.setupMode = null;
  state.setupStep = 1;
  state.children = [];
  state.childName = '';
  state.points = 0;
  state.stockCap = null;
  state.childLinked = false;
  state.view = 'home';
  state.requirePasswordSetup = false;
  render();
};

window.unlinkAccount = async () => {
  const ok = await showConfirm("この端末からデータが見えなくなります。同期IDを入れ直せば元に戻せます。", { title: '連携を解除しますか？', okLabel: '解除する', tone: 'danger' });
  if (!ok) return;
  // 解除後の端末に通知が届き続けないよう、先に宛先を消す
  await unregisterPush();
  try { await signOut(auth); } catch (e) {}
  localStorage.removeItem('ienomics_role');
  localStorage.removeItem('ienomics_familyCode');
  state.role = null; state.familyCode = null; state.children = [];
  if (window.unsubChildren) window.unsubChildren();
  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];
  stopDeadlineWatcher();
  window.location.reload();
};

window.deleteTask = async (id) => { 
  const ok = await showConfirm("削除すると元に戻せません。", { title: 'このお仕事を削除しますか？', okLabel: '削除する', tone: 'danger' });
  if (!ok) return;
  await guard(`deleteTask:${id}`, async () => {
    const task = state.tasks.find(t => t.id === id);
    const gk = taskGeneratedKey(task);
    if (gk) {
      generatedToday[gk] = true;
      await updateDoc(doc(db, "tasks", id), { status: 'deleted', deletedAt: Date.now() });
    } else {
      await deleteDoc(doc(db, "tasks", id));
    }
    setView('home');
  }, { busyLabel: '削除しています...' });
};

window.deleteTicket = async (id) => {
  const ok = await showConfirm("削除すると元に戻せません。", { title: 'このチケットを削除しますか？', okLabel: '削除する', tone: 'danger' });
  if (!ok) return;
  await guard(`deleteTicket:${id}`, () => deleteDoc(doc(db, "tickets", id)));
};

window.openPaymentEdit = async (id) => {
  if (state.role !== 'parent') return;
  const p = state.scheduledPayments.find(x => x.id === id);
  if (!p) return showAlert("支払い設定が見つかりません");
  state.editingPaymentId = id;
  state.view = 'paymentEdit';
  render();
};

window.togglePaymentAmountUI = () => {
  const kind = document.querySelector('input[name="pay-amount-kind"]:checked')?.value || 'fixed';
  document.getElementById('pay-amount-fixed')?.classList.toggle('hidden', kind !== 'fixed');
  document.getElementById('pay-amount-percent')?.classList.toggle('hidden', kind !== 'percentLastMonth');
};

window.togglePaymentEditAmountUI = () => {
  const kind = document.querySelector('input[name="pay-edit-amount-kind"]:checked')?.value || 'fixed';
  document.getElementById('pay-edit-amount-fixed')?.classList.toggle('hidden', kind !== 'fixed');
  document.getElementById('pay-edit-amount-percent')?.classList.toggle('hidden', kind !== 'percentLastMonth');
};

window.togglePaymentModeUI = () => {
  const mode = document.querySelector('input[name="pay-mode"]:checked')?.value || 'once';
  document.getElementById('pay-once-ui')?.classList.toggle('hidden', mode !== 'once');
  document.getElementById('pay-repeat-ui')?.classList.toggle('hidden', mode !== 'repeat');
};

window.togglePaymentCountUI = () => {
  const mode = document.querySelector('input[name="pay-count-mode"]:checked')?.value || 'infinite';
  document.getElementById('pay-count-input-wrap')?.classList.toggle('hidden', mode !== 'finite');
};

window.setPayInterval = (type) => {
  window.payInterval = type;
  const isWeekly = type === 'weekly';
  document.getElementById('pay-weekly-select')?.classList.toggle('hidden', !isWeekly);
  document.getElementById('pay-monthly-select')?.classList.toggle('hidden', isWeekly);
  document.getElementById('btn-pay-weekly')?.classList.toggle('primary-btn', isWeekly);
  document.getElementById('btn-pay-monthly')?.classList.toggle('primary-btn', !isWeekly);
};

window.addScheduledPayment = async () => {
  if (state.role !== 'parent') return;
  const title = document.getElementById('pay-title')?.value.trim();
  const amountKind = document.querySelector('input[name="pay-amount-kind"]:checked')?.value || 'fixed';
  const mode = document.querySelector('input[name="pay-mode"]:checked')?.value || 'once';
  if (!title) return showAlert("支払いの名目を入力してください");

  const data = {
    familyCode: state.familyCode,
    title,
    amountKind,
    mode,
    status: 'active',
    lastChargedKey: null,
    createdAt: Date.now()
  };

  if (amountKind === 'percentLastMonth') {
    const percent = Number(document.getElementById('pay-percent')?.value);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return showAlert("割合は1〜100の数字で入力してください");
    }
    data.percent = percent;
    data.amount = 0;
  } else {
    const amount = parseInt(document.getElementById('pay-amount')?.value);
    if (!amount || amount <= 0) return showAlert("正しい金額を入力してください");
    data.amount = amount;
    data.percent = null;
  }

  if (mode === 'once') {
    const due = document.getElementById('pay-due-date')?.value;
    if (!due) return showAlert("引落日を選んでください");
    const jDue = japanParts(new Date(`${due}T12:00:00+09:00`));
    data.dueDate = `${jDue.year}-${jDue.month}-${jDue.day}`;
  } else {
    const interval = window.payInterval || 'monthly';
    let days = [];
    if (interval === 'weekly') {
      document.querySelectorAll('input[name="pay-weeks"]:checked').forEach(cb => days.push(parseInt(cb.value)));
      if (days.length === 0) return showAlert("曜日を1つ以上選んでください");
    } else {
      days.push(parseInt(document.getElementById('pay-day-select').value));
    }
    const countMode = document.querySelector('input[name="pay-count-mode"]:checked')?.value || 'infinite';
    data.interval = interval;
    data.days = days;
    data.countMode = countMode;
    if (countMode === 'finite') {
      const n = parseInt(document.getElementById('pay-count')?.value);
      if (!n || n < 1) return showAlert("回数は1以上にしてください");
      data.totalCount = n;
      data.remainingCount = n;
    } else {
      data.totalCount = null;
      data.remainingCount = null;
    }
  }

  await guard('addScheduledPayment', async () => {
    const ref = await addDoc(collection(db, "scheduledPayments"), data);
    // state 反映を待たず、作った支払いをその場で落とす（当日設定が空振りしない）
    const created = { id: ref.id, ...data };
    try {
      const result = await chargeOneScheduledPayment(created);
      setView('payments');
      if (result === 'charged') {
        showToast(`「${data.title}」を引き落としました`);
      } else if (result === 'zero') {
        showToast("支払いを設定しました（今回の金額は0円）");
      } else {
        showToast("支払いを設定しました");
        paymentProcessQueued = true;
        processScheduledPayments();
      }
    } catch (err) {
      console.error('[addScheduledPayment charge]', err);
      setView('payments');
      showToast("支払いを設定しました（引落はあとで再試行します）");
      paymentProcessQueued = true;
      processScheduledPayments();
    }
  }, { busyLabel: '設定しています...' });
};

window.updateScheduledPayment = async () => {
  if (state.role !== 'parent') return;
  const id = state.editingPaymentId;
  if (!id) return;
  const title = document.getElementById('pay-edit-title')?.value.trim();
  const amountKind = document.querySelector('input[name="pay-edit-amount-kind"]:checked')?.value || 'fixed';
  if (!title) return showAlert("名目を入力してください");
  const updates = { title, amountKind };
  if (amountKind === 'percentLastMonth') {
    const percent = Number(document.getElementById('pay-edit-percent')?.value);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return showAlert("割合は1〜100の数字で入力してください");
    }
    updates.percent = percent;
    updates.amount = 0;
  } else {
    const amount = parseInt(document.getElementById('pay-edit-amount')?.value);
    if (!amount || amount <= 0) return showAlert("正しい金額を入力してください");
    updates.amount = amount;
    updates.percent = null;
  }
  await guard(`updatePayment:${id}`, async () => {
    await updateDoc(doc(db, "scheduledPayments", id), updates);
    state.editingPaymentId = null;
    setView('payments');
    showToast("支払い設定を更新しました");
  }, { busyLabel: '更新しています...' });
};

window.deleteScheduledPayment = async (id) => {
  if (state.role !== 'parent') return;
  const targetId = id || state.editingPaymentId;
  if (!targetId) return;
  const ok = await showConfirm("今後この支払いは引き落とされなくなります。", { title: 'この支払い設定を削除しますか？', okLabel: '削除する', tone: 'danger' });
  if (!ok) return;
  await guard(`deletePayment:${targetId}`, async () => {
    await deleteDoc(doc(db, "scheduledPayments", targetId));
    state.editingPaymentId = null;
    setView('payments');
  }, { busyLabel: '削除しています...' });
};

window.joinFamily = async () => {
  const input = document.getElementById('setup-family-code');
  if (!input) return;
  const code = input.value.toUpperCase().trim();
  if (!code) return showAlert("同期IDを入力してください");

  const joined = await guard('joinFamily', async () => {
    await ensureAnonymousAuth();
    const docRef = doc(db, "families", code);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return false;

    state.familyCode = code;
    state.role = 'child';
    localStorage.setItem('ienomics_familyCode', code);
    localStorage.setItem('ienomics_role', 'child');
    applyFuriganaState();
    await claimChildMembership(code);
    setupListeners();
    render();
    return true;
  }, { busyLabel: '連携しています...' });

  if (joined === false) {
    await showAlert("その同期IDの口座は見つかりませんでした。文字をもう一度確認してください。", { title: 'IDが違うようです' });
  } else if (joined && !hasSeenTutorial()) {
    // 初回だけ、つながった直後に使い方を案内する
    setTimeout(() => startTutorial('child', { onFinish: onboardingTutorialFinish }), 700);
  }
};

window.sendRealEmailLink = async () => {
  const emailInput = document.getElementById('setup-email');
  if (!emailInput) return;
  const email = emailInput.value.trim();
  if (!email) return showAlert("メールアドレスを入力してください");
  try {
    state.isSending = true; render();
    const sendSignInEmail = httpsCallable(functionsAsia, 'sendSignInEmail');
    await sendSignInEmail({ email });
    window.localStorage.setItem('emailForSignIn', email);
    state.message = email;
    state.setupStep = 2;
  } catch (error) {
    const mapped = mapAuthEmailCallableError(error);
    const code = mapped?.code || '';
    if (code === 'auth/email-already-in-use') {
      const goLogin = await showConfirm(
        'このメールアドレスはすでに登録されています。\nログインしてください。',
        { title: '登録済みのメールアドレスです', okLabel: 'ログインへ', cancelLabel: '閉じる' }
      );
      if (goLogin) state.setupMode = 'parent_login';
    } else {
      await showAlert(friendlyError(mapped), { title: 'メールを送れませんでした' });
    }
  } finally {
    state.isSending = false; render();
  }
};

window.sendPasswordReset = async () => {
  try {
    const emailInput = document.getElementById('reset-email');
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email) return showAlert("メールアドレスを入力してください");
    state.isSending = true;
    render();
    const sendPasswordResetEmailFn = httpsCallable(functionsAsia, 'sendPasswordResetEmail');
    await sendPasswordResetEmailFn({ email });
    state.message = email;
    state.setupStep = 2;
  } catch (error) {
    const mapped = mapAuthEmailCallableError(error);
    const code = mapped?.code || '';
    if (code === 'auth/user-not-found') {
      await showAlert("このメールアドレスのアカウントが見つかりません");
    } else if (code === 'auth/invalid-email') {
      await showAlert("メールアドレスの形式が正しくありません");
    } else {
      await showAlert(friendlyError(mapped), { title: '送信できませんでした' });
    }
  } finally {
    state.isSending = false;
    render();
  }
};

window.submitPasswordReset = async () => {
  const code = state.resetPasswordCode;
  if (!code) return showAlert("再設定コードがありません。メールのリンクから再度開いてください。");
  const pass = document.getElementById('reset-new-password')?.value || '';
  const passConf = document.getElementById('reset-new-password-confirm')?.value || '';
  if (pass.length < 6) return showAlert("パスワードは6文字以上にしてください。");
  if (pass !== passConf) return showAlert("パスワードが一致しません！");
  try {
    state.isSending = true;
    render();
    await confirmPasswordReset(auth, code, pass);
    state.resetPasswordCode = null;
    state.setupMode = 'parent_login';
    state.setupStep = 1;
    state.message = '';
    await showAlert("新しいパスワードでログインしてください。", { title: 'パスワードを変更しました' });
  } catch (error) {
    await showAlert(friendlyError(error), { title: '再設定に失敗しました' });
  } finally {
    state.isSending = false;
    render();
  }
};

window.loginParent = async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  if (!email || !pass) return showAlert("メールアドレスとパスワードを入力してください");
  try {
    state.isSending = true; render();
    const result = await signInWithEmailAndPassword(auth, email, pass);
    state.role = 'parent';
    localStorage.setItem('ienomics_role', 'parent');
    applyFuriganaState();
    await runMigrationAndLoadChildren(result.user.uid);
    if (!hasSeenTutorial()) setTimeout(() => startTutorial('parent', { onFinish: onboardingTutorialFinish }), 900);
  } catch (error) {
    await showAlert("パスワードまたはメールアドレスが違います", { title: 'ログインできませんでした' });
  } finally {
    state.isSending = false; render();
  }
};

// PWA: オフラインでも開けるようにサービスワーカーを登録する
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=262').catch(err => console.warn('SW登録失敗:', err));
  });
}
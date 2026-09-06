// イエノミクスの通知サーバー。
//
// なぜサーバーが必要か:
//   ブラウザの new Notification() は、アプリが開いている間しか動かない。
//   スマホがスリープしていても通知を届けるには、Firestore の変化を見て
//   サーバーから送るしかない。それをやっているのがこのファイル。
//
// 送り先の管理:
//   各端末は pushTokens コレクションに { familyCode, role, token } を登録する。
//   「この家族の子供の端末ぜんぶ」に送りたいときは、そこを検索して使う。

const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { Resend } = require('resend');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

/** Resend API キー（Secret Manager: RESEND_API_KEY）。コード・Client には置かない */
const resendApiKey = defineSecret('RESEND_API_KEY');

/** Client の APP_URL / actionCodeSettings と同じ（サーバー固定） */
const AUTH_ACTION_CODE_SETTINGS = {
  url: 'https://whinaotona-debug.github.io/ienomics/index.html',
  handleCodeInApp: true
};

const AUTH_EMAIL_FROM = 'イエノミクス <noreply@ienomics.com>';
const AUTH_EMAIL_RATE_LIMIT_MS = 10 * 60 * 1000;
const AUTH_EMAIL_RATE_COLLECTION = 'authEmailRateLimits';

const JST = 'Asia/Tokyo';
const WEEKDAY_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 日本時間の壁時計。Cloud Functions の Date は UTC なので、ここで必ず揃える */
function japanParts(date = new Date()) {
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
    weekday,
    weekday: weekday
  };
}

function japanTodayKey(date = new Date()) {
  const j = japanParts(date);
  return `${j.year}-${j.month}-${j.day}`;
}

function japanDeadlineMs(hours, minutes, date = new Date()) {
  const j = japanParts(date);
  const h = Number.isFinite(hours) ? hours : 19;
  const m = Number.isFinite(minutes) ? minutes : 0;
  return new Date(`${j.year}-${pad2(j.month)}-${pad2(j.day)}T${pad2(h)}:${pad2(m)}:00+09:00`).getTime();
}

// 日本のユーザー向けなので東京リージョンに置く（通知が届くまでが少し速くなる）
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });

const APP_LINK = 'https://whinaotona-debug.github.io/ienomics/index.html';
const ICON = 'https://whinaotona-debug.github.io/ienomics/logo.png';

/**
 * 指定した家族の、指定した役割の端末すべてに通知を送る。
 * @param {string} familyCode 同期ID
 * @param {'parent'|'child'|'all'} role 送りたい相手
 */
async function notify(familyCode, role, title, body, tag) {
  if (!familyCode || !title) return;

  let query = db.collection('pushTokens').where('familyCode', '==', familyCode);
  if (role !== 'all') query = query.where('role', '==', role);

  const snap = await query.get();
  if (snap.empty) {
    console.log(`[notify] 宛先なし family=${familyCode} role=${role}`);
    return;
  }

  // 同じ端末が複数行あっても1回だけ送る
  const tokenToDocs = new Map();
  for (const d of snap.docs) {
    const token = d.get('token');
    if (!token) continue;
    if (!tokenToDocs.has(token)) tokenToDocs.set(token, []);
    tokenToDocs.get(token).push(d.ref);
  }
  const tokens = [...tokenToDocs.keys()];
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body: body || '' },
    webpush: {
      notification: {
        title,
        body: body || '',
        icon: ICON,
        badge: ICON,
        tag: tag || undefined,
        // 同じ種類の通知が来たら上書きせず、ちゃんと鳴らす
        renotify: Boolean(tag)
      },
      fcmOptions: { link: APP_LINK }
    }
  });

  // 使えなくなったトークンを掃除する（アプリを消した端末など）
  const stale = [];
  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code || '';
    console.warn(`[notify] 送信失敗 ${code}`);
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      stale.push(...tokenToDocs.get(tokens[i]));
    }
  });
  if (stale.length) {
    await Promise.all(stale.map(ref => ref.delete().catch(() => {})));
    console.log(`[notify] 無効トークンを${stale.length}件削除`);
  }

  console.log(`[notify] 成功${response.successCount} / 失敗${response.failureCount} (${title})`);
}

/** 子供の呼び名を取り出す */
async function getChildName(familyCode) {
  try {
    const snap = await db.collection('families').doc(familyCode).get();
    return snap.get('childName') || 'こども';
  } catch (e) {
    return 'こども';
  }
}

// ---- お仕事が追加されたとき ----
exports.onTaskCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const t = event.data?.data();
  if (!t || !t.familyCode) return;
  const points = Number(t.points) || 0;

  if (t.status === 'open') {
    await notify(
      t.familyCode, 'child',
      '新しいお仕事！',
      `「${t.title}」（${points}円）が発注されました`,
      'task-open'
    );
  } else if (t.status === 'accepted' && (t.autoAccepted || t.generatedKey)) {
    // 定期は受注手続きなしで始まるので、子供に「今日の分が出た」と知らせる
    await notify(
      t.familyCode, 'child',
      '今日の定期のお仕事',
      `「${t.title}」（${points}円）が始まりました。終わったら完了を押してね`,
      'task-repeat'
    );
  } else if (t.status === 'proposed') {
    const name = await getChildName(t.familyCode);
    await notify(
      t.familyCode, 'parent',
      '見積りが届きました',
      `${name}さんから「${t.title}」（希望 ${points}円）`,
      'task-proposed'
    );
  }
});

// ---- お仕事の状態が変わったとき ----
exports.onTaskUpdated = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || !after.familyCode) return;
  if (before.status === after.status) return;

  const code = after.familyCode;
  const title = after.title || 'お仕事';
  const points = Number(after.points) || 0;

  // 見積りが承認されて発注になった
  if (before.status === 'proposed' && after.status === 'open') {
    return notify(code, 'child', '見積りが承認されました！', `「${title}」がお仕事になりました`, 'task-approved');
  }
  // 見積りが却下された
  if (before.status === 'proposed' && after.status === 'proposal_rejected') {
    return notify(code, 'child', '見積りが却下されました', `「${title}」の見積りは通りませんでした`, 'task-rejected');
  }
  // 子供が完了報告した
  if (after.status === 'completed') {
    const name = await getChildName(code);
    return notify(code, 'parent', 'お仕事完了の報告', `${name}さんが「${title}」を終わらせました`, 'task-completed');
  }
  // 親がやり直しを指示した
  if (before.status === 'completed' && after.status === 'accepted') {
    return notify(code, 'child', 'やり直しの指示', `「${title}」をもう一度お願いします`, 'task-redo');
  }
  // 親が承認してポイントを付与した
  if (before.status === 'completed' && after.status === 'approved') {
    return notify(code, 'child', 'お仕事が承認されました！', `「${title}」で ${points}円 ゲット！`, 'task-paid');
  }
  // 子供が受注した
  if (before.status === 'open' && after.status === 'accepted') {
    const name = await getChildName(code);
    return notify(code, 'parent', 'お仕事を受注しました', `${name}さんが「${title}」を引き受けました`, 'task-accepted');
  }
  // 子供がお断りした
  if (after.status === 'rejected') {
    const name = await getChildName(code);
    return notify(code, 'parent', 'お仕事をお断りされました', `${name}さんが「${title}」を断りました`, 'task-declined');
  }
});

// ---- ギフトが届いたとき ----
exports.onGiftCreated = onDocumentCreated('balloons/{giftId}', async (event) => {
  const g = event.data?.data();
  if (!g || !g.familyCode) return;
  const points = Number(g.points) || 0;
  const body = g.message ? `「${g.message}」 +${points}円` : `ボーナス ${points}円 が届きました`;
  await notify(g.familyCode, 'child', 'ギフトが届きました', body, 'gift');
});

// ---- こづかいのお願いが来たとき ----
exports.onWishCreated = onDocumentCreated('wishes/{wishId}', async (event) => {
  const w = event.data?.data();
  if (!w || !w.familyCode || w.status !== 'pending') return;
  const name = await getChildName(w.familyCode);
  await notify(
    w.familyCode, 'parent',
    'こづかいのお願いが届きました',
    `${name}さんが ${Number(w.points) || 0}円 を希望しています`,
    'wish'
  );
});

exports.onWishUpdated = onDocumentUpdated('wishes/{wishId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status) return;
  const yen = Number(after.points) || 0;
  if (after.status === 'approved') {
    return notify(after.familyCode, 'child', 'お願いがとおりました！', `${yen}円 が口座に入りました`, 'wish-result');
  }
  if (after.status === 'rejected') {
    return notify(after.familyCode, 'child', 'お願いは今回だめでした', `${yen}円 のお願い`, 'wish-result');
  }
});

// ---- 換金の申請が来たとき ----
exports.onExchangeCreated = onDocumentCreated('exchanges/{exchangeId}', async (event) => {
  const e = event.data?.data();
  if (!e || !e.familyCode || e.status !== 'pending') return;
  const name = await getChildName(e.familyCode);
  await notify(
    e.familyCode, 'parent',
    '換金申請が届きました',
    `${name}さんが ${Number(e.yen) || 0}円 の換金を希望しています`,
    'exchange'
  );
});

// ---- 換金の結果が出たとき ----
exports.onExchangeUpdated = onDocumentUpdated('exchanges/{exchangeId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status) return;
  const yen = Number(after.yen) || 0;

  if (after.status === 'approved') {
    return notify(after.familyCode, 'child', '換金が承認されました！', `${yen}円 を受け取れます`, 'exchange-result');
  }
  if (after.status === 'rejected') {
    return notify(after.familyCode, 'child', '換金が却下されました', `${yen}円 の申請は通りませんでした`, 'exchange-result');
  }
});

// ---- 自動支払いが引き落とされたとき ----
exports.onPaymentCharged = onDocumentCreated('paymentLogs/{logId}', async (event) => {
  const l = event.data?.data();
  if (!l || !l.familyCode) return;
  const amount = Number(l.amount) || 0;
  const title = l.wentNegative ? '支払い引落（残高不足）' : '支払いが引き落とされました';
  const body = l.wentNegative
    ? `「${l.title}」 −${amount}円。口座がマイナスになりました`
    : `「${l.title}」 −${amount}円`;
  await notify(l.familyCode, 'all', title, body, 'payment');
});

// ---- お子さまの口座が削除されたとき ----
//
// 端末側でも関連データを消しているが、通知の宛先（pushTokens）は
// 「一覧で引けない」決まりにしてあるため端末からは掃除できない。
// 残しておくと消えた口座宛の通知が届き続けるので、ここで消す。
// 途中で通信が切れて端末側が消しきれなかった分の取りこぼしも拾う。
exports.onFamilyDeleted = onDocumentDeleted('families/{code}', async (event) => {
  const code = event.params.code;
  const collections = [
    'pushTokens', 'tasks', 'taskTemplates', 'tickets', 'wishes', 'exchanges',
    'investments', 'investmentLogs', 'banks', 'balloons', 'scheduledPayments', 'paymentLogs'
  ];

  let total = 0;
  for (const name of collections) {
    // まとめ書きの上限を超えないよう、500件ずつ消していく
    while (true) {
      const snap = await db.collection(name).where('familyCode', '==', code).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (snap.size < 400) break;
    }
  }

  console.log(`[onFamilyDeleted] family=${code} の残りデータ${total}件を削除`);
});

/**
 * 定期のお仕事を、サーバー側で今日分だけ作る。
 * ドキュメントIDは端末側と同じ `rep_{テンプレID}_{年月日}` なので二重にならない。
 */
async function runCleanupExpiredTasks() {
  const now = Date.now();
  const startToday = japanDeadlineMs(0, 0, new Date(now));
  const endToday = japanDeadlineMs(23, 59, new Date(now));
  const cutoff = now >= endToday ? now : startToday;
  const removable = new Set(['open', 'accepted', 'proposed', 'rejected', 'proposal_rejected']);
  let swept = 0;
  try {
    const snap = await db.collection('tasks').where('deadline', '<', cutoff).limit(300).get();
    for (const d of snap.docs) {
      const t = d.data() || {};
      if (!removable.has(t.status)) continue;
      await d.ref.update({
        status: 'deleted',
        deletedAt: now,
        autoDeleted: true
      });
      swept += 1;
    }
  } catch (e) {
    console.warn('[cleanupExpiredTasks]', e?.message || e);
  }
  if (swept) console.log(`[cleanupExpiredTasks] ${swept}件を削除`);
}

async function runGenerateRepeatedTasks() {
  const now = new Date();
  const j = japanParts(now);
  const todayStr = japanTodayKey(now);

  const snap = await db.collection('taskTemplates').get();
  if (snap.empty) return;

  let created = 0;
  let skipped = 0;
  let fixed = 0;

  for (const d of snap.docs) {
    const temp = d.data() || {};
    const days = Array.isArray(temp.days)
      ? temp.days.map(Number).filter(n => Number.isFinite(n))
      : [];

    let due = false;
    if (temp.type === 'weekly') due = days.includes(j.weekday);
    else if (temp.type === 'monthly') {
      const last = new Date(Date.UTC(j.year, j.month, 0)).getUTCDate();
      due = days.some(d => Math.min(d, last) === j.day);
    }
    if (!due) continue;

    const timeParts = String(temp.time || '').trim();
    const deadlineMs = timeParts
      ? (() => {
          const parts = timeParts.split(':');
          return japanDeadlineMs(Number(parts[0]), Number(parts[1]) || 0, now);
        })()
      : null;

    const generatedKey = `rep_${d.id}_${todayStr}`;
    const taskRef = db.collection('tasks').doc(generatedKey);
    const existing = await taskRef.get();
    if (existing.exists) {
      const data = existing.data() || {};
      if (deadlineMs != null && data.deadline !== deadlineMs && ['open', 'accepted'].includes(data.status)) {
        await taskRef.update({ deadline: deadlineMs });
        fixed += 1;
      }
      skipped += 1;
      continue;
    }

    await taskRef.set({
      familyCode: temp.familyCode,
      title: temp.title || 'お仕事',
      titleKana: temp.titleKana || '',
      points: Number(temp.points) || 0,
      status: 'accepted',
      generatedKey,
      templateId: d.id,
      createdAt: Date.now(),
      deadline: deadlineMs,
      autoGenerated: true,
      autoAccepted: true
    });
    created += 1;
  }

  console.log(`[generateRepeatedTasks] 作成${created} / 既存スキップ${skipped} / 期限修正${fixed} (${todayStr} JST ${j.hour}:${pad2(j.minute)})`);
}

// 0:00ちょうど（日本時間）。アプリを落としていなくても、サーバー側で今日分が出る。
function replayInvestmentPosition(logs, name, untilMs) {
  let principal = 0;
  let shares = 0;
  const events = (logs || [])
    .filter(l => l.name === name && (l.type === 'buy' || l.type === 'sell') && !l.backfilled)
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  for (const log of events) {
    const at = Number(log.at) || 0;
    if (!at || at > untilMs) continue;
    const pts = Number(log.investedPoints) || 0;
    const sh = Number(log.shares) || 0;
    if (log.type === 'buy') {
      principal += pts;
      shares += sh;
    } else {
      principal = Math.max(0, principal - pts);
      shares = Math.max(0, shares - sh);
    }
  }
  return { principal, shares };
}

/** 投資ドキュメントからの過去塗りつぶしは使わない（v240以降 EOD は売買ログ再生のみ） */

const CHART_TOTAL = '__total__';

function eodLogDocId(familyCode, name, dayKey) {
  const safe = encodeURIComponent(String(name || '')).replace(/%/g, '');
  return `eod_${familyCode}_${safe}_${dayKey}`;
}

/** 日本時間 0:00 に、前日の株元本・口数を確定ログとして残す */
async function runSnapshotInvestmentEod() {
  const todayStart = japanDeadlineMs(0, 0, new Date());
  const end = todayStart - 1;
  const yesterday = japanTodayKey(new Date(end));
  let invSnap;
  let logSnap;
  try {
    [invSnap, logSnap] = await Promise.all([
      db.collection('investments').get(),
      db.collection('investmentLogs').get()
    ]);
  } catch (e) {
    console.warn('[snapshotInvestmentEod]', e?.message || e);
    return;
  }

  const byFamily = new Map();
  const add = (code, key, row) => {
    if (!code) return;
    if (!byFamily.has(code)) byFamily.set(code, { inv: [], logs: [] });
    byFamily.get(code)[key].push(row);
  };
  for (const d of invSnap.docs) add(d.get('familyCode'), 'inv', { id: d.id, ...d.data() });
  for (const d of logSnap.docs) add(d.get('familyCode'), 'logs', { id: d.id, ...d.data() });

  let wrote = 0;
  for (const [code, bag] of byFamily) {
    const names = new Set();
    for (const log of bag.logs) {
      if (log.name && (log.type === 'buy' || log.type === 'sell') && !log.backfilled) names.add(log.name);
    }
    let totalPrincipal = 0;
    for (const name of names) {
      const pos = replayInvestmentPosition(bag.logs, name, end);
      const existing = bag.logs.find(l =>
        l.type === 'eod' && l.dayKey === yesterday && l.name === name && l.finalized
      );
      const ep = Math.round(pos.principal);
      if (existing) {
        const sp = Math.round(Number(existing.investedPoints) || 0);
        const ss = Number(existing.shares) || 0;
        if (Math.abs(sp - ep) > 0.5 || Math.abs(ss - pos.shares) > 1e-6) {
          await db.collection('investmentLogs').doc(eodLogDocId(code, name, yesterday)).set({
            familyCode: code,
            name,
            type: 'eod',
            dayKey: yesterday,
            investedPoints: ep,
            shares: pos.shares,
            at: end,
            finalized: true
          }, { merge: true });
          wrote += 1;
        }
        if (ep > 0 || pos.shares > 0) totalPrincipal += ep;
        continue;
      }
      if (!(pos.principal > 0 || pos.shares > 0)) continue;
      await db.collection('investmentLogs').doc(eodLogDocId(code, name, yesterday)).set({
        familyCode: code,
        name,
        type: 'eod',
        dayKey: yesterday,
        investedPoints: ep,
        shares: pos.shares,
        at: end,
        finalized: true
      }, { merge: true });
      totalPrincipal += ep;
      wrote += 1;
    }
    const totalExisting = bag.logs.find(l =>
      l.type === 'eod' && l.dayKey === yesterday && l.name === CHART_TOTAL && l.finalized
    );
    if (totalExisting) {
      const sp = Math.round(Number(totalExisting.investedPoints) || 0);
      if (Math.abs(sp - totalPrincipal) > 0.5 && totalPrincipal > 0) {
        await db.collection('investmentLogs').doc(eodLogDocId(code, CHART_TOTAL, yesterday)).set({
          familyCode: code,
          name: CHART_TOTAL,
          type: 'eod',
          dayKey: yesterday,
          investedPoints: totalPrincipal,
          shares: 0,
          at: end,
          finalized: true
        }, { merge: true });
      }
    } else if (totalPrincipal > 0) {
      await db.collection('investmentLogs').doc(eodLogDocId(code, CHART_TOTAL, yesterday)).set({
        familyCode: code,
        name: CHART_TOTAL,
        type: 'eod',
        dayKey: yesterday,
        investedPoints: totalPrincipal,
        shares: 0,
        at: end,
        finalized: true
      }, { merge: true });
    }
  }
  if (wrote) console.log(`[snapshotInvestmentEod] ${wrote}件 ${yesterday}`);
}

/**
 * 銀行利息（日次累積・前月分を amount へ入金）。旧一括エンジンは削除済み。
 * Client の bankInterest.js と同一アルゴリズム（functions/bankInterest.js）。
 */
const {
  computeBankInterestState,
  bankInterestStateChanged,
  bankInterestWritePayload,
  selfTestBankInterestLogic
} = require('./bankInterest');

try {
  selfTestBankInterestLogic();
} catch (e) {
  console.error('[bankInterest] selfTest failed at load', e?.message || e);
}

async function runApplyBankMonthlyInterest() {
  let snap;
  try {
    snap = await db.collection('banks').get();
  } catch (e) {
    console.warn('[bankInterest]', e?.message || e);
    return;
  }
  if (snap.empty) return;

  let updated = 0;
  for (const d of snap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(d.ref);
        if (!fresh.exists) return;
        const data = fresh.data();
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
        tx.update(d.ref, bankInterestWritePayload(next));
        updated += 1;
      });
    } catch (e) {
      console.warn('[bankInterest]', d.id, e?.message || e);
    }
  }
  if (updated) console.log(`[bankInterest] ${updated}件 updated`);
}

// 0:00ちょうど（日本時間）。アプリを落としていなくても、サーバー側で今日分が出る。
exports.generateRepeatedTasks = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Asia/Tokyo' },
  async () => {
    await runGenerateRepeatedTasks();
    await runSnapshotInvestmentEod();
    await runApplyBankMonthlyInterest();
  }
);

exports.snapshotInvestmentEod = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Asia/Tokyo' },
  runSnapshotInvestmentEod
);

// 取りこぼし防止。0:00に失敗しても、最大15分以内に追いつく。
exports.generateRepeatedTasksCatchup = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Tokyo' },
  async () => {
    await runGenerateRepeatedTasks();
    await runCleanupExpiredTasks();
    await runSnapshotInvestmentEod();
    await runApplyBankMonthlyInterest();
    await runProcessScheduledPayments();
  }
);

/**
 * 期限が近いお仕事を知らせる。1分ごとに動く。
 * 「あと1時間」「あと30分」は、それぞれ残り59〜61分／29〜31分のときだけ送る
 * （10分間隔＋広い枠だと、60分ちょうどを外して50分台で届くことがあった）。
 */
exports.remindDeadlines = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Asia/Tokyo' },
  async () => {
    const now = Date.now();
    const minute = 60 * 1000;
    const slots = [
      { id: '60', label: 'あと1時間', minMin: 59, maxMin: 61, field: 'deadlineRemind60For' },
      { id: '30', label: 'あと30分', minMin: 29, maxMin: 31, field: 'deadlineRemind30For' }
    ];
    const from = now + 29 * minute;
    const to = now + 61 * minute;

    const snap = await db.collection('tasks')
      .where('deadline', '>=', from)
      .where('deadline', '<=', to)
      .get();

    if (snap.empty) return;

    for (const d of snap.docs) {
      const t = d.data();
      if (!['open', 'accepted'].includes(t.status)) continue;
      const remainMin = Math.floor((t.deadline - now) / minute);

      for (const slot of slots) {
        if (remainMin < slot.minMin || remainMin > slot.maxMin) continue;
        if (t[slot.field] === t.deadline) continue;

        await d.ref.update({
          [slot.field]: t.deadline,
          deadlineNotifiedAt: FieldValue.serverTimestamp()
        });
        t[slot.field] = t.deadline;

        await notify(
          t.familyCode, 'all',
          '期限が近づいています',
          `「${t.title}」の期限は${slot.label}です`,
          `deadline-${d.id}-${slot.id}`
        );
      }
    }
  }
);

function dateKeyToValue(key) {
  if (!key) return 0;
  const [y, m, d] = String(key).split('-').map(Number);
  return y * 10000 + m * 100 + d;
}

function shiftJapanDayKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const ms = new Date(`${y}-${pad2(m)}-${pad2(d)}T12:00:00+09:00`).getTime() + (Number(deltaDays) || 0) * 86400000;
  return japanTodayKey(new Date(ms));
}

function paymentCreatedDayKey(p) {
  const at = Number(p?.createdAt) || 0;
  if (!(at > 0)) return null;
  return japanTodayKey(new Date(at));
}

function lastScheduledPaymentDueKey(p, todayStr) {
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

  for (let back = 0; back < 62; back++) {
    const key = shiftJapanDayKey(todayStr, -back);
    if (createdVal != null && dateKeyToValue(key) < createdVal) break;
    const [y, m, d] = key.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (days.some(day => Math.min(day, last) === d)) return key;
  }
  return null;
}

function isPaymentDue(p, todayStr) {
  if (!p || p.status !== 'active') return false;
  if (p.mode === 'once' && p.lastChargedKey) return false;
  const dueKey = lastScheduledPaymentDueKey(p, todayStr);
  if (!dueKey) return false;
  if (p.lastChargedKey && dateKeyToValue(p.lastChargedKey) >= dateKeyToValue(dueKey)) return false;
  const createdKey = paymentCreatedDayKey(p);
  if (createdKey && dateKeyToValue(dueKey) < dateKeyToValue(createdKey)) return false;
  // 定期は期日当日だけ
  if (p.mode !== 'once' && String(dueKey) !== String(todayStr)) return false;
  return true;
}

function lastMonthEarnedPoints(tasks, balloons, now = new Date()) {
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
    const at = t.approvedAt || t.completedAt || t.createdAt;
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

function paymentAmountFor(p, tasks, balloons, now = new Date()) {
  if (!p) return 0;
  if (p.amountKind === 'percentLastMonth') {
    const pct = Math.min(100, Math.max(0, Number(p.percent) || 0));
    if (pct <= 0) return 0;
    return Math.floor(lastMonthEarnedPoints(tasks, balloons, now) * pct / 100);
  }
  return Math.max(0, Number(p.amount) || 0);
}

/** アプリが閉じていても、期日の支払いを口座から落とす */
async function runProcessScheduledPayments() {
  const todayStr = japanTodayKey();
  const now = new Date();
  const snap = await db.collection('scheduledPayments').where('status', '==', 'active').get();
  if (snap.empty) return;

  // ％計算用に、対象家族の tasks / balloons をまとめて読む
  const familyCodes = [...new Set(snap.docs.map(d => d.data().familyCode).filter(Boolean))];
  const earnedByFamily = new Map();
  for (const code of familyCodes) {
    const [tasksSnap, balloonsSnap] = await Promise.all([
      db.collection('tasks').where('familyCode', '==', code).where('status', '==', 'approved').get(),
      db.collection('balloons').where('familyCode', '==', code).where('status', '==', 'received').get()
    ]);
    earnedByFamily.set(code, {
      tasks: tasksSnap.docs.map(d => d.data()),
      balloons: balloonsSnap.docs.map(d => d.data())
    });
  }

  let charged = 0;
  for (const payDoc of snap.docs) {
    const p = { id: payDoc.id, ...payDoc.data() };
    if (!isPaymentDue(p, todayStr)) continue;
    const dueKey = lastScheduledPaymentDueKey(p, todayStr) || todayStr;
    const familyCode = p.familyCode;
    if (!familyCode) continue;

    const earned = earnedByFamily.get(familyCode) || { tasks: [], balloons: [] };
    const amount = paymentAmountFor(p, earned.tasks, earned.balloons, now);

    if (amount <= 0) {
      const updates = { lastChargedKey: dueKey };
      if (p.mode === 'once') updates.status = 'done';
      else if (p.countMode === 'finite') {
        const left = Math.max(0, (p.remainingCount ?? 1) - 1);
        updates.remainingCount = left;
        if (left <= 0) updates.status = 'done';
      }
      await payDoc.ref.update(updates);
      continue;
    }

    const chargeRef = db.collection('paymentLogs').doc(`${p.id}_${dueKey}`);
    const famRef = db.collection('families').doc(familyCode);

    try {
      let didCharge = false;
      await db.runTransaction(async (tx) => {
        didCharge = false;
        const chargeSnap = await tx.get(chargeRef);
        const famSnap = await tx.get(famRef);
        const paySnap = await tx.get(payDoc.ref);
        if (!paySnap.exists) return;
        const payData = paySnap.data();
        if (payData.status !== 'active') return;

        if (chargeSnap.exists) {
          if (!(payData.lastChargedKey && dateKeyToValue(payData.lastChargedKey) >= dateKeyToValue(dueKey))) {
            const sync = { lastChargedKey: dueKey };
            if (payData.mode === 'once') sync.status = 'done';
            tx.update(payDoc.ref, sync);
          }
          return;
        }

        if (!famSnap.exists) return;
        if (payData.lastChargedKey && dateKeyToValue(payData.lastChargedKey) >= dateKeyToValue(dueKey)) return;

        const pts = Number(famSnap.data().points) || 0;
        const nextPts = pts - amount;
        const wentNegative = nextPts < 0;

        const chargeRow = {
          familyCode,
          paymentId: p.id,
          title: payData.title || p.title || '支払い',
          amount,
          points: amount,
          chargedAt: Date.now(),
          createdAt: Date.now(),
          chargeKey: dueKey
        };
        if (wentNegative) chargeRow.wentNegative = true;
        tx.set(chargeRef, chargeRow);
        tx.update(famRef, { points: nextPts });

        const updates = { lastChargedKey: dueKey };
        if (payData.mode === 'once') updates.status = 'done';
        else if (payData.countMode === 'finite') {
          const left = Math.max(0, (payData.remainingCount ?? 1) - 1);
          updates.remainingCount = left;
          if (left <= 0) updates.status = 'done';
        }
        tx.update(payDoc.ref, updates);
        didCharge = true;
      });
      if (didCharge) charged += 1;
    } catch (err) {
      console.error('[processScheduledPayments]', p.id, err);
    }
  }
  if (charged) console.log(`[processScheduledPayments] ${charged}件 ${todayStr}`);
}

exports.processScheduledPayments = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Tokyo' },
  runProcessScheduledPayments
);

/**
 * 第1段階: Resend 疎通確認用。ログイン済みユーザーのみ。
 * Auth 本番フローには未接続。API キーはレスポンスに含めない。
 *
 * 呼び出し例（data）: { to: 'you@example.com' }
 * 任意: subject, text
 */
exports.sendTestEmail = onCall(
  {
    region: 'asia-northeast1',
    secrets: [resendApiKey]
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const to = String(request.data?.to || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new HttpsError('invalid-argument', '有効な送信先メールアドレス (to) を指定してください');
    }

    const subject = String(request.data?.subject || 'イエノミクス テストメール').trim()
      || 'イエノミクス テストメール';
    const text = String(request.data?.text || '').trim()
      || [
        'これは Firebase Cloud Functions → Resend の疎通確認メールです。',
        '',
        `送信元: noreply@ienomics.com`,
        `呼び出し UID: ${request.auth.uid}`,
        `時刻: ${new Date().toISOString()}`
      ].join('\n');

    const resend = new Resend(resendApiKey.value());
    const { data, error } = await resend.emails.send({
      from: 'イエノミクス <noreply@ienomics.com>',
      to: [to],
      subject,
      text
    });

    if (error) {
      console.error('[sendTestEmail] Resend error', {
        uid: request.auth.uid,
        to,
        message: error.message || error
      });
      throw new HttpsError('internal', 'メール送信に失敗しました');
    }

    console.log('[sendTestEmail] sent', { uid: request.auth.uid, to, id: data?.id || null });
    return { ok: true, id: data?.id || null };
  }
);

/* ===== 認証メール（Resend）第2段階: Functions のみ。Client 未接続 ===== */

function normalizeAuthEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidAuthEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskAuthEmail(email) {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return (local.length <= 2 ? `${local[0] || ''}***` : `${local.slice(0, 2)}***`) + domain;
}

/** Firestore ドキュメント ID 用。生メールは使わない */
function authEmailRateLimitDocId(normalizedEmail) {
  return crypto.createHash('sha256').update(normalizedEmail).digest('hex');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 同一メール 10分に1回（読み取りのみ。消費は recordAuthEmailRateLimit）。
 * 将来 IP 等を足せるよう opts を受け取れる形。
 */
async function checkAuthEmailRateLimit(normalizedEmail, _opts = {}) {
  const ref = db.collection(AUTH_EMAIL_RATE_COLLECTION).doc(authEmailRateLimitDocId(normalizedEmail));
  const snap = await ref.get();
  const lastSentAt = Number(snap.exists ? snap.get('lastSentAt') : 0) || 0;
  const now = Date.now();
  if (lastSentAt && now - lastSentAt < AUTH_EMAIL_RATE_LIMIT_MS) {
    const retryMin = Math.ceil((AUTH_EMAIL_RATE_LIMIT_MS - (now - lastSentAt)) / 60000);
    throw new HttpsError(
      'resource-exhausted',
      `送信回数の上限に達しました。約${retryMin}分後に再度お試しください。`
    );
  }
}

/**
 * Resend 送信成功後のみ呼ぶ。枠を消費する。
 * 並行送信の取りこぼし防止のため、書き込み時にも再チェックする。
 */
async function recordAuthEmailRateLimit(normalizedEmail, opts = {}) {
  const ref = db.collection(AUTH_EMAIL_RATE_COLLECTION).doc(authEmailRateLimitDocId(normalizedEmail));
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastSentAt = Number(snap.exists ? snap.get('lastSentAt') : 0) || 0;
    if (lastSentAt && now - lastSentAt < AUTH_EMAIL_RATE_LIMIT_MS) {
      const retryMin = Math.ceil((AUTH_EMAIL_RATE_LIMIT_MS - (now - lastSentAt)) / 60000);
      throw new HttpsError(
        'resource-exhausted',
        `送信回数の上限に達しました。約${retryMin}分後に再度お試しください。`
      );
    }
    tx.set(ref, {
      lastSentAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      kind: opts.kind || null
    }, { merge: true });
  });
}

async function sendResendAuthEmail({ to, subject, text, html, logTag }) {
  const resend = new Resend(resendApiKey.value());
  const { data, error } = await resend.emails.send({
    from: AUTH_EMAIL_FROM,
    to: [to],
    subject,
    text,
    html
  });
  if (error) {
    console.error(`[${logTag}] Resend error`, {
      to: maskAuthEmail(to),
      message: error.message || error
    });
    throw new HttpsError('internal', 'メール送信に失敗しました');
  }
  return data?.id || null;
}

function buildSignInEmailContent(link) {
  const subject = '【イエノミクス】メールアドレスの確認';
  const text = [
    'イエノミクスのメールアドレス確認です。',
    '',
    '以下のリンクを開いて登録を続けてください。',
    link,
    '',
    'このメールに心当たりがない場合は、無視してください。'
  ].join('\n');
  const safe = escapeHtml(link);
  const html = [
    '<p>イエノミクスのメールアドレス確認です。</p>',
    '<p>以下のボタン（またはリンク）を開いて登録を続けてください。</p>',
    `<p><a href="${safe}">メールアドレスを確認する</a></p>`,
    `<p style="word-break:break-all;font-size:12px;color:#666">${safe}</p>`,
    '<p>このメールに心当たりがない場合は、無視してください。</p>'
  ].join('');
  return { subject, text, html };
}

function buildPasswordResetEmailContent(link) {
  const subject = '【イエノミクス】パスワード再設定';
  const text = [
    'イエノミクスのパスワード再設定です。',
    '',
    '以下のリンクを開いて、新しいパスワードを設定してください。',
    link,
    '',
    'このメールに心当たりがない場合は、無視してください。'
  ].join('\n');
  const safe = escapeHtml(link);
  const html = [
    '<p>イエノミクスのパスワード再設定です。</p>',
    '<p>以下のボタン（またはリンク）を開いて、新しいパスワードを設定してください。</p>',
    `<p><a href="${safe}">パスワードを再設定する</a></p>`,
    `<p style="word-break:break-all;font-size:12px;color:#666">${safe}</p>`,
    '<p>このメールに心当たりがない場合は、無視してください。</p>'
  ].join('');
  return { subject, text, html };
}

/**
 * 新規登録用サインインリンクを Resend で送信（未ログイン可）。
 * data: { email }
 * レスポンスにリンクは含めない。
 */
exports.sendSignInEmail = onCall(
  {
    region: 'asia-northeast1',
    secrets: [resendApiKey]
  },
  async (request) => {
    const email = normalizeAuthEmail(request.data?.email);
    if (!email || !isValidAuthEmail(email)) {
      throw new HttpsError('invalid-argument', '有効なメールアドレスを入力してください');
    }

    await checkAuthEmailRateLimit(email, { kind: 'signIn' });

    try {
      await adminAuth.getUserByEmail(email);
      throw new HttpsError('already-exists', 'このメールアドレスはすでに登録されています', {
        authCode: 'auth/email-already-in-use'
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e?.code !== 'auth/user-not-found') {
        console.error('[sendSignInEmail] getUserByEmail', e?.code || e?.message || e);
        throw new HttpsError('internal', 'メール送信に失敗しました');
      }
    }

    let link;
    try {
      link = await adminAuth.generateSignInWithEmailLink(email, AUTH_ACTION_CODE_SETTINGS);
    } catch (e) {
      console.error('[sendSignInEmail] generateSignInWithEmailLink', e?.code || e?.message || e);
      throw new HttpsError('internal', 'メール送信に失敗しました');
    }

    const { subject, text, html } = buildSignInEmailContent(link);
    const id = await sendResendAuthEmail({
      to: email,
      subject,
      text,
      html,
      logTag: 'sendSignInEmail'
    });

    await recordAuthEmailRateLimit(email, { kind: 'signIn' });
    console.log('[sendSignInEmail] sent', { to: maskAuthEmail(email), id });
    return { ok: true };
  }
);

/**
 * パスワード再設定リンクを Resend で送信（未ログイン可）。
 * data: { email }
 * 存在しないメールは not-found（auth/user-not-found 相当）。
 * レスポンスにリンクは含めない。
 */
exports.sendPasswordResetEmail = onCall(
  {
    region: 'asia-northeast1',
    secrets: [resendApiKey]
  },
  async (request) => {
    const email = normalizeAuthEmail(request.data?.email);
    if (!email || !isValidAuthEmail(email)) {
      throw new HttpsError('invalid-argument', '有効なメールアドレスを入力してください');
    }

    await checkAuthEmailRateLimit(email, { kind: 'passwordReset' });

    try {
      await adminAuth.getUserByEmail(email);
    } catch (e) {
      if (e?.code === 'auth/user-not-found') {
        throw new HttpsError('not-found', 'このメールアドレスのアカウントが見つかりません', {
          authCode: 'auth/user-not-found'
        });
      }
      console.error('[sendPasswordResetEmail] getUserByEmail', e?.code || e?.message || e);
      throw new HttpsError('internal', 'メール送信に失敗しました');
    }

    let link;
    try {
      link = await adminAuth.generatePasswordResetLink(email, AUTH_ACTION_CODE_SETTINGS);
    } catch (e) {
      console.error('[sendPasswordResetEmail] generatePasswordResetLink', e?.code || e?.message || e);
      throw new HttpsError('internal', 'メール送信に失敗しました');
    }

    const { subject, text, html } = buildPasswordResetEmailContent(link);
    const id = await sendResendAuthEmail({
      to: email,
      subject,
      text,
      html,
      logTag: 'sendPasswordResetEmail'
    });

    await recordAuthEmailRateLimit(email, { kind: 'passwordReset' });
    console.log('[sendPasswordResetEmail] sent', { to: maskAuthEmail(email), id });
    return { ok: true };
  }
);

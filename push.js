// スマホを閉じていても通知が届くようにするための仕組み（Firebase Cloud Messaging）。
//
// これまでの new Notification() は、ページが開いている間しか生きていなかった。
// FCM はブラウザの裏で動くサービスワーカーが受け取るので、アプリを閉じていても
// 通知センターに表示される。
//
// ★ 設定に必要なもの: 下の VAPID_KEY。
//    Firebaseコンソール → プロジェクトの設定 → Cloud Messaging
//    → 「ウェブプッシュ証明書」→ 鍵ペアを生成 → 表示された文字列を貼る。
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { firebaseApp, db, auth } from './firebase.js?v=264';
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const VAPID_KEY = 'BOhb3tbhUOgpwnVP6EHVoX3jKSkAsMMkjrbr4aD_Fi3gpAJiWBcXF0SN_6w9yLGTrNwqMaih1yzWnH8bmg3khaA';

let messaging = null;
let fcmActive = false;
let currentTokenDocId = null;
let lastError = null;

/** 通知を有効にできなかったときの理由。設定画面の案内に出す。 */
export function getPushError() {
  return lastError;
}

/**
 * 以前の版が別スコープに登録していた通知専用サービスワーカーを片付ける。
 * 残っていると、どちらが通知を受け取るのか不定になる。
 */
async function removeOldPushWorker() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter(r => r.scope.includes('firebase-cloud-messaging-push-scope'))
        .map(r => r.unregister())
    );
  } catch (e) {
    // 片付けに失敗しても本筋は続ける
  }
}

/** この端末を見分けるためのID。同じアカウントを複数端末で使っても通知が届くようにする。 */
function getDeviceId() {
  let id = localStorage.getItem('ienomics_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('ienomics_device_id', id);
  }
  return id;
}

/** FCM が使える環境かどうか。iOS はホーム画面に追加していないと使えない。 */
export async function isPushSupported() {
  if (!('serviceWorker' in navigator)) return false;
  if (!('Notification' in window)) return false;
  if (!('PushManager' in window)) return false;
  try {
    return await isSupported();
  } catch (e) {
    return false;
  }
}

/** サーバーからの通知が有効になっているか。旧方式に切り替えるかの判断に使う。 */
export function isPushActive() {
  return fcmActive;
}

/** 通知の許可を求める。iOS ではボタンのタップから呼ばないと必ず失敗する。 */
export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return 'denied';
  }
}

/**
 * 通知の受け取りを開始する。
 * 許可済みでなければ何もしない（勝手に許可ダイアログを出さない）。
 * @returns {Promise<boolean>} サーバー通知が使えるようになったか
 */
export async function initPush({ familyCode, role }) {
  lastError = null;
  if (!familyCode || !role) {
    lastError = '家族の情報が読み込まれていません';
    return false;
  }
  if (!(await isPushSupported())) {
    lastError = 'この開き方では通知が使えません（ホーム画面に追加したアイコンから開いてください）';
    return false;
  }
  if (Notification.permission !== 'granted') {
    lastError = '通知が許可されていません';
    return false;
  }
  if (!VAPID_KEY || VAPID_KEY.startsWith('ここに')) {
    lastError = 'ウェブプッシュ証明書の鍵が未設定です';
    return false;
  }

  try {
    if (!messaging) messaging = getMessaging(firebaseApp);

    await removeOldPushWorker();

    // 画面を受け持っている sw.js に通知を受け取らせる。
    // 別スコープの専用ワーカーだと、アプリを終了させたときに届かないことがある。
    await navigator.serviceWorker.register('sw.js');
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) {
      lastError = '通知の宛先（トークン）を取得できませんでした';
      return false;
    }

    currentTokenDocId = getDeviceId();
    await setDoc(doc(db, 'pushTokens', currentTokenDocId), {
      token,
      familyCode,
      role,
      uid: auth.currentUser?.uid || null,
      platform: navigator.userAgent.slice(0, 180),
      updatedAt: Date.now()
    });

    // アプリを開いている間に届いた分は、自分で表示する
    onMessage(messaging, (payload) => {
      const n = payload?.notification;
      if (!n) return;
      registration.showNotification(n.title || 'イエノミクス', {
        body: n.body || '',
        icon: 'logo.png',
        badge: 'logo.png',
        tag: payload?.data?.tag || undefined
      });
    });

    fcmActive = true;
    return true;
  } catch (error) {
    console.warn('[push] 通知の準備に失敗:', error);
    lastError = error?.code || error?.message || String(error);
    fcmActive = false;
    return false;
  }
}

/** 連携解除時に、この端末宛の通知を止める */
export async function unregisterPush() {
  fcmActive = false;
  const id = currentTokenDocId || localStorage.getItem('ienomics_device_id');
  if (!id) return;
  try {
    await deleteDoc(doc(db, 'pushTokens', id));
  } catch (e) {
    console.warn('[push] トークンの削除に失敗:', e);
  }
}

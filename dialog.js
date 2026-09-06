// 標準の alert / confirm / prompt を、アプリの見た目に合わせたダイアログに置き換える。
// render() が #app を作り直しても消えないよう、専用のルート要素に描画する。
import { esc } from './utils.js?v=266';

let dialogRoot = null;
let busyRoot = null;
let toastRoot = null;
let busyCount = 0;
let closeActive = null;
let lastFocused = null;

function ensureRoot(id, className) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    if (className) el.className = className;
    document.body.appendChild(el);
  }
  return el;
}

function onKeyDown(e) {
  if (!closeActive) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeActive(null);
  } else if (e.key === 'Enter' && e.target?.tagName !== 'TEXTAREA') {
    const ok = dialogRoot?.querySelector('[data-dialog-ok]');
    if (ok) {
      e.preventDefault();
      ok.click();
    }
  }
}

/**
 * @param {object} opts
 * @param {'alert'|'confirm'|'prompt'} opts.type
 * @returns {Promise<boolean|string|null>} alert:true / confirm:真偽 / prompt:文字列かnull
 */
function openDialog(opts) {
  const {
    type = 'alert',
    title = '',
    message = '',
    okLabel,
    cancelLabel = 'キャンセル',
    placeholder = '',
    defaultValue = '',
    tone = 'normal'
  } = opts;

  // 前のダイアログが開いたままなら閉じる
  if (closeActive) closeActive(null);

  dialogRoot = ensureRoot('ie-dialog-root');
  lastFocused = document.activeElement;

  const okText = okLabel || (type === 'alert' ? 'OK' : 'はい');
  const bodyLines = String(message ?? '')
    .split('\n')
    .map(line => (line ? `<p class="ie-dialog-line">${esc(line)}</p>` : '<p class="ie-dialog-gap"></p>'))
    .join('');

  dialogRoot.innerHTML = `
    <div class="ie-dialog-backdrop" data-dialog-backdrop>
      <div class="ie-dialog-panel ie-dialog-${esc(tone)}" role="${type === 'alert' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-label="${esc(title || message)}">
        ${title ? `<h2 class="ie-dialog-title">${esc(title)}</h2>` : ''}
        <div class="ie-dialog-body">${bodyLines}</div>
        ${type === 'prompt' ? `
          <input type="text" class="ie-dialog-input" data-dialog-input
                 placeholder="${esc(placeholder)}" value="${esc(defaultValue)}" />
        ` : ''}
        <div class="ie-dialog-actions">
          ${type === 'alert' ? '' : `<button type="button" class="ie-dialog-btn ie-dialog-cancel" data-dialog-cancel>${esc(cancelLabel)}</button>`}
          <button type="button" class="ie-dialog-btn ie-dialog-ok" data-dialog-ok>${esc(okText)}</button>
        </div>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeActive = null;
      document.removeEventListener('keydown', onKeyDown, true);
      dialogRoot.innerHTML = '';
      if (lastFocused && document.body.contains(lastFocused)) {
        try { lastFocused.focus({ preventScroll: true }); } catch (e) {}
      }
      resolve(value);
    };

    // Escape / 背景タップ時の既定値
    closeActive = () => finish(type === 'confirm' ? false : (type === 'prompt' ? null : true));

    const input = dialogRoot.querySelector('[data-dialog-input]');
    dialogRoot.querySelector('[data-dialog-ok]').addEventListener('click', () => {
      if (type === 'prompt') finish(input ? input.value : '');
      else if (type === 'confirm') finish(true);
      else finish(true);
    });
    dialogRoot.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => {
      finish(type === 'prompt' ? null : false);
    });
    dialogRoot.querySelector('[data-dialog-backdrop]').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeActive();
    });

    document.addEventListener('keydown', onKeyDown, true);
    setTimeout(() => {
      if (input) input.select();
      else dialogRoot.querySelector('[data-dialog-ok]')?.focus({ preventScroll: true });
    }, 30);
  });
}

export function showAlert(message, opts = {}) {
  return openDialog({ ...opts, type: 'alert', message });
}

export function showConfirm(message, opts = {}) {
  return openDialog({ ...opts, type: 'confirm', message });
}

export function showPrompt(message, opts = {}) {
  return openDialog({ ...opts, type: 'prompt', message });
}

/**
 * 親の新規登録完了後：同期ID・説明画像・共有ボタン付き。
 * @param {string} code 同期ID
 */
export function showParentSetupComplete(code) {
  const syncCode = String(code || '').trim();
  if (!syncCode) return showAlert('同期IDを表示できませんでした', { title: '設定が完了しました' });

  if (closeActive) closeActive(null);
  dialogRoot = ensureRoot('ie-dialog-root');
  lastFocused = document.activeElement;

  const imgSrc = encodeURI('説明.png');
  dialogRoot.innerHTML = `
    <div class="ie-dialog-backdrop" data-dialog-backdrop>
      <div class="ie-dialog-panel ie-dialog-scroll" role="alertdialog" aria-modal="true" aria-label="設定が完了しました">
        <h2 class="ie-dialog-title">設定が完了しました</h2>
        <div class="ie-dialog-body">
          <p class="ie-dialog-line">お子さまの端末と連携するための同期IDです。</p>
          <p class="ie-dialog-code" aria-label="同期ID">${esc(syncCode)}</p>
          <p class="ie-dialog-line ie-dialog-guide-lead">お子さまの端末では、下の画面の場所から同期IDを入力します。</p>
          <img class="ie-dialog-guide-img" src="${esc(imgSrc)}" alt="子供の端末で同期IDを入力する場所の説明" />
          <p class="ie-dialog-line ie-dialog-guide-note">「子供として開始」→ この同期IDを入力してください。</p>
        </div>
        <div class="ie-dialog-actions ie-dialog-actions-stack">
          <button type="button" class="ie-dialog-btn ie-dialog-secondary" data-dialog-share>子供に同期IDを送る</button>
          <button type="button" class="ie-dialog-btn ie-dialog-ok" data-dialog-ok>OK</button>
        </div>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeActive = null;
      document.removeEventListener('keydown', onKeyDown, true);
      dialogRoot.innerHTML = '';
      if (lastFocused && document.body.contains(lastFocused)) {
        try { lastFocused.focus({ preventScroll: true }); } catch (e) {}
      }
      resolve(value);
    };

    closeActive = () => finish(true);

    const shareText = [
      'イエノミクスで親子連携しよう！',
      '',
      `同期ID：${syncCode}`,
      '',
      'お子さまの端末でイエノミクスを開いて、',
      '同期IDを入力してください。',
      '',
      '▼ イエノミクス',
      'https://whinaotona-debug.github.io/ienomics/index.html'
    ].join('\n');

    dialogRoot.querySelector('[data-dialog-share]')?.addEventListener('click', async () => {
      try {
        if (typeof navigator.share === 'function') {
          await navigator.share({
            title: 'イエノミクスの同期ID',
            text: shareText
          });
          return;
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = shareText;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        showToast('連携用の文面をコピーしました');
      } catch (e) {
        showToast('コピーできませんでした');
      }
    });

    dialogRoot.querySelector('[data-dialog-ok]')?.addEventListener('click', () => finish(true));
    dialogRoot.querySelector('[data-dialog-backdrop]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) finish(true);
    });
    document.addEventListener('keydown', onKeyDown, true);
    setTimeout(() => {
      dialogRoot.querySelector('[data-dialog-ok]')?.focus({ preventScroll: true });
    }, 30);
  });
}

/** 画面下に数秒だけ出る軽い通知。成功メッセージ向け。 */
export function showToast(message, tone = 'ok') {
  toastRoot = ensureRoot('ie-toast-root');
  const el = document.createElement('div');
  el.className = `ie-toast ie-toast-${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = String(message ?? '');
  toastRoot.appendChild(el);
  setTimeout(() => el.classList.add('ie-toast-out'), 2200);
  setTimeout(() => el.remove(), 2600);
}

/** 通信中の全画面ローディング。ネストしても正しく消えるよう参照カウントで管理。 */
export function setBusy(on, label = '通信中...') {
  busyRoot = ensureRoot('ie-busy-root');
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  if (busyCount > 0) {
    if (!busyRoot.firstChild) {
      busyRoot.innerHTML = `
        <div class="ie-busy-backdrop" role="status" aria-live="polite">
          <div class="ie-busy-card">
            <div class="ie-busy-spinner"></div>
            <p class="ie-busy-label">${esc(label)}</p>
          </div>
        </div>
      `;
    }
  } else {
    busyRoot.innerHTML = '';
  }
}

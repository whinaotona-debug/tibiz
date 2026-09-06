import { state } from './state.js?v=266';
import { getIcon, rb, rbPair, esc, jobTitleHtml, formatTimeLeft, getCurrentMarketRates, getTemplateIdFromTask, formatRepeatLabel, formatPaymentSchedule, formatPaymentAmountLabel, scheduledPaymentAmount, getUpcomingPayments, getHelpStampData, groupPointActivityByDay, formatJapanClock, japanParts, japanDeadlineMs, japanDayStartMs, MARKET_ORDER, MARKET_META, CHART_TOTAL, getInvestmentPortfolioValue, getInvestmentValues, getTradeableMarkets, getMarketSheetInfo, getPortfolioHistory, getHeldMarketNames, getActiveInvestments, shouldSweepExpiredTask, getMarketFlashLine, getMarketMovePct, getNewsWhatHappened, bankTotalBalance, bankTotalInterest, bankDepositPrincipal, getLineInstallGateKind, getSetupBrowserPromptKind, markInstallPromptDoneIfStandalone } from './utils.js?v=266';
import { refreshTutorial } from './tutorial.js?v=266';
import { auth } from './firebase.js?v=266';
import { isSignInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const appDiv = document.getElementById('app');
const bottomNav = document.getElementById('bottom-nav');
let investChartInstance = null;
let lastInvestChartKey = '';

/** ヘッダーptのスロット風カウント用 */
let displayedPoints = null;
let pointsAnimFamily = null;
let pointsAnimRaf = null;
let pointsAnimToken = 0;
let pointsAnim = null; // { from, to, start }
const POINTS_ANIM_MS = 1000;

function syncPointsColor(el, value) {
  if (!el) return;
  const neg = value < 0;
  el.classList.toggle('text-red-300', neg);
  el.classList.toggle('text-white', !neg);
  const unit = document.getElementById('ie-points-unit');
  if (unit) {
    unit.classList.toggle('text-red-300/80', neg);
    unit.classList.toggle('text-white/60', !neg);
  }
}

function stopPointsAnimClasses(el) {
  if (!el) return;
  el.classList.remove('ie-points-spin', 'ie-points-up', 'ie-points-down');
}

function animatePointsDisplay() {
  const el = document.getElementById('ie-points-value');
  if (!el) return;

  const target = Number(state.points) || 0;
  const family = state.familyCode;

  // 初回 or 子供切替は即反映
  if (displayedPoints === null || pointsAnimFamily !== family) {
    if (pointsAnimRaf) cancelAnimationFrame(pointsAnimRaf);
    pointsAnimToken++;
    pointsAnim = null;
    displayedPoints = target;
    pointsAnimFamily = family;
    el.textContent = target.toLocaleString();
    syncPointsColor(el, target);
    stopPointsAnimClasses(el);
    return;
  }

  if (displayedPoints === target && !pointsAnim) {
    el.textContent = target.toLocaleString();
    syncPointsColor(el, target);
    stopPointsAnimClasses(el);
    return;
  }

  // 目標が変わったときだけアニメ開始（再描画では進行を維持）
  if (!pointsAnim || pointsAnim.to !== target) {
    pointsAnim = {
      from: displayedPoints,
      to: target,
      start: performance.now()
    };
  }

  const rising = pointsAnim.to > pointsAnim.from;
  el.classList.add('ie-points-spin', rising ? 'ie-points-up' : 'ie-points-down');
  el.classList.toggle('ie-points-up', rising);
  el.classList.toggle('ie-points-down', !rising);

  const token = ++pointsAnimToken;
  if (pointsAnimRaf) cancelAnimationFrame(pointsAnimRaf);

  const tick = (now) => {
    if (token !== pointsAnimToken || !pointsAnim) return;
    const { from, to, start } = pointsAnim;
    const t = Math.min(1, (now - start) / POINTS_ANIM_MS);
    // 序盤じゃかじゃか → 終盤で落ち着く
    const eased = t < 0.7
      ? (t / 0.7) * 0.85
      : 0.85 + (1 - Math.pow(1 - (t - 0.7) / 0.3, 2)) * 0.15;
    let current = Math.round(from + (to - from) * eased);
    if (t < 0.92 && Math.abs(to - from) > 3) {
      const jitter = Math.round((Math.random() - 0.5) * Math.min(9, Math.abs(to - from) * 0.04));
      current += jitter;
    }
    displayedPoints = current;
    const node = document.getElementById('ie-points-value');
    if (!node) {
      pointsAnimRaf = requestAnimationFrame(tick);
      return;
    }
    node.textContent = current.toLocaleString();
    syncPointsColor(node, current);

    if (t < 1) {
      pointsAnimRaf = requestAnimationFrame(tick);
    } else {
      displayedPoints = to;
      node.textContent = to.toLocaleString();
      syncPointsColor(node, to);
      stopPointsAnimClasses(node);
      pointsAnim = null;
      pointsAnimRaf = null;
    }
  };
  pointsAnimRaf = requestAnimationFrame(tick);
}

window.togglePassword = (inputId, eyeIconId) => {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(eyeIconId);
  if (input.type === 'password') { input.type = 'text'; icon.innerHTML = getIcon('eye-off'); }
  else { input.type = 'password'; icon.innerHTML = getIcon('eye'); }
};

function bootDebugLog(msg, detail) {
  if (typeof window.__ieBootPerfLog === 'function') {
    window.__ieBootPerfLog(msg, detail);
    return;
  }
  if (detail !== undefined) console.log(`[boot-debug] ${msg}`, detail);
  else console.log(`[boot-debug] ${msg}`);
}

function renderInstallGate(kind) {
  if (kind === 'line') {
    return `<div class="ie-install-gate fade-in">
      <div class="ie-install-gate-card">
        <div class="ie-install-gate-logo" aria-hidden="true">${getIcon('home')}</div>
        <h1 class="ie-install-gate-title">${rb('ブラウザで開いてください','ぶらうざでひらいてください')}</h1>
        <p class="ie-install-gate-lead">イエノミクスを使うには、まず通常のブラウザで開く必要があります。</p>
        <div class="ie-line-menu-demo" aria-hidden="true">
          <div class="ie-line-menu-phone">
            <span class="ie-line-menu-hint">右下</span>
            <span class="ie-line-menu-btn" title="メニュー">
              <span></span><span></span><span></span>
            </span>
          </div>
        </div>
        <div class="ie-install-gate-step">
          <p class="ie-install-gate-step-label">手順</p>
          <p class="ie-install-gate-step-text">画面<strong>右下</strong>の<strong>縦に3つ並んだ点</strong>（⋮）を押して、「<strong>ブラウザで開く</strong>」を選んでください</p>
        </div>
      </div>
    </div>`;
  }
  const stepText = '画面下の<strong>共有</strong>ボタンを押して、少しスクロールすると出てくる「<strong>ホーム画面に追加</strong>」を押してください。<br>そのあと、右上の<strong>青い「追加」</strong>ボタンを押してください。';
  return `<div class="ie-install-gate fade-in">
    <div class="ie-install-gate-card">
      <div class="ie-install-gate-logo" aria-hidden="true">${getIcon('home')}</div>
      <h1 class="ie-install-gate-title">${rb('ホーム画面に追加してください','ほーむがめんについかしてください')}</h1>
      <p class="ie-install-gate-lead">ブラウザのままでは通知などが使えません。ホーム画面に追加してから使いましょう。</p>
      <div class="ie-install-gate-step">
        <p class="ie-install-gate-step-label">手順</p>
        <p class="ie-install-gate-step-text">${stepText}</p>
      </div>
      <p class="ie-install-gate-note">追加したら、<strong>ホーム画面のアイコン</strong>から開き直してください。</p>
      <button type="button" onclick="installGateContinue()" class="solid-btn primary-btn w-full py-4 font-bold text-sm mt-4">追加して続行</button>
    </div>
  </div>`;
}

export function render() {
  bootDebugLog('render start', { role: state.role, familyCode: state.familyCode, view: state.view });
  try {
  const markReady = (reason) => {
    bootDebugLog('markBootReady', { reason });
    if (typeof window.__ieMarkBootReady === 'function') window.__ieMarkBootReady(reason);
  };
  const lineGate = getLineInstallGateKind();
  if (lineGate || window.__ieInstallGateLine) {
    bottomNav.classList.add('hidden');
    if (lineGate) appDiv.innerHTML = renderInstallGate(lineGate);
    bootDebugLog('render branch', { branch: 'install-gate', kind: lineGate || 'line-inline' });
    markReady('install-gate');
    bootDebugLog('render done');
    return;
  }
  if (state.resetPasswordCode || state.setupMode === 'password_reset_form') {
    bottomNav.classList.add('hidden');
    appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderPasswordResetForm()}</div>`;
    bootDebugLog('render branch', { branch: 'password-reset' });
    markReady('password-reset');
    bootDebugLog('render done');
    return;
  }
  if (state.requirePasswordSetup) {
    bottomNav.classList.add('hidden');
    if (state.isSending) {
      appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderSetupLoading(state.setupLoadingMessage || '設定を保存しています...')}</div>`;
      bootDebugLog('render branch', { branch: 'password-setup-loading' });
    } else {
      appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderPasswordSetup()}</div>`;
      bootDebugLog('render branch', { branch: 'password-setup' });
    }
    markReady('password-setup');
    bootDebugLog('render done');
    return;
  }
  if (!state.role || !state.familyCode) {
    bottomNav.classList.add('hidden');
    // メールリンク認証中も「よみこみ中」のままにせず、必ず何か描画する
    if (isSignInWithEmailLink(auth, window.location.href)) {
      appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderSetupLoading('ログインを確認しています...')}</div>`;
      bootDebugLog('render branch', { branch: 'setup-email-link' });
    } else {
      appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderSetup()}</div>`;
      bootDebugLog('render branch', { branch: 'setup', setupPrompt: getSetupBrowserPromptKind() });
    }
    markReady('setup');
    bootDebugLog('render done');
    return;
  }
  if (state.role === 'parent' && !state.childLinked) {
    bottomNav.classList.add('hidden');
    appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${renderWaitingChild()}</div>`;
    bootDebugLog('render branch', { branch: 'waiting-child' });
    markReady('waiting-child');
    bootDebugLog('render done');
    return;
  }

  bottomNav.classList.remove('hidden');
  const rightTab = state.role === 'parent'
    ? `<button type="button" onclick="setView('balloonSend')" data-tour="nav-mid" aria-current="${state.view==='balloonSend'?'page':'false'}" class="nav-tab ${state.view==='balloonSend'?'active':''}">${getIcon('gift')}<span>ギフト</span></button>`
    : `<button type="button" onclick="setView('wish')" data-tour="nav-wish" aria-current="${state.view==='wish'?'page':'false'}" class="nav-tab ${state.view==='wish'?'active':''}">${getIcon('wish')}<span>おねがい</span></button>`;
  bottomNav.innerHTML = `
    <div class="ie-nav-shell" role="tablist" aria-label="メインメニュー">
      ${rightTab}
      <button type="button" onclick="setView('tickets')" data-tour="nav-tickets" aria-current="${state.view==='tickets'?'page':'false'}" class="nav-tab ${state.view==='tickets'?'active':''}">${getIcon('ticket')}<span>チケット</span></button>
      <button type="button" onclick="setView('home')" data-tour="nav-home" aria-current="${state.view==='home'?'page':'false'}" class="nav-tab nav-tab-home ${state.view==='home'?'active':''}" aria-label="ホーム">${getIcon('home')}<span>ホーム</span></button>
      <button type="button" onclick="setView('history')" data-tour="nav-history" aria-current="${state.view==='history'?'page':'false'}" class="nav-tab ${state.view==='history'?'active':''}">${getIcon('history')}<span>${rb('履歴','りれき')}</span></button>
      <button type="button" onclick="setView('settings')" data-tour="nav-settings" aria-current="${state.view==='settings'?'page':'false'}" class="nav-tab ${state.view==='settings'?'active':''}">${getIcon('settings')}<span>${rb('設定','せってい')}</span></button>
    </div>
  `;

  let html = renderHeader();
  switch(state.view) {
    case 'home': html += renderHome(); break;
    default: 
      let content = '';
      if(state.view === 'propose') content = renderPropose();
      else if(state.view === 'taskCreate') content = renderTaskCreate();
      else if(state.view === 'templates') content = renderTemplatesList();
      else if(state.view === 'templateEdit') content = renderTemplateEdit();
      else if(state.view === 'exchange') content = renderExchange();
      else if(state.view === 'invest') content = renderInvest();
      else if(state.view === 'bank') content = renderBank();
      else if(state.view === 'payments') content = renderPayments();
      else if(state.view === 'paymentCreate') content = renderPaymentCreate();
      else if(state.view === 'paymentEdit') content = renderPaymentEdit();
      else if(state.view === 'calendar') content = renderCalendar();
      else if(state.view === 'balloonSend') content = renderBalloonSend();
      else if(state.view === 'tickets') content = renderTickets();
      else if(state.view === 'wish') content = renderWish();
      else if(state.view === 'news') content = renderNews();
      else if(state.view === 'history') content = renderHistory();
      else if(state.view === 'settings') content = renderSettings();
      html += renderModal(content); 
      break;
  }

  appDiv.innerHTML = `<div class="h-full flex flex-col min-h-0 fade-in relative">${html}</div>`;
  bootDebugLog('render branch', { branch: 'app' });
  markReady('app');
  animatePointsDisplay();
  bindSwipeRows(appDiv);
  bindChildPickOutsideClose();
  tickJapanClock();
  if (state.view === 'home' || state.view === 'invest') {
    requestAnimationFrame(() => drawInvestChart());
  }
  // 画面が作り直されたので、ガイドの枠を測り直す
  refreshTutorial();
  bootDebugLog('render done');
  } catch (error) {
    bootDebugLog('render error', { error: String(error?.message || error) });
    throw error;
  }
}

function tickJapanClock() {
  const el = document.getElementById('ie-japan-clock');
  if (el) el.textContent = formatJapanClock();
}

if (typeof window !== 'undefined' && !window.__ieClockStarted) {
  window.__ieClockStarted = true;
  setInterval(tickJapanClock, 15000);
}

/** 子切り替えメニュー：外側をタップしたら閉じる（1回だけ登録） */
function bindChildPickOutsideClose() {
  if (typeof window === 'undefined' || window.__ieChildPickCloseBound) return;
  window.__ieChildPickCloseBound = true;
  const closeOpenPicks = (e) => {
    document.querySelectorAll('details.ie-child-pick[open]').forEach((el) => {
      if (!el.contains(e.target)) el.open = false;
    });
  };
  document.addEventListener('pointerdown', closeOpenPicks, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.ie-child-pick[open]').forEach((el) => { el.open = false; });
  });
}

/**
 * 親の仕事行を左にスワイプすると削除ボタンが出る。
 * render() のたびに DOM が作り直されるので、都度付け直す。
 */
function bindSwipeRows(root) {
  const rows = root.querySelectorAll('.ie-swipe');
  if (!rows.length) return;

  const closeAll = (except) => {
    rows.forEach(row => {
      if (row === except) return;
      const panel = row.querySelector('.ie-swipe-panel');
      if (panel) panel.style.transform = 'translateX(0)';
      row.classList.remove('open');
    });
  };

  rows.forEach(row => {
    const panel = row.querySelector('.ie-swipe-panel');
    if (!panel) return;
    const ACTION_W = 76;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let dragging = false;
    let axis = null; // 'x' | 'y'

    const setX = (x) => {
      currentX = Math.min(0, Math.max(-ACTION_W, x));
      panel.style.transform = `translateX(${currentX}px)`;
    };

    const onStart = (x, y) => {
      startX = x;
      startY = y;
      dragging = true;
      axis = null;
      panel.style.transition = 'none';
      closeAll(row);
    };

    const onMove = (x, y, e) => {
      if (!dragging) return;
      const dx = x - startX;
      const dy = y - startY;
      if (!axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (axis === 'y') {
          dragging = false;
          return;
        }
      }
      if (axis !== 'x') return;
      if (e.cancelable) e.preventDefault();
      const base = row.classList.contains('open') ? -ACTION_W : 0;
      setX(base + dx);
    };

    const onEnd = () => {
      if (!dragging && axis !== 'x') return;
      dragging = false;
      panel.style.transition = 'transform 0.2s ease';
      if (currentX < -ACTION_W * 0.45) {
        setX(-ACTION_W);
        row.classList.add('open');
      } else {
        setX(0);
        row.classList.remove('open');
      }
      axis = null;
    };

    panel.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY, e);
    }, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onEnd);

    // マウスでも試せるように（PC確認用）
    panel.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      onStart(e.clientX, e.clientY);
      const move = (ev) => onMove(ev.clientX, ev.clientY, ev);
      const up = () => {
        onEnd();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

/**
 * お子さまの口座切り替え。同期IDの下に出す。
 * ネイティブselectは端末で白く塗りつぶされるので使わない。
 * ひとりだけのときは切り替える意味がないので何も返さない。
 */
function renderChildSelect(tone = 'hero') {
  if (state.role !== 'parent') return '';
  const list = Array.isArray(state.children) ? state.children : [];
  if (list.length < 2) return '';

  const active = list.find(c => c.id === state.familyCode) || list[0];
  const activeName = active?.childName || 'こども';

  if (tone === 'hero') {
    const items = list.map(c => {
      const wait = c.childLinked === false ? ' · 待ち' : '';
      const on = c.id === state.familyCode ? ' on' : '';
      return `<button type="button" class="ie-child-pick-item${on}" onclick="event.preventDefault(); window.switchActiveChild('${esc(c.id)}')">${esc(c.childName || 'こども')}${wait}</button>`;
    }).join('');
    return `
      <details class="ie-child-pick" data-tour="childtabs">
        <summary class="ie-child-pick-sum">${esc(activeName)}</summary>
        <div class="ie-child-pick-menu" role="listbox">${items}</div>
      </details>
    `;
  }

  const options = list.map(c => {
    const wait = c.childLinked === false ? '（待ち）' : '';
    const on = c.id === state.familyCode;
    return `<option value="${esc(c.id)}" ${on ? 'selected' : ''}>${esc(c.childName || 'こども')}${wait}</option>`;
  }).join('');

  return `
    <label class="ie-child-select ie-child-select-light">
      <span class="ie-child-select-label">こども</span>
      <select class="ie-child-select-input" aria-label="お子さまの切り替え" onclick="event.stopPropagation()" onchange="window.switchActiveChild(this.value)">${options}</select>
    </label>
  `;
}

/**
 * 設定画面のお子さま一覧。切り替えと削除ができる。
 * ひとりだけのときは削除できない（口座がなくなると作り直せなくなる）ので出さない。
 */
function renderChildManageList() {
  const list = Array.isArray(state.children) ? state.children : [];
  if (state.role !== 'parent' || list.length < 2) return '';

  const rows = list.map(c => {
    const active = c.id === state.familyCode;
    const sub = active
      ? 'いま表示中'
      : (c.childLinked === false
        ? 'まだ端末とつながっていません'
        : `${(c.points || 0).toLocaleString()}円${Number(c.stockCap) > 0 ? ` / 運用上限${Number(c.stockCap).toLocaleString()}` : ''}`);
    return `
      <div class="ie-child-row ${active ? 'on' : ''}">
        <button type="button" onclick="window.switchActiveChild('${esc(c.id)}')" class="ie-child-row-main" aria-label="${esc(c.childName)}の画面に切り替える">
          <span class="ie-child-row-name">${esc(c.childName)}</span>
          <span class="ie-child-row-sub">${esc(sub)}</span>
        </button>
        <button type="button" onclick="deleteChild('${esc(c.id)}')" class="ie-child-row-del" aria-label="${esc(c.childName)}を削除する" title="${esc(c.childName)}を削除する">
          <span class="w-4 h-4">${getIcon('trash')}</span>
        </button>
      </div>
    `;
  }).join('');

  return `
    <div class="ie-child-manage mb-4">
      <p class="ie-child-manage-title">お子さまの${rb('一覧','いちらん')}</p>
      ${rows}
      <p class="ie-child-manage-note">ゴミ箱を押すと、その子のお仕事・ポイント・株・履歴がすべて消えます。元には戻せません。</p>
    </div>
  `;
}

function renderHeader() {
  const childSelect = state.role === 'parent' ? renderChildSelect() : '';
  const nameLabel = state.role === 'parent'
    ? `<span class="ie-ruby-pair"><span class="ie-ruby-plain">${esc(state.childName)} の</span>${rb('口座','こうざ')}</span>`
    : `<span class="ie-ruby-pair"><span class="ie-ruby-plain">${esc(state.childName)} の</span>${rb('資産','しさん')}</span>`;

  const upcoming = getUpcomingPayments(state.scheduledPayments, state.tasks, state.balloons, 2);
  const payHint = upcoming.length
    ? upcoming.map(p => {
        const leftTxt = p.daysLeft === 0 ? '本日' : `あと${p.daysLeft}日`;
        return `<p class="text-[10px] font-bold text-[#ffe2b8] mt-1.5 leading-snug" title="${esc(p.title)}">${esc(p.title)} ${leftTxt} · ${esc(p.amountLabel)}</p>`;
      }).join('')
    : '';

  const stamp = getHelpStampData(state.tasks);
  const streakHint = stamp.streak > 0
    ? `<p class="text-[9px] font-bold text-[#b8f0e4] mt-0.5">${stamp.streak}日連続お手伝い中！</p>`
    : '';

  return `
    <div class="flex-none px-3 pt-3 pb-0">
      <div class="ie-topbar" data-tour="topbar">
        <div class="ie-topbar-brand">
          <div class="ie-topbar-logo">
            <img src="logo.png" alt="" onerror="this.style.display='none'" />
          </div>
          <div class="ie-topbar-titles">
            <span class="ie-topbar-name">イエノミクス</span>
            <span class="ie-topbar-clock" id="ie-japan-clock">${esc(formatJapanClock())}</span>
          </div>
        </div>
        <button type="button" onclick="reloadApp()" title="最新版を読み込む" class="ie-topbar-refresh" aria-label="更新">
          <span class="w-4 h-4">${getIcon('refresh')}</span>
        </button>
      </div>
      <div class="ie-hero">
        <div class="ie-hero-top">
          <div class="ie-hero-main">
            <div class="ie-hero-label" data-tour="nametag"><p>${nameLabel}</p></div>
            <div class="ie-hero-balance flex items-baseline gap-1.5" data-tour="points" aria-label="現在の残高 ${state.points} ポイント">
              <span id="ie-points-value" class="ie-points-value text-4xl font-black tracking-tight tabular-nums ${state.points < 0 ? 'text-red-300' : 'text-white'}">${(displayedPoints ?? state.points).toLocaleString()}</span>
              <span id="ie-points-unit" class="text-xs font-bold ${state.points < 0 ? 'text-red-300/90' : 'text-white/75'}">円</span>
            </div>
            ${state.points < 0 ? `<p class="text-[10px] font-bold text-red-200 mt-1">残高不足（株・換金はロック中）</p>` : ''}
            ${payHint}
            ${streakHint}
          </div>
          <div class="ie-hero-divider" aria-hidden="true"></div>
          <div class="ie-hero-aside">
            <button type="button" onclick="copySyncCode()" class="ie-hero-sync" data-tour="synccode" title="タップでコピー" aria-label="同期IDをコピー">
              <div class="ie-hero-label ie-hero-label-right"><p>${rbPair('同期','どうき','ID')}</p></div>
              <p class="ie-hero-code">${esc(state.familyCode)}</p>
            </button>
            <div class="ie-hero-aside-meta">
              <button type="button" onclick="copySyncCode()" class="ie-hero-copyhint" tabindex="-1">タップでコピー</button>
              ${childSelect}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** 相手から届いているお知らせ一覧 */
function buildInboxItems() {
  const items = [];
  if (state.role === 'parent') {
    (state.wishes || []).filter(w => w.status === 'pending').forEach(w => {
      items.push({
        id: `wish-${w.id}`,
        tone: 'warm',
        title: 'こづかいのお願いが届きました',
        body: `${Number(w.points) || 0}円${w.reason ? ` · ${w.reason}` : ''}`,
        action: `setView('wish')`
      });
    });
    (state.exchanges || []).filter(e => e.status === 'pending').forEach(e => {
      items.push({
        id: `ex-${e.id}`,
        tone: 'warm',
        title: '換金申請が届きました',
        body: `${e.yen}円の申請`,
        action: `setView('exchange')`
      });
    });
    (state.tasks || []).filter(t => t.status === 'proposed' && !shouldSweepExpiredTask(t)).forEach(t => {
      items.push({
        id: `prop-${t.id}`,
        tone: 'accent',
        title: '見積りが届きました',
        body: `「${t.title}」希望 ${Number(t.points) || 0}円`,
        action: `setView('home')`
      });
    });
    (state.tasks || []).filter(t => t.status === 'completed').forEach(t => {
      items.push({
        id: `done-${t.id}`,
        tone: 'accent',
        title: 'お仕事完了の報告',
        body: `「${t.title}」の確認・付与待ち`,
        action: null
      });
    });
  } else {
    (state.balloons || []).filter(b => b.status !== 'received').forEach(b => {
      items.push({
        id: `gift-${b.id}`,
        tone: 'gift',
        title: 'ギフトが届きました',
        body: b.message ? `「${b.message}」 +${b.points}円` : `ボーナス ${b.points}円`,
        // メッセージ本文は openBalloon 側で state から読む（属性に文字列を埋め込まない）
        action: `openBalloon('${esc(b.id)}')`
      });
    });
    (state.tasks || []).filter(t => t.status === 'open' && !shouldSweepExpiredTask(t)).forEach(t => {
      items.push({
        id: `open-${t.id}`,
        tone: 'accent',
        title: '新しいお仕事',
        body: `「${t.title}」 ${t.points}円`,
        action: null
      });
    });
    (state.tasks || []).filter(t => t.status === 'proposal_rejected').forEach(t => {
      items.push({
        id: `rej-${t.id}`,
        tone: 'danger',
        title: '見積りが却下されました',
        body: `「${t.title}」`,
        action: null
      });
    });
    (state.tasks || []).filter(t => t.status === 'accepted' && t.statusBefore === 'completed').forEach(t => {
      items.push({
        id: `redo-${t.id}`,
        tone: 'danger',
        title: 'やり直しの指示',
        body: `「${t.title}」`,
        action: null
      });
    });
  }
  return items;
}

function renderInboxPanel() {
  const items = buildInboxItems();
  const toneClass = {
    warm: 'border-[#f3e0c8] bg-[#fff8ef]',
    accent: 'border-[#dff3ef] bg-[#f3fbf9]',
    gift: 'border-[#f3d4e0] bg-[#fff5f9]',
    danger: 'border-[#f5d4d0] bg-[#fff6f5]'
  };
  const list = items.length
    ? items.slice(0, 6).map(it => `
        <button type="button" ${it.action ? `onclick="${esc(it.action)}"` : 'disabled'} class="w-full text-left p-2.5 rounded-xl border ${toneClass[it.tone] || toneClass.accent} ${it.action ? 'cursor-pointer hover:brightness-[0.98]' : 'cursor-default'}">
          <p class="text-[11px] font-black text-[#1c2b27] leading-tight">${esc(it.title)}</p>
          <p class="text-[10px] font-bold text-[#5f7970] mt-0.5 ie-wrap-text">${esc(it.body)}</p>
        </button>
      `).join('')
    : `<p class="text-[10px] font-bold text-[#5f7970] text-center py-3">いまお知らせはありません</p>`;

  return `
    <div class="solid-box flex flex-col min-h-0 max-h-[38%] overflow-hidden" data-tour="inbox">
      <div class="flex-none px-3 py-2 border-b border-[#eaf1ee] flex justify-between items-center bg-gradient-to-r from-[#fff8ef] to-white">
        <h2 class="text-[11px] font-black text-[#1c2b27] flex items-center gap-1.5">
          <span class="inline-flex w-2 h-2 rounded-full ${items.length ? 'bg-[#e09a4a]' : 'bg-[#c5d8d1]'}"></span>
          ${rb('お知らせ','おしらせ')}
        </h2>
        ${items.length ? `<span class="text-[10px] font-black text-[#c47a20]" aria-label="お知らせ${items.length}件">${items.length}</span>` : ''}
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
        ${list}
      </div>
    </div>
  `;
}

function renderHome() {
  const activeTasks = state.tasks
    .filter(t => ['open', 'accepted', 'completed', 'proposed', 'rejected', 'proposal_rejected'].includes(t.status))
    .filter(t => t.status === 'completed' || !shouldSweepExpiredTask(t))
    .slice()
    .sort((a, b) => {
      const da = a.deadline || Number.POSITIVE_INFINITY;
      const db = b.deadline || Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ja');
    });
  const tJob = state.role === 'child' ? { id: 'propose', title: rb('見積り','みつもり') } : { id: 'taskCreate', title: rb('仕事の発注','しごとはっちゅう') };
  const tEx = state.role === 'child' ? rb('換金申請','かんきんしんせい') : rb('換金承認','かんきんしょうにん');

  let bankTotal = bankTotalBalance(state.banks);
  const rates = getCurrentMarketRates();
  const investTotal = getInvestmentPortfolioValue(
    getActiveInvestments(state.investments),
    rates,
    state.stockCap
  );
  const showAssetAmt = state.role === 'parent';
  const bankAmtHtml = showAssetAmt
    ? `<span class="text-[8px] font-black text-[#2f8f82] leading-none mt-0.5">${bankTotal.toLocaleString()}<span class="font-bold opacity-70">円</span></span>`
    : '';
  const investAmtHtml = showAssetAmt
    ? `<span class="text-[8px] font-black text-[#5b8def] leading-none mt-0.5">${investTotal.toLocaleString()}<span class="font-bold opacity-70">円</span></span>`
    : '';

  const canSwipeDelete = (t) => {
    if (state.role !== 'parent') return false;
    // 確認待ち・見積り中・期限切れも含めて、親が片付けられるようにする
    if (['open', 'accepted', 'rejected', 'proposal_rejected', 'completed', 'proposed'].includes(t.status)) return true;
    return false;
  };

  const statusChip = (t) => {
    const map = {
      open: { label: rb('募集中','ぼしゅうちゅう'), cls: 'ie-chip-open' },
      accepted: { label: rb('進行中','しんこうちゅう'), cls: 'ie-chip-accepted' },
      completed: { label: rb('確認待ち','かくにんまち'), cls: 'ie-chip-done' },
      proposed: { label: rb('見積り','みつもり'), cls: 'ie-chip-proposed' },
      rejected: { label: rb('お断り','おことわり'), cls: 'ie-chip-rejected' },
      proposal_rejected: { label: rb('見積り却下','みつもりきゃっか'), cls: 'ie-chip-rejected' }
    };
    const s = map[t.status];
    if (!s) return '';
    const expired = t.deadline && t.deadline < Date.now() && ['open', 'accepted'].includes(t.status);
    return `<span class="ie-status-chip ${s.cls}">${expired ? rb('期限切れ','きげんぎれ') : s.label}</span>`;
  };

  const urgencyClass = (t) => {
    if (!t.deadline) return '';
    const left = t.deadline - Date.now();
    if (left < 0) return 'ie-job-urgent-over';
    if (left < 60 * 60 * 1000) return 'ie-job-urgent-soon';
    return '';
  };

  const todayRepeatCount = activeTasks.filter(t => getTemplateIdFromTask(t)).length;

  let taskHtml = activeTasks.length > 0 ? activeTasks.map(t => {
    const timeTxt = formatTimeLeft(t.deadline);
    let btn = '';
    const templateId = getTemplateIdFromTask(t);
    const template = templateId ? state.taskTemplates.find(tp => tp.id === templateId) : null;
    let repeatMark = '';
    if (template) {
      const tip = formatRepeatLabel(template);
      if (state.role === 'parent') {
        repeatMark = `<button type="button" onclick="event.stopPropagation(); openTemplateEdit('${template.id}')" class="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100 transition" title="${tip}（タップで編集）"><span class="w-3 h-3">${getIcon('repeat')}</span><span class="text-[8px] font-black tracking-wide">定期</span></button>`;
      } else {
        repeatMark = `<span class="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-500 border border-sky-100" title="${tip}"><span class="w-3 h-3">${getIcon('repeat')}</span><span class="text-[8px] font-black tracking-wide">定期</span></span>`;
      }
    }
    
    if (state.role === 'child') {
      if (t.status === 'open') {
        btn = `
          <div class="flex gap-1.5">
            <button onclick="rejectTask('${t.id}')" class="solid-btn px-2.5 py-1.5 text-[9px] font-bold text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100">お断り</button>
            <button onclick="acceptTask('${t.id}')" class="solid-btn primary-btn px-3 py-1.5 text-[9px] font-bold shrink-0 shadow-sm">受注</button>
          </div>
        `;
      } else if (t.status === 'accepted') {
        btn = `<button onclick="completeTask('${t.id}')" class="solid-btn px-3 py-1.5 text-[9px] font-bold shrink-0 text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">完了</button>`;
      } else if (t.status === 'proposed') {
        btn = `<span class="text-[9px] text-sky-500 font-bold shrink-0">見積り審査中</span>`;
      } else if (t.status === 'proposal_rejected') {
        btn = `<span class="text-[9px] text-rose-500 font-bold shrink-0">見積り却下</span>`;
      } else {
        btn = `<span class="text-[9px] text-slate-400 font-medium shrink-0">確認待ち</span>`;
      }
    } else {
      if (t.status === 'completed') {
        btn = `
          <div class="flex gap-1.5 items-center">
            ${t.isExpired ? `<span class="text-[9px] text-amber-500 font-bold shrink-0">期限後</span>` : ''}
            <button onclick="returnTask('${t.id}')" class="solid-btn px-2.5 py-1.5 text-[9px] font-bold text-rose-500 border-rose-200 bg-rose-50 hover:bg-rose-100">やり直し</button>
            <button onclick="approveTask('${t.id}', ${t.points})" class="solid-btn primary-btn px-3 py-1.5 text-[9px] font-bold shrink-0 shadow-sm">付与</button>
          </div>
        `;
      } else if (t.status === 'rejected') {
        btn = `<span class="text-[9px] text-rose-500 font-bold shrink-0">お断りされました</span>`;
      } else if (t.status === 'proposed') {
        btn = `
          <div class="flex gap-1.5">
            <button onclick="rejectProposal('${t.id}')" class="solid-btn px-2.5 py-1.5 text-[9px] font-bold text-rose-500 border-rose-200 bg-rose-50 hover:bg-rose-100">却下</button>
            <button onclick="approveProposal('${t.id}')" class="solid-btn primary-btn px-3 py-1.5 text-[9px] font-bold shrink-0 shadow-sm">承認</button>
          </div>
        `;
      } else if (t.status === 'proposal_rejected') {
        btn = `<span class="text-[9px] text-rose-500 font-bold shrink-0">見積りを却下済み</span>`;
      } else if (t.status === 'open') {
        btn = `<span class="text-[9px] text-[#7a8f88] font-bold shrink-0">子供の受注待ち</span>`;
      } else {
        btn = `<span class="text-[9px] text-slate-400 font-medium shrink-0">進行中</span>`;
      }
    }

    const body = `
      <div class="ie-job-item ${urgencyClass(t)}">
        <div class="ie-job-head">
          ${repeatMark ? `<div class="ie-job-mark">${repeatMark}</div>` : ''}
          <p class="ie-job-title ie-wrap-text">${jobTitleHtml(t.title, t.titleKana || template?.titleKana)}</p>
        </div>
        <div class="flex justify-between items-center gap-2 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
            ${statusChip(t)}
            <span class="text-[9px] font-bold ${timeTxt.includes('切れ')?'text-[#d9655b]':'text-[#7a8f88]'} shrink-0">${timeTxt === '期限切れ' ? rb('期限切れ','きげんぎれ') : timeTxt}</span>
          </div>
          <span class="text-xs font-black text-[#1c2b27] shrink-0">${t.points} <span class="text-[9px] font-bold text-[#7a8f88]">円</span></span>
        </div>
        <div class="flex justify-end items-center mt-0.5">
          ${btn}
        </div>
      </div>
    `;

    if (!canSwipeDelete(t)) return body;

    return `
      <div class="ie-swipe" data-swipe-id="${esc(t.id)}">
        <div class="ie-swipe-actions">
          <button type="button" class="ie-swipe-delete" onclick="event.stopPropagation(); deleteTask('${esc(t.id)}')" aria-label="削除">
            <span class="w-4 h-4">${getIcon('trash')}</span>
            <span>削除</span>
          </button>
        </div>
        <div class="ie-swipe-panel">${body}</div>
      </div>
    `;
  }).join('') : `<div class="flex flex-col items-center justify-center h-full px-3 text-center">
      <div class="w-7 h-7 mb-2 text-[#7a8f88]">${getIcon('task')}</div>
      <p class="text-[11px] font-bold text-[#7a8f88]">いま動いている仕事はありません</p>
      ${state.role === 'parent'
        ? `<button onclick="setView('taskCreate')" class="mt-3 text-[10px] font-black text-[#2f8f82] underline">仕事を発注する</button>`
        : `<p class="text-[9px] font-bold text-[#a0b2ab] mt-1">親からの発注を待ちましょう</p>`}
    </div>`;

  const swipeHint = '';

  const repeatBadge = todayRepeatCount > 0
    ? `<span class="text-[8px] font-black text-[#3767bd] bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded-md">定期 ${todayRepeatCount}</span>`
    : '';

  return `
    <div class="flex-1 min-h-0 p-3">
      <div class="h-full grid grid-cols-[38fr_62fr] gap-3">
        <div class="flex flex-col gap-3 min-h-0 min-w-0">
          <div class="solid-box flex-1 p-2.5 space-y-3 overflow-y-auto">
            <div>
              <p class="ie-section-label">${rb('仕事','しごと')}</p>
              <button onclick="setView('${tJob.id}')" data-tour="job" class="solid-btn w-full py-3 flex-row gap-2">
                <div class="w-4 h-4 text-[#2f8f82] shrink-0">${getIcon('propose')}</div>
                <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${tJob.title}</span>
              </button>
              <button onclick="setView('templates')" data-tour="templates" class="solid-btn w-full py-2.5 flex-row gap-1.5 mt-2">
                <div class="w-4 h-4 text-[#4a7bd6] shrink-0">${getIcon('repeat')}</div>
                <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${rb('定期一覧','ていきいちらん')}</span>
              </button>
            </div>
            <div>
              <p class="ie-section-label">${rb('管理','かんり')}</p>
              <div class="grid grid-cols-1 gap-2">
                <button onclick="setView('bank')" data-tour="bank" class="solid-btn py-2.5 flex-row gap-2">
                  <div class="flex flex-col items-center shrink-0">
                    <div class="w-4 h-4 text-[#2f8f82]">${getIcon('bank')}</div>
                    ${bankAmtHtml}
                  </div>
                  <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${rb('銀行','ぎんこう')}</span>
                </button>
                <button onclick="setView('invest')" data-tour="invest" class="solid-btn py-2.5 flex-row gap-2">
                  <div class="flex flex-col items-center shrink-0">
                    <div class="w-4 h-4 text-[#4a7bd6]">${getIcon('invest')}</div>
                    ${investAmtHtml}
                  </div>
                  <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${rb('運用','うんよう')}</span>
                </button>
                <button onclick="setView('news')" data-tour="news" class="solid-btn py-2.5 flex-row gap-2">
                  <div class="w-4 h-4 text-[#c47a20] shrink-0">${getIcon('news')}</div>
                  <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${rb('ニュース','にゅーす')}</span>
                </button>
              </div>
            </div>
            <div>
              <p class="ie-section-label">${rb('支出','ししゅつ')}</p>
              <div class="grid grid-cols-1 gap-2">
                <button onclick="setView('payments')" data-tour="payments" class="solid-btn w-full py-2.5 flex-row gap-2">
                  <div class="w-4 h-4 text-[#2f8f82] shrink-0">${getIcon('pay')}</div>
                  <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${rb('支払い','しはらい')}</span>
                </button>
                <button onclick="setView('exchange')" data-tour="exchange" class="solid-btn w-full py-2.5 flex-row gap-2">
                  <div class="w-4 h-4 text-[#c47a20] shrink-0">${getIcon('exchange')}</div>
                  <span class="text-[10px] font-bold text-[#2c3d38] leading-none">${tEx}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="solid-box h-[90px] relative p-1 cursor-pointer transition hover:brightness-[0.99]" onclick="setView('invest')">
            <canvas id="investChart"></canvas>
          </div>
        </div>
        <div class="flex flex-col gap-3 min-h-0 min-w-0">
          <div class="solid-box flex flex-col min-h-0 flex-1 relative overflow-hidden" data-tour="tasklist">
            <div class="flex-none p-3 border-b border-[#eaf1ee] flex justify-between items-center bg-gradient-to-r from-[#f7fbf9] to-white rounded-t-[20px]">
              <h2 class="text-xs font-black text-[#1c2b27] flex items-center gap-1.5 tracking-wide"><div class="w-3 h-3 text-[#2f8f82]">${getIcon('task')}</div><span class="ie-ruby-pair">${rb('お仕事','おしごと')}リスト</span></h2>
              <div class="flex items-center gap-2">
                ${repeatBadge}
                ${swipeHint}
                <button onclick="setView('calendar')" class="w-4 h-4 text-[#5f7970] hover:text-[#2f8f82] transition" aria-label="月間予定を見る">${getIcon('calendar')}</button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 bg-[#fbfefd]">
              ${taskHtml}
            </div>
          </div>
          ${renderInboxPanel()}
        </div>
      </div>
    </div>
  `;
}

function renderModal(content) {
  return `
    <div class="flex-1 flex items-center justify-center p-4 ie-modal-backdrop z-30 absolute inset-0 overflow-x-hidden">
      <div class="ie-modal-panel w-full max-w-full max-h-[90%] flex flex-col relative animate-in zoom-in-95 duration-200 min-w-0">
        <button onclick="setView('home')" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-[#eef5f2] hover:bg-[#dff3ef] font-bold text-[#7a8f88] z-10 transition">✕</button>
        <div class="flex-1 overflow-y-auto overflow-x-hidden p-6 min-h-0 min-w-0">
          ${content}
        </div>
      </div>
    </div>
  `;
}

// ★ 投資画面：引数エラーを解消
function renderInvest() {
  const curRates = getCurrentMarketRates();
  const locked = state.points < 0;
  const stockCap = Number(state.stockCap) > 0 ? Number(state.stockCap) : null;
  const activeInvs = getActiveInvestments(state.investments);
  const rawStockValue = getInvestmentPortfolioValue(activeInvs, curRates, null);
  const stockValue = getInvestmentPortfolioValue(activeInvs, curRates, stockCap);
  const investmentValues = getInvestmentValues(activeInvs, curRates, stockCap);
  const capReached = stockCap != null && rawStockValue >= stockCap;
  const range = state.investRange === 'day' || state.investRange === 'week' || state.investRange === 'month'
    ? state.investRange
    : 'week';
  const rangeBtn = (id, label) => {
    const on = range === id;
    return `<button type="button" onclick="setInvestRange('${id}')" class="flex-1 py-2 rounded-xl text-[10px] font-black tracking-wide transition ${on ? 'bg-[#2f8f82] text-white shadow-sm' : 'bg-white text-[#5a726a] border border-[#eaf1ee] hover:bg-[#f7fbf9]'}">${label}</button>`;
  };
  const tradeable = state.marketSheetStatus === 'ok' ? getTradeableMarkets() : [];
  const sheetInfo = state.marketSheetStatus === 'ok' ? getMarketSheetInfo() : null;
  const heldNames = getHeldMarketNames(state.investments);
  const chartTotal = !state.investChartName || state.investChartName === CHART_TOTAL;
  const chartName = chartTotal
    ? CHART_TOTAL
    : (heldNames.includes(state.investChartName) ? state.investChartName : CHART_TOTAL);
  const chipCls = (on) =>
    `py-2 rounded-xl text-[10px] font-black tracking-wide transition ${on ? 'bg-[#2f8f82] text-white shadow-sm' : 'bg-white text-[#5a726a] border border-[#eaf1ee] hover:bg-[#f7fbf9]'}`;
  const marketChip = (name) => {
    const on = chartName === name;
    const short = name === '日本' ? '日経' : name === 'アメリカ' ? '米国' : name;
    return `<button type="button" onclick="setInvestChartName('${name}')" class="${chipCls(on)}">${esc(short)}</button>`;
  };
  const buyButtons = tradeable.map(name => {
    const m = MARKET_META[name];
    return `<button type="button" onclick="investCustom('${m.id}')" class="solid-btn py-3 bg-white hover:bg-slate-50 font-bold text-[11px] shadow-sm border border-slate-200">${esc(m.buyLabel)}</button>`;
  }).join('');

  const flashMarket = chartName === CHART_TOTAL
    ? (MARKET_ORDER
      .map(name => ({ name, pct: getMarketMovePct(name) }))
      .filter(row => Number.isFinite(row.pct))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]?.name || '原油')
    : chartName;
  const flashLine = getMarketFlashLine(flashMarket, state.marketNews);
  const flashHtml = flashLine
    ? `<div class="ie-invest-flash" role="status">
        <span class="ie-invest-flash-mark">速報</span>
        <p class="ie-invest-flash-text">${esc(flashLine)}</p>
      </div>`
    : '';

  const chartBlock = activeInvs.length
    ? `
    ${heldNames.length ? `
      <div class="flex flex-col gap-1.5 mb-3 p-1 rounded-2xl bg-[#f4f9f7] border border-[#eaf1ee]">
        <button type="button" onclick="setInvestChartName('${CHART_TOTAL}')" class="${chipCls(chartName === CHART_TOTAL)}">合計</button>
        <div class="grid grid-cols-2 gap-1.5">
          ${heldNames.map(marketChip).join('')}
        </div>
      </div>
    ` : ''}
    <div class="w-full h-[180px] mb-3 relative p-1 min-w-0"><canvas id="investChart"></canvas></div>
    <p class="text-[9px] font-bold text-center mb-4 text-[#7a8f88]">
      ${chartName === CHART_TOTAL
        ? '自分の運用資産の推移（評価額と元本・円）'
        : `${esc(MARKET_META[chartName]?.label || chartName)}の運用資産の推移（評価額と元本・円）`}
    </p>`
    : `
    <div class="w-full mb-4 px-4 py-8 rounded-2xl border border-[#eaf1ee] bg-[#f4f9f7] text-center">
      <p class="text-xs font-bold text-[#5f7970]">現在、運用中の資産はありません</p>
      <p class="text-[10px] font-bold text-[#7a8f88] mt-1.5 leading-relaxed">株を買うと、自分の運用資産の推移グラフが表示されます</p>
    </div>`;

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2"><div class="w-4 h-4 text-purple-500">${getIcon('invest')}</div>${rb('資産運用','しさんうんよう')}</h2>
    ${flashHtml}
    ${sheetInfo?.isStale ? `
      <div class="mb-4 px-4 py-3 rounded-xl border bg-amber-50 border-amber-200">
        <p class="text-xs font-bold text-amber-800">表の最終日は ${esc(sheetInfo.lastLabel)}（${sheetInfo.staleDays}日前）です</p>
        <p class="text-[10px] font-bold text-amber-700 mt-1 leading-relaxed">スプレッドシートの「相場」タブで、いちばん下の日付が今日付近になるまで、2行目を下にコピーしてください。</p>
      </div>
    ` : ''}
    ${activeInvs.length ? `
    <div class="flex gap-1.5 mb-3 p-1 rounded-2xl bg-[#f4f9f7] border border-[#eaf1ee]">
      ${rangeBtn('day', '1日')}
      ${rangeBtn('week', '1週間')}
      ${rangeBtn('month', '1か月')}
    </div>` : ''}
    ${chartBlock}
    ${stockCap != null ? `
      <div class="mb-4 px-4 py-3 rounded-xl border ${capReached ? 'bg-amber-50 border-amber-200' : 'bg-[#f4f9f7] border-[#eaf1ee]'}">
        <div class="flex justify-between gap-2 text-xs font-bold">
          <span class="${capReached ? 'text-amber-700' : 'text-[#5f7970]'}">${rb('運用上限','うんようじょうげん')}</span>
          <span class="${capReached ? 'text-amber-700' : 'text-[#1c2b27]'}">${stockValue.toLocaleString()} / ${stockCap.toLocaleString()} 円</span>
        </div>
        <p class="text-[10px] font-bold mt-1 ${capReached ? 'text-amber-600' : 'text-[#7a8f88]'}">${capReached ? '上限に達したため、運用資産はこれ以上増えません' : `運用資産はあと ${(stockCap - stockValue).toLocaleString()}円 まで増えます`}</p>
      </div>
    ` : ''}
    ${state.role === 'child' ? (
      locked
        ? `<div class="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-center"><p class="text-xs font-bold text-red-500">残高がマイナスのため株の購入はできません</p><p class="text-[10px] font-bold text-red-400 mt-1">お手伝いでポイントを取り戻しましょう</p></div>`
        : (state.marketSheetStatus !== 'ok'
          ? `<div class="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-xl text-center"><p class="text-xs font-bold text-slate-500">株を買うには、親が設定でスプレッドシートをつないでください</p></div>`
          : `<div class="flex flex-col gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="text-[10px] font-bold text-slate-500">投資する金額（所持: ${state.points.toLocaleString()} 円）</p>
        <input type="number" id="invest-amount" placeholder="ptを入力" class="w-full min-w-0 max-w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
        <div class="grid grid-cols-2 gap-2">${buyButtons || `<p class="text-[10px] font-bold text-slate-400 col-span-2 text-center">表に日本・アメリカなどの列がありません</p>`}</div>
      </div>`)
    ) : `<p class="text-[10px] font-bold text-[#7a8f88] mb-4 text-center">銘柄を選んで、運用資産と元本を確認できます</p>`}
    <div class="space-y-3">
      ${activeInvs.length > 0 ? activeInvs.map(inv => {
        const meta = MARKET_META[inv.name] || { label: inv.name };
        const val = investmentValues[inv.id] || 0;
        const invested = Number(inv.investedPoints) || 0;
        const diff = val - invested;
        const color = diff >= 0 ? 'text-emerald-500' : 'text-rose-500';
        const selected = chartName === inv.name;
        return `<div class="p-4 rounded-xl border flex flex-col gap-2 ${selected ? 'bg-[#f4f9f7] border-[#2f8f82]/30' : 'bg-slate-50 border-slate-100'}" onclick="setInvestChartName('${inv.name}')"><div class="flex justify-between items-center"><span class="font-bold text-sm text-slate-700">${esc(meta.label)}</span><div class="text-right"><p class="text-[9px] font-bold text-slate-400">運用資産</p><div class="flex items-baseline justify-end gap-2"><span class="text-[10px] font-bold ${color}">${diff >= 0 ? '+' : ''}${diff}</span><span class="text-lg font-black text-slate-800">${val.toLocaleString()} <span class="text-[10px] font-bold text-slate-500">円</span></span></div></div></div><div class="flex justify-between items-center text-[10px] font-bold text-slate-400"><span>元本: ${invested.toLocaleString()} 円</span>${state.role === 'child' ? `<button onclick="event.stopPropagation(); sellCustom('${inv.id}')" class="text-slate-500 hover:text-slate-800 bg-white px-3 py-1.5 rounded border border-slate-200">売却する</button>` : ''}</div></div>`;
      }).join('') : `<p class="text-[10px] font-bold text-slate-400 text-center py-4">現在、運用中の資産はありません</p>`}
    </div>
  `;
}

function renderTaskCreate() { 
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800">${rb('仕事発注','しごとはっちゅう')}</h2>
    <input type="text" id="task-title" placeholder="仕事の内容（例: おさら洗い）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-2 font-bold text-sm focus:outline-none" />
    <input type="text" id="task-title-kana" placeholder="読み方・フリガナ（任意）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none" />
    <div class="ie-field-stack mb-4">
      <label>${rb('報酬','ほうしゅう')}</label>
      <div class="ie-field-row">
        <input type="number" id="task-points" inputmode="numeric" placeholder="報酬金額" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
        <span class="ie-unit">円</span>
      </div>
    </div>
    
    <div class="mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <label class="ie-repeat-toggle flex items-start gap-2 font-bold text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" id="task-repeat-toggle" onchange="toggleRepeatUI()" class="rounded border-slate-300 mt-0.5 shrink-0">
        <span>🔁 定期的に繰り返して発注する</span>
      </label>
      <div id="repeat-ui" class="hidden mt-4 space-y-4">
        <div class="flex gap-2">
          <button type="button" onclick="setRepeatType('weekly')" class="ie-rep-type-btn flex-1 py-2.5 font-bold text-[10px]" id="btn-rep-weekly">曜日指定</button>
          <button type="button" onclick="setRepeatType('monthly')" class="ie-rep-type-btn flex-1 py-2.5 font-bold text-[10px]" id="btn-rep-monthly">毎月指定</button>
        </div>
        <div id="weekly-select" class="hidden">
          <p class="text-[9px] font-bold text-slate-400 mb-2">発注する曜日を選択（決めた時間に自動追加・受注不要）</p>
          <div class="flex gap-2 flex-wrap">
            ${['日','月','火','水','木','金','土'].map((w,i)=>`<label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" name="repeat-weeks" value="${i}"> ${w}</label>`).join('')}
          </div>
        </div>
        <div id="monthly-select" class="hidden">
          <p class="text-[9px] font-bold text-slate-400 mb-2">発注する日付を選択（決めた時間に自動追加・受注不要）</p>
          <select id="repeat-day-select" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none">
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`).join('')}
          </select>
        </div>
        <div>
          <p class="text-[9px] font-bold text-slate-400 mb-2">仕事の時間（任意。空なら期限なし）</p>
          <input type="time" id="repeat-time" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none">
        </div>
      </div>
    </div>

    <div id="normal-deadline-wrap">
      <p class="text-[9px] font-bold text-slate-400 mb-2" id="normal-deadline-title">仕事の時間（任意。空なら期限なし）</p>
      <input type="datetime-local" id="task-deadline" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-6 font-bold text-sm text-slate-500 focus:outline-none" />
    </div>
    <button onclick="addTask()" class="solid-btn primary-btn w-full py-4 font-bold">${rb('発注','はっちゅう')}する</button>
  `; 
}

function renderTemplatesList() {
  const list = (state.taskTemplates || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const isParent = state.role === 'parent';
  const items = list.length > 0
    ? list.map(temp => {
        const sched = formatRepeatLabel(temp);
        const action = isParent
          ? `onclick="openTemplateEdit('${esc(temp.id)}')"`
          : '';
        const chevron = isParent
          ? `<span class="text-[10px] font-bold text-[#5f7970] shrink-0">編集 ›</span>`
          : '';
        return `
          <button type="button" ${action} class="ie-job-item w-full text-left ${isParent ? 'cursor-pointer hover:bg-[#f0f7f4]' : 'cursor-default'} transition">
            <div class="flex justify-between items-start gap-2 min-w-0">
              <div class="min-w-0 flex-1">
                <div class="ie-job-head">
                  <span class="ie-job-mark shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100">
                    <span class="w-3 h-3">${getIcon('repeat')}</span>
                    <span class="text-[8px] font-black tracking-wide">定期</span>
                  </span>
                  <p class="ie-job-title ie-wrap-text">${jobTitleHtml(temp.title || '無題', temp.titleKana)}</p>
                </div>
                <p class="text-[10px] font-bold text-[#5f7970] mt-1.5">${esc(sched)}</p>
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                <span class="text-xs font-black text-[#1c2b27]">${Number(temp.points) || 0} <span class="text-[10px] font-bold text-[#5f7970]">円</span></span>
                ${chevron}
              </div>
            </div>
          </button>
        `;
      }).join('')
    : `<div class="flex flex-col items-center justify-center py-12 opacity-50">
        <div class="w-7 h-7 mb-2 text-[#7a8f88]">${getIcon('repeat')}</div>
        <p class="text-[11px] font-bold text-[#7a8f88]">定期の仕事はまだありません</p>
        ${isParent ? `<p class="text-[9px] font-bold text-[#a0b2ab] mt-1">発注画面で「定期的に繰り返す」をオンにすると追加できます</p>` : ''}
      </div>`;

  return `
    <h2 class="text-lg font-bold mb-1 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-sky-500">${getIcon('repeat')}</div>
      ${rb('定期一覧','ていきいちらん')}
    </h2>
    <p class="text-[10px] font-bold text-[#7a8f88] mb-4">
      ${isParent ? '定期的に自動発注される仕事です。タップで編集できます。' : '親が定期的に頼んでいる仕事の一覧です。'}
    </p>
    <div class="space-y-2">${items}</div>
    ${isParent ? `
      <button onclick="setView('taskCreate')" class="solid-btn primary-btn w-full py-3 font-bold text-sm mt-5">
        ＋ 新しい定期／単発を発注
      </button>
    ` : ''}
  `;
}

function renderTemplateEdit() {
  const temp = state.taskTemplates.find(t => t.id === state.editingTemplateId);
  if (!temp) {
    return `
      <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800">定期発注の編集</h2>
      <p class="text-sm font-bold text-slate-500 text-center py-8">この定期設定は削除済みか見つかりません。</p>
      <button onclick="setView('templates')" class="solid-btn w-full py-3 font-bold text-sm">戻る</button>
    `;
  }
  const isWeekly = temp.type !== 'monthly';
  window.repeatType = isWeekly ? 'weekly' : 'monthly';
  const days = temp.days || [];
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-sky-500">${getIcon('repeat')}</div>
      ${rb('定期発注','ていきはっちゅう')}の${rb('編集','へんしゅう')}
    </h2>
    <p class="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 mb-4">${formatRepeatLabel(temp)}</p>
    <input type="text" id="tmpl-title" value="${esc(temp.title || '')}" placeholder="仕事の内容" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-2 font-bold text-sm focus:outline-none" />
    <input type="text" id="tmpl-title-kana" value="${esc(temp.titleKana || '')}" placeholder="読み方・フリガナ（任意）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none" />
    <div class="ie-field-stack mb-4">
      <label>${rb('報酬','ほうしゅう')}</label>
      <div class="ie-field-row">
        <input type="number" id="tmpl-points" inputmode="numeric" value="${temp.points || ''}" placeholder="報酬金額" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
        <span class="ie-unit">円</span>
      </div>
    </div>
    <div class="mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
      <div class="flex gap-2">
        <button type="button" onclick="setRepeatType('weekly')" class="solid-btn flex-1 py-2 font-bold text-[10px] ${isWeekly ? 'primary-btn' : ''}" id="btn-rep-weekly">曜日指定</button>
        <button type="button" onclick="setRepeatType('monthly')" class="solid-btn flex-1 py-2 font-bold text-[10px] ${!isWeekly ? 'primary-btn' : ''}" id="btn-rep-monthly">毎月指定</button>
      </div>
      <div id="weekly-select" class="${isWeekly ? '' : 'hidden'}">
        <p class="text-[9px] font-bold text-slate-400 mb-2">発注する曜日を選択（0時自動追加）</p>
        <div class="flex gap-2 flex-wrap">
          ${['日','月','火','水','木','金','土'].map((w,i)=>`<label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" name="repeat-weeks" value="${i}" ${days.includes(i) ? 'checked' : ''}> ${w}</label>`).join('')}
        </div>
      </div>
      <div id="monthly-select" class="${isWeekly ? 'hidden' : ''}">
        <p class="text-[9px] font-bold text-slate-400 mb-2">発注する日付を選択（0時自動追加）</p>
        <select id="repeat-day-select" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none">
          ${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${days[0] === i+1 ? 'selected' : ''}>${i+1}日</option>`).join('')}
        </select>
      </div>
      <div>
        <p class="text-[9px] font-bold text-slate-400 mb-2">仕事の時間（任意。空なら期限なし）</p>
        <input type="time" id="repeat-time" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none" value="${esc(temp.time || '')}">
      </div>
    </div>
    <button onclick="updateTemplate()" class="solid-btn primary-btn w-full py-4 font-bold mb-3">変更を保存</button>
    <button onclick="deleteTemplate()" class="solid-btn w-full py-3 font-bold text-sm text-red-500 hover:bg-red-50 border-red-100">この定期発注を削除</button>
  `;
}

window.toggleRepeatUI = () => {
  const isRepeat = document.getElementById('task-repeat-toggle')?.checked;
  document.getElementById('repeat-ui')?.classList.toggle('hidden', !isRepeat);
  document.getElementById('normal-deadline-wrap')?.classList.toggle('hidden', !!isRepeat);
  if (isRepeat) setRepeatType(window.repeatType || 'weekly');
};
window.setRepeatType = (type) => {
  window.repeatType = type;
  const isWeekly = type === 'weekly';
  document.getElementById('weekly-select')?.classList.toggle('hidden', !isWeekly);
  document.getElementById('monthly-select')?.classList.toggle('hidden', isWeekly);
  document.getElementById('btn-rep-weekly')?.classList.toggle('on', isWeekly);
  document.getElementById('btn-rep-monthly')?.classList.toggle('on', !isWeekly);
};

function renderBank() {
  const currentTotal = bankTotalBalance(state.banks);
  const totalDeposit = (state.banks || []).reduce((s, b) => s + bankDepositPrincipal(b), 0);
  const totalInterest = bankTotalInterest(state.banks);
  return `<h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2"><div class="w-4 h-4 text-emerald-500">${getIcon('bank')}</div>${rb('家庭内銀行','かていないぎんこう')}</h2><div class="p-6 bg-slate-50 rounded-2xl text-center mb-6"><p class="text-[10px] font-bold text-slate-500 mb-1 tracking-wide">${rb('預金残高','よきんざんだか')}</p><p class="text-4xl font-black text-slate-800 tracking-tight">${currentTotal.toLocaleString()} <span class="text-sm font-bold text-slate-400">円</span></p><p class="text-[9px] font-bold text-emerald-600 mt-3 inline-block px-3 py-1 rounded-full border border-emerald-100 bg-white">${rb('利息','りそく')}: +${totalInterest.toLocaleString()}円 (月0.5%・毎月1日${rb('入金','にゅうきん')})</p></div>${state.role === 'child' ? `<div class="ie-field-row mb-4"><input type="number" id="bank-amount" inputmode="numeric" placeholder="金額を入力" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-slate-400 transition" /><button onclick="depositBank()" class="solid-btn primary-btn px-5 font-bold text-sm shrink-0">預ける</button></div>${currentTotal > 0 ? `<button onclick="withdrawBank()" class="solid-btn w-full py-4 text-sm font-bold hover:bg-slate-50">全額引き出す</button>` : ''}` : `<p class="text-[10px] text-center font-bold text-slate-400">子供の預金資産です</p>`} `;
}

function renderPayments() {
  const active = (state.scheduledPayments || []).filter(p => p.status === 'active');
  const done = (state.scheduledPayments || []).filter(p => p.status === 'done');
  const logs = (state.paymentLogs || []).slice(0, 40);

  const card = (p) => {
    const sched = formatPaymentSchedule(p);
    const amtLabel = p.amountKind === 'percentLastMonth'
      ? `${formatPaymentAmountLabel(p)}（${scheduledPaymentAmount(p, state.tasks, state.balloons)}円）`
      : formatPaymentAmountLabel(p);
    const editBtn = state.role === 'parent'
      ? `<button onclick="openPaymentEdit('${esc(p.id)}')" class="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">編集</button>`
      : '';
    const delBtn = state.role === 'parent'
      ? `<button onclick="deleteScheduledPayment('${esc(p.id)}')" class="text-[10px] font-bold text-slate-500 hover:text-red-500">削除</button>`
      : '';
    return `
      <div class="p-4 bg-white border border-slate-100 rounded-xl">
        <div class="flex justify-between items-start gap-2 mb-1">
          <p class="font-bold text-sm text-slate-800 ie-wrap-text min-w-0 flex-1">${esc(p.title)}</p>
          <span class="text-sm font-black text-indigo-600 shrink-0">${esc(amtLabel)}</span>
        </div>
        <p class="text-[10px] font-bold text-slate-500 mb-2">${esc(sched)}</p>
        <div class="flex gap-3 justify-end">${editBtn}${delBtn}</div>
      </div>
    `;
  };

  return `
    <h2 class="text-lg font-bold mb-2 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-indigo-500">${getIcon('pay')}</div>${rb('自動支払い','じどうしはらい')}
    </h2>
    <p class="text-[10px] font-bold text-slate-400 mb-4 leading-relaxed">
      ${state.role === 'parent'
        ? '期日の当日に、ホーム上の口座残高から引き落とされます。毎週・毎月は当日だけです（過ぎた日の分をまとめて落としません）。'
        : '設定された支払いは、期日の当日にホーム上の口座残高から引き落とされます。'}
    </p>
    ${state.role === 'parent' ? `<button onclick="setView('paymentCreate')" class="solid-btn primary-btn w-full py-3 font-bold text-sm mb-5">＋ 支払いを設定</button>` : ''}
    <p class="text-[9px] font-bold text-slate-400 mb-2 tracking-wider">設定中</p>
    <div class="space-y-2 mb-5">
      ${active.length ? active.map(card).join('') : `<p class="text-[10px] font-bold text-slate-400 text-center py-4">設定中の支払いはありません</p>`}
    </div>
    ${done.length ? `
      <p class="text-[9px] font-bold text-slate-400 mb-2 tracking-wider">完了済み</p>
      <div class="space-y-2 mb-5 opacity-60">${done.map(card).join('')}</div>
    ` : ''}
    <p class="text-[9px] font-bold text-slate-400 mb-2 tracking-wider">最近の引落</p>
    <div class="space-y-1">
      ${logs.length ? logs.map(l => {
        const d = new Date(l.chargedAt || l.createdAt);
        return `<div class="py-2 border-b border-slate-50 flex justify-between items-start gap-2 text-xs font-bold"><span class="text-slate-600 ie-wrap-text min-w-0 flex-1">${esc(l.title)}</span><span class="text-slate-800 shrink-0">−${Number(l.amount) || 0}円 <span class="text-[10px] text-slate-500 font-medium ml-1">${d.getMonth()+1}/${d.getDate()}</span></span></div>`;
      }).join('') : `<p class="text-[10px] font-bold text-slate-400 text-center py-4">まだ引落履歴はありません</p>`}
    </div>
  `;
}

function renderPaymentCreate() {
  window.payInterval = window.payInterval || 'monthly';
  const j = japanParts();
  const todayIso = `${j.year}-${String(j.month).padStart(2, '0')}-${String(j.day).padStart(2, '0')}`;
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800">支払いを設定</h2>
    <input type="text" id="pay-title" placeholder="名目（例: お小遣い返済・スマホ代）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none" />
    <div class="ie-field-stack mb-4">
      <p class="text-[9px] font-bold text-slate-400">金額の決め方</p>
      <div class="flex gap-4 text-xs font-bold text-slate-700 mb-3">
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-amount-kind" value="fixed" checked onchange="togglePaymentAmountUI()"> 定額</label>
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-amount-kind" value="percentLastMonth" onchange="togglePaymentAmountUI()"> 前月の稼ぎの％</label>
      </div>
      <div id="pay-amount-fixed">
        <label>金額</label>
        <div class="ie-field-row">
          <input type="number" id="pay-amount" inputmode="numeric" placeholder="金額" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
          <span class="ie-unit">円</span>
        </div>
      </div>
      <div id="pay-amount-percent" class="hidden">
        <p class="text-[10px] font-bold text-slate-500 mb-2 leading-relaxed">前月にお仕事とギフトで得た円の何％を引くか。税金のようなイメージです。</p>
        <label>割合</label>
        <div class="ie-field-row">
          <input type="number" id="pay-percent" inputmode="decimal" min="1" max="100" step="1" placeholder="例: 10" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
          <span class="ie-unit">％</span>
        </div>
      </div>
    </div>

    <div class="mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
      <p class="text-[9px] font-bold text-slate-400">種類</p>
      <div class="flex gap-4 text-xs font-bold text-slate-700">
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-mode" value="once" checked onchange="togglePaymentModeUI()"> 単発</label>
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-mode" value="repeat" onchange="togglePaymentModeUI()"> 定期</label>
      </div>

      <div id="pay-once-ui">
        <p class="text-[9px] font-bold text-slate-400 mb-2">引落日</p>
        <input type="date" id="pay-due-date" value="${todayIso}" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none" />
      </div>

      <div id="pay-repeat-ui" class="hidden space-y-3">
        <div class="flex gap-2">
          <button type="button" onclick="setPayInterval('weekly')" class="solid-btn flex-1 py-2 font-bold text-[10px]" id="btn-pay-weekly">毎週</button>
          <button type="button" onclick="setPayInterval('monthly')" class="solid-btn flex-1 py-2 font-bold text-[10px] primary-btn" id="btn-pay-monthly">毎月</button>
        </div>
        <div id="pay-weekly-select" class="hidden">
          <p class="text-[9px] font-bold text-slate-400 mb-2">曜日</p>
          <div class="flex gap-2 flex-wrap">
            ${['日','月','火','水','木','金','土'].map((w,i)=>`<label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" name="pay-weeks" value="${i}"> ${w}</label>`).join('')}
          </div>
        </div>
        <div id="pay-monthly-select">
          <p class="text-[9px] font-bold text-slate-400 mb-2">日付</p>
          <select id="pay-day-select" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none">
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`).join('')}
          </select>
        </div>
        <p class="text-[9px] font-bold text-slate-400">回数</p>
        <div class="flex gap-4 text-xs font-bold text-slate-700">
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-count-mode" value="infinite" checked onchange="togglePaymentCountUI()"> 無限</label>
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-count-mode" value="finite" onchange="togglePaymentCountUI()"> 回数指定</label>
        </div>
        <div id="pay-count-input-wrap" class="hidden">
          <input type="number" id="pay-count" min="1" placeholder="何回引落するか" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none" />
        </div>
      </div>
    </div>

    <button onclick="addScheduledPayment()" class="solid-btn primary-btn w-full py-4 font-bold">設定する</button>
  `;
}

function renderPaymentEdit() {
  const p = state.scheduledPayments.find(x => x.id === state.editingPaymentId);
  if (!p) {
    return `<h2 class="text-lg font-bold mb-4">支払い編集</h2><p class="text-sm text-slate-500 text-center py-8">見つかりません</p><button onclick="setView('payments')" class="solid-btn w-full py-3 font-bold text-sm">戻る</button>`;
  }
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-indigo-500">${getIcon('pay')}</div>支払いを編集
    </h2>
    <p class="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-4">${formatPaymentSchedule(p)}</p>
    <p class="text-[9px] font-bold text-slate-400 mb-2">名目</p>
    <input type="text" id="pay-edit-title" value="${esc(p.title || '')}" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none" />
    <div class="ie-field-stack mb-6">
      <p class="text-[9px] font-bold text-slate-400">金額の決め方</p>
      <div class="flex gap-4 text-xs font-bold text-slate-700 mb-3">
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-edit-amount-kind" value="fixed" ${p.amountKind === 'percentLastMonth' ? '' : 'checked'} onchange="togglePaymentEditAmountUI()"> 定額</label>
        <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="pay-edit-amount-kind" value="percentLastMonth" ${p.amountKind === 'percentLastMonth' ? 'checked' : ''} onchange="togglePaymentEditAmountUI()"> 前月の稼ぎの％</label>
      </div>
      <div id="pay-edit-amount-fixed" class="${p.amountKind === 'percentLastMonth' ? 'hidden' : ''}">
        <label>金額</label>
        <div class="ie-field-row">
          <input type="number" id="pay-edit-amount" inputmode="numeric" value="${p.amount || ''}" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
          <span class="ie-unit">円</span>
        </div>
      </div>
      <div id="pay-edit-amount-percent" class="${p.amountKind === 'percentLastMonth' ? '' : 'hidden'}">
        <p class="text-[10px] font-bold text-slate-500 mb-2 leading-relaxed">前月にお仕事とギフトで得た円の何％を引くか。</p>
        <label>割合</label>
        <div class="ie-field-row">
          <input type="number" id="pay-edit-percent" inputmode="decimal" min="1" max="100" step="1" value="${p.percent || ''}" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
          <span class="ie-unit">％</span>
        </div>
      </div>
    </div>
    <button onclick="updateScheduledPayment()" class="solid-btn primary-btn w-full py-4 font-bold mb-3">変更を保存</button>
    <button onclick="deleteScheduledPayment()" class="solid-btn w-full py-3 font-bold text-sm text-red-500 hover:bg-red-50 border-red-100">この支払いを削除</button>
  `;
}
function renderSettings() {
  const isChild = state.role === 'child';
  const permission = ('Notification' in window) ? Notification.permission : 'unsupported';
  const pushOn = permission === 'granted';

  const pushRow = `
    <button onclick="enablePushNotifications()" class="ie-guide-btn w-full mb-4" ${pushOn ? 'aria-disabled="true"' : ''}
            aria-label="通知を受け取る設定">
      <span class="ie-guide-icon ${pushOn ? 'text-[#2f8f82]' : 'text-[#c47a20]'}">${getIcon('bell')}</span>
      <span class="ie-guide-text">
        <span class="ie-guide-title">${rb('通知を受け取る','つうちをうけとる')}</span>
        <span class="ie-guide-sub">
          ${pushOn
            ? 'オンになっています。アプリを閉じていても届きます'
            : (permission === 'denied'
                ? 'ブロック中です。端末の設定から許可してください'
                : 'タップして許可すると、閉じていても届きます')}
        </span>
      </span>
      <span class="ie-push-state ${pushOn ? 'on' : ''}">${pushOn ? 'オン' : 'オフ'}</span>
    </button>
  `;

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-slate-500">${getIcon('settings')}</div>${rb('各種設定','かくしゅせってい')}
    </h2>

    <div class="p-6 bg-slate-50 rounded-2xl text-center mb-6 border border-slate-100">
      <p class="text-[10px] font-bold text-slate-500 mb-2 tracking-wide">${rbPair('同期','どうき','ID')}</p>
      <p class="text-2xl font-mono font-bold text-slate-800 tracking-widest">${esc(state.familyCode)}</p>
      ${isChild ? '' : renderChildSelect('light')}
    </div>

    ${isChild ? '' : `
      <div class="p-4 bg-white rounded-2xl border border-slate-100 mb-6 text-left">
        <p class="text-[10px] font-bold text-slate-500 tracking-wide mb-1"><span class="ie-ruby-pair"><span class="ie-ruby-plain">${esc(state.childName || 'こども')}の</span>${rb('運用上限','うんようじょうげん')}</span></p>
        <p class="text-[11px] font-bold text-slate-500 mb-3 leading-relaxed">運用資産（評価額）が増える上限です。元本の上限ではありません。値上がりしてもこの金額を超えません。初期値は 10000円。0 で制限なし。</p>
        <div class="flex gap-2 items-center">
          <input type="number" id="stock-cap-input" inputmode="numeric" min="0" step="1"
                 value="${state.stockCap == null ? 0 : Number(state.stockCap)}"
                 placeholder="10000"
                 class="flex-1 min-w-0 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
          <span class="text-xs font-bold text-slate-400 shrink-0">円</span>
          <button type="button" onclick="saveStockCap()" class="solid-btn primary-btn px-4 py-3 text-xs font-bold shrink-0">保存</button>
        </div>
      </div>
    `}

    ${pushRow}

    ${isChild ? '' : `
      <button onclick="addNewChild()" class="ie-guide-btn w-full mb-4" aria-label="お子さまを追加する">
        <span class="ie-guide-icon">${getIcon('childAdd')}</span>
        <span class="ie-guide-text">
          <span class="ie-guide-title">お子さまを${rb('追加','ついか')}</span>
          <span class="ie-guide-sub">${state.children.length >= 2
            ? `いま${state.children.length}人。同期IDの下のメニューで切り替えできます`
            : '兄弟姉妹を登録すると、同期IDの下のメニューで切り替えできます'}</span>
        </span>
        <span class="ie-guide-arrow" aria-hidden="true">›</span>
      </button>
      ${renderChildManageList()}
    `}

    <button onclick="startAppTutorial()" class="ie-guide-btn w-full mb-4" aria-label="使い方ガイドを最初から見る">
      <span class="ie-guide-icon">${getIcon('help')}</span>
      <span class="ie-guide-text">
        <span class="ie-guide-title">${rb('使い方ガイド','つかいかたガイド')}</span>
        <span class="ie-guide-sub">${isChild ? 'ホームで じゅんばんに せつめいします' : 'ホーム画面で機能を順番に案内します'}</span>
      </span>
      <span class="ie-guide-arrow" aria-hidden="true">›</span>
    </button>

    ${isChild ? `
    <button type="button" class="w-full p-4 bg-white rounded-xl mb-4 flex justify-between items-center cursor-pointer border border-slate-100"
            onclick="toggleFurigana()" role="switch" aria-checked="${state.furigana ? 'true' : 'false'}">
      <span class="font-bold text-sm text-slate-700">${rb('フリガナ表示','ふりがなひょうじ')}</span>
      <span class="w-10 h-5 rounded-full flex items-center p-0.5 transition-colors duration-200 ${state.furigana ? 'bg-[#2f8f82] justify-end' : 'bg-slate-300 justify-start'}">
        <span class="w-4 h-4 bg-white rounded-full shadow-sm"></span>
      </span>
    </button>
    ` : ''}

    <div class="text-center mb-2 flex flex-col items-center gap-3">
      <button type="button" onclick="logoutAccount()" class="ie-logout-btn">${rb('ログアウト','ろぐあうと')}</button>
      <button type="button" onclick="unlinkAccount()" class="ie-unlink-btn">${rb('連携を解除する','れんけいをかいじょする')}</button>
    </div>
  `;
}

export function drawInvestChart() {
  const canvas = document.getElementById('investChart');
  if (!canvas) return;

  const activeInvs = getActiveInvestments(state.investments);
  if (!activeInvs.length) {
    if (investChartInstance) {
      investChartInstance.destroy();
      investChartInstance = null;
    }
    lastInvestChartKey = '';
    return;
  }

  const isDetail = state.view === 'invest';
  const range = state.investRange === 'day' || state.investRange === 'week' || state.investRange === 'month'
    ? state.investRange
    : (isDetail ? 'week' : 'week');
  const names = getHeldMarketNames(state.investments);
  const chartName = isDetail
    ? (!state.investChartName || state.investChartName === CHART_TOTAL || !names.includes(state.investChartName)
      ? CHART_TOTAL
      : state.investChartName)
    : CHART_TOTAL;
  const history = getPortfolioHistory(
    state.investments,
    isDetail ? range : 'week',
    chartName,
    state.investmentLogs,
    state.stockCap
  );
  if (history.empty || !history.labels.length) {
    if (investChartInstance) {
      investChartInstance.destroy();
      investChartInstance = null;
    }
    lastInvestChartKey = '';
    return;
  }
  const meta = MARKET_META[chartName];
  const color = (chartName === CHART_TOTAL ? '#2f8f82' : meta?.color) || '#2f8f82';
  const chartKey = [
    isDetail ? 'd' : 'h',
    range,
    chartName,
    history.labels.join('\0'),
    history.assets.join(','),
    history.principal.join(','),
    color
  ].join('|');
  // 同じデータ・同じ canvas なら Chart を作り直さない（計算結果は変えない）
  if (
    investChartInstance &&
    lastInvestChartKey === chartKey &&
    investChartInstance.canvas === canvas &&
    document.body.contains(canvas)
  ) {
    return;
  }
  lastInvestChartKey = chartKey;
  const ctx = canvas.getContext('2d');

  if (investChartInstance) investChartInstance.destroy();

  const maxTicks = range === 'month' ? 6 : (range === 'week' ? 7 : 4);
  const fewPoints = history.labels.length <= 3;
  const pointRadius = isDetail ? (fewPoints ? 4 : (history.labels.length > 40 ? 0 : 2)) : 0;
  investChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.labels,
      datasets: [
        {
          label: '運用資産',
          data: history.assets,
          borderColor: color,
          backgroundColor: color + '14',
          borderWidth: 1.5,
          tension: fewPoints ? 0 : 0.2,
          pointRadius,
          fill: isDetail
        },
        {
          label: '元本',
          data: history.principal,
          borderColor: '#94a3b8',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          tension: 0,
          pointRadius,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: isDetail,
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 } }
        },
        tooltip: {
          enabled: isDetail,
          backgroundColor: 'rgba(15,23,42,0.9)',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const i = items?.[0]?.dataIndex;
              const ms = history.ms?.[i];
              if (!ms) return items?.[0]?.label || '';
              const j = japanParts(new Date(ms));
              return `${j.year}/${j.month}/${j.day}`;
            },
            label: (item) => `${item.dataset.label}: ${Number(item.parsed.y).toLocaleString()} 円`
          }
        }
      },
      scales: {
        x: {
          display: isDetail,
          grid: { display: false },
          ticks: {
            font: { size: 9 },
            color: '#94a3b8',
            maxTicksLimit: maxTicks,
            autoSkip: true,
            maxRotation: 0
          }
        },
        y: {
          display: isDetail,
          border: { dash: [4, 4] },
          grid: { color: '#f8fafc' },
          ticks: {
            font: { size: 9 },
            color: '#94a3b8',
            callback: (v) => Number(v).toLocaleString()
          }
        }
      },
      layout: { padding: isDetail ? 0 : 5 }
    }
  });
}
function renderBalloonSend() {
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-[#eaf1ee] pb-3 text-[#1c2b27] flex items-center gap-2">
      <div class="w-4 h-4 text-[#2f8f82]">${getIcon('gift')}</div>${rb('ギフト送信','ぎふとそうしん')}
    </h2>
    <input type="number" id="balloon-points" placeholder="プレゼントする金額（円）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none focus:border-slate-400" />
    <textarea id="balloon-message" placeholder="メッセージを入力" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-6 font-bold text-sm h-24 resize-none focus:outline-none focus:border-slate-400"></textarea>
    <button onclick="sendBalloon()" class="solid-btn primary-btn w-full py-4 font-bold">送る</button>
  `;
}
function renderPropose() {
  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800">${rb('見積り','みつもり')}</h2>
    <p class="text-[10px] font-bold text-slate-400 mb-4 leading-relaxed">${rb('仕事の内容と希望の報酬を親に送ります','しごとのないようときぼうのほうしゅうをおやにおくります')}</p>
    <input type="text" id="prop-title" placeholder="仕事の内容" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-2 font-bold text-sm focus:outline-none focus:border-slate-400" />
    <input type="text" id="prop-title-kana" placeholder="読み方・フリガナ（任意）" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-4 font-bold text-sm focus:outline-none focus:border-slate-400" />
    <div class="ie-field-stack mb-4">
      <label>${rb('希望報酬','きぼうほうしゅう')}</label>
      <div class="ie-field-row">
        <input type="number" id="prop-points" inputmode="numeric" placeholder="希望金額" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-slate-400" />
        <span class="ie-unit">円</span>
      </div>
    </div>
    <input type="datetime-local" id="prop-deadline" class="w-full p-3 bg-white border border-slate-200 rounded-xl mb-6 font-bold text-sm text-slate-500 focus:outline-none focus:border-slate-400" />
    <button onclick="proposeTask()" class="solid-btn primary-btn w-full py-4 font-bold">${rb('見積りを送信','みつもりをそうしん')}</button>
  `;
}
function renderExchange() {
  const p = state.exchanges.filter(e => e.status === 'pending');
  const locked = state.points < 0;
  if (state.role === 'child') {
    return `
      <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2"><div class="w-4 h-4 text-amber-500">${getIcon('exchange')}</div>${rb('換金申請','かんきんしんせい')}</h2>
      ${locked
        ? `<div class="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-center"><p class="text-xs font-bold text-red-500">残高がマイナスのため換金申請はできません</p><p class="text-[10px] font-bold text-red-400 mt-1">お手伝いでポイントを取り戻しましょう</p></div>`
        : `<div class="ie-field-stack mb-6">
            <label>換金額</label>
            <div class="ie-field-row">
              <input type="number" id="exchange-amount" inputmode="numeric" placeholder="金額" class="p-4 bg-white border border-slate-200 rounded-xl font-black text-lg text-right focus:outline-none focus:border-slate-400" />
              <span class="ie-unit">円</span>
            </div>
          </div>
          <button onclick="requestExchange()" class="solid-btn primary-btn w-full py-4 font-bold mb-6">申請する</button>`
      }
      <div class="space-y-2">${p.map(e => `<div class="p-3 rounded-xl text-sm font-bold flex justify-between bg-slate-50 border border-slate-100"><span class="text-slate-700">${e.yen} 円</span><span class="text-slate-400 text-[10px] bg-white px-2 py-1 rounded border border-slate-200">承認待ち</span></div>`).join('')}</div>
    `;
  }
  return `<h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800">${rb('換金承認','かんきんしょうにん')}</h2><div class="space-y-3">${p.length>0?p.map(e=>`<div class="p-5 rounded-2xl bg-slate-50 border border-slate-100"><p class="font-black text-lg mb-4 text-slate-800">${e.yen}円 の申請</p><div class="flex gap-3"><button onclick="approveExchange('${e.id}', ${e.points})" class="flex-1 solid-btn primary-btn py-3 font-bold text-sm">承認する</button><button onclick="rejectExchange('${e.id}')" class="flex-1 solid-btn py-3 font-bold text-sm text-slate-500 hover:bg-slate-100">却下</button></div></div>`).join(''):`<div class="flex flex-col items-center justify-center py-10 opacity-40"><div class="w-8 h-8 mb-3 text-slate-400">${getIcon('exchange')}</div><p class="text-[10px] font-bold text-slate-400">現在、申請はありません</p></div>`}</div>`;
}
function renderNews() {
  const marketAbout = new Set(['日経平均', 'S&P500', '金', '原油']);
  const weekendAbout = ['宇宙', '自然', 'くらし', 'お金'];
  const weekendNow = [0, 6].includes(japanParts().weekday);
  const all = (state.marketNews || []).filter(n => n && (n.title || n.about));
  const weekendItems = all.filter(n => weekendAbout.includes(n.about) || (n.about && !marketAbout.has(n.about)));
  const useWeekend = weekendNow || state.marketNewsKind === 'weekend' || weekendItems.length >= 2;
  const fallback = [
    { about: '宇宙', title: '昼間でも星はある。見えにくいだけ', what: '昼間の空でも星は出ていますが、見えにくくなっています。', why: 'よくある説明：太陽の光が空気に散らばって空が明るくなり、星の光がまけてしまうからです。', life: '暗い場所へ行くと、同じ目でも星の数がぐっと増えて見えます。', body: '宇宙飛行士が地球の外で見る空は、昼側でも星が見えることがあります。まぶしい太陽を隠せば、背景はほぼ真っ黒だからです。', url: 'https://www.nao.ac.jp/faq/' },
    { about: '自然', title: '台風の「目」は、なぜ静かなのか', what: '台風のまんなか（目）では、一時的に穏やかになることがあります。', why: 'よくある説明：目では空気が下に降りて雲が消えやすい一方、目のすぐ外側が一番風が強いからです。', life: '少し晴れただけで安心はできません。目が通り過ぎると、反対側から再び強い風が吹くことがあります。', body: '台風は巨大な空気の渦です。外側では雨風が強いのに、まんなかの「目」では比較的穏やかになることがあります。', url: 'https://www.jma.go.jp/jma/kishou/know/typhoon/1-1.html' },
    { about: 'くらし', title: 'プラスチックは石油からできることが多い', what: 'ペットボトルやレジ袋のもとをたどると、原油の一部からできていることが多いです。', why: 'よくある説明：原油を分けた材料の分子をつなげると、細長いプラスチックの鎖になるからです。', life: '便利さの裏側で、自然には分解しにくいという課題があります。', body: '原油を加熱して分けると、ガソリンなど性質の違う液体になります。その一部がプラスチックの材料になります。', url: 'https://www.env.go.jp/recycle/plastic/' },
    { about: 'お金', title: '銀行は預かったお金を全部しまっていない', what: '銀行に預けたお金は、金庫に全額眠っているわけではありません。', why: 'よくある説明：一部は引き出しに備え、残りは企業や家への貸し出しに回る仕組みだからです。', life: '貸し出した先が利息を払い、その一部が預金者の利息になる、と説明されることが多いです。土日は株の取引所が休みなので、お金の置き場所を考える練習日にもできます。', body: '銀行は預かったお金の一部を貸し出しに回します。これが経済の血液のように働く、という見方があります。', url: 'https://www.boj.or.jp/about/education/index.htm' }
  ];

  const order = useWeekend ? weekendAbout : ['日経平均', 'S&P500', '金', '原油'];
  const pool = useWeekend
    ? (weekendItems.length ? weekendItems : fallback)
    : all.filter(n => marketAbout.has(n.about));
  const groups = order.map(about => ({
    about,
    items: pool.filter(n => n.about === about).slice(0, 1)
  })).filter(g => g.items.length);

  const sectionWord = useWeekend ? 'トピックス' : 'ニュース';
  const newsSection = (label, text) => {
    if (!text) return '';
    return `<div class="ie-news-section">
      <p class="ie-news-section-label">${esc(label)}</p>
      <p class="ie-news-section-body">${esc(text)}</p>
    </div>`;
  };
  const blocks = groups.length
    ? groups.map(g => {
      const rows = g.items.map(n => {
        const label = n.title || `${n.about}のニュース`;
        const what = useWeekend ? (n.what || '') : getNewsWhatHappened(g.about);
        const hasLegacySections = !!(n.why || n.life || n.stocks);
        const topics = Array.isArray(n.topics) ? n.topics.filter(Boolean).slice(0, 5) : [];
        const topicHtml = topics.length
          ? `<div class="ie-news-section">
               <p class="ie-news-section-label">ポイント</p>
               <ul class="ie-news-topics">${topics.map(t => `<li class="ie-news-topic">${esc(t)}</li>`).join('')}</ul>
             </div>`
          : '';
        const bodyHtml = n.body
          ? `<div class="ie-news-body">${String(n.body).split(/\n\n+/).filter(Boolean).map(p =>
              `<p class="ie-news-section-body">${esc(p)}</p>`
            ).join('')}</div>`
          : '';
        const legacyHtml = hasLegacySections
          ? `${newsSection('なぜ？', n.why)}
             ${newsSection('くらしには？', n.life)}
             ${n.stocks ? newsSection('株には？', n.stocks) : ''}`
          : '';
        const detail = [
          what ? newsSection('何が起きている？', what) : '',
          legacyHtml,
          topicHtml,
          bodyHtml
        ].join('');
        return `<article class="block p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p class="ie-news-kicker">${esc(g.about)}・学習用</p>
          <p class="text-[14px] font-black text-slate-800 leading-snug ie-wrap-text">${esc(label)}</p>
          ${detail}
        </article>`;
      }).join('');
      return `<section class="mb-5"><h3 class="text-[11px] font-black text-slate-500 mb-2 tracking-wide">${esc(g.about)}の${sectionWord}</h3><div class="space-y-2">${rows}</div></section>`;
    }).join('')
    : `<p class="text-[11px] font-bold text-slate-500 text-center py-10">まだニュースがありません。あとで開き直してください。</p>`;

  let updatedLine = '';
  const at = Date.parse(state.marketNewsUpdatedAt || '');
  if (Number.isFinite(at)) {
    const j = japanParts(new Date(at));
    updatedLine = `<p class="text-[11px] font-bold text-slate-400 mb-3">${j.month}月${j.day}日 ${j.hour}時${rb('更新','こうしん')}</p>`;
  }
  const learnHint = useWeekend
    ? `<p class="text-[11px] font-bold text-slate-500 mb-3 leading-relaxed">土日は取引所が休みです。値動きの代わりに、小中学生向けのトピックスをまとめています。</p>`
    : `<p class="ie-news-disclaimer mb-3">${esc(state.marketNewsDisclaimer || '※これは実際の速報ではなく、経済を学ぶための解説です。')}</p>`;

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-[#c47a20] shrink-0">${getIcon('news')}</div>
      ${rb('ニュース','にゅーす')}
    </h2>
    ${learnHint}
    ${updatedLine}
    ${blocks}
  `;
}

function renderWish() {
  const list = (state.wishes || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const pending = list.filter(w => w.status === 'pending');
  const others = list.filter(w => w.status !== 'pending');

  const statusText = (w) => {
    if (w.status === 'pending') return 'まち';
    if (w.status === 'approved') return 'OK';
    return 'だめ';
  };

  if (state.role === 'parent') {
    const card = (w) => `
      <div class="p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <p class="font-black text-lg text-slate-800">${Number(w.points) || 0}円</p>
        <p class="text-[12px] font-bold text-slate-600 mt-1 leading-relaxed ie-wrap-text">${esc(w.reason || '')}</p>
        <p class="text-[10px] font-bold text-slate-400 mt-2">${esc(w.childName || 'こども')}</p>
        ${w.status === 'pending' ? `<div class="flex gap-3 mt-4">
          <button onclick="approveWish('${esc(w.id)}', ${Number(w.points) || 0})" class="flex-1 solid-btn primary-btn py-3 font-bold text-sm">わたす</button>
          <button onclick="rejectWish('${esc(w.id)}')" class="flex-1 solid-btn py-3 font-bold text-sm text-slate-500 hover:bg-slate-100">ことわる</button>
        </div>` : `<p class="text-[10px] font-bold text-slate-400 mt-3">${statusText(w)}</p>`}
      </div>`;
    return `
      <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
        <div class="w-4 h-4 text-[#c47a20]">${getIcon('wish')}</div>こづかいのお願い
      </h2>
      <p class="text-[11px] font-bold text-slate-500 mb-4 leading-relaxed">お子さまが「いくらくれ」と理由を書いて送ってきます。よければ円をわたせます。</p>
      <div class="space-y-3">${pending.length ? pending.map(card).join('') : `<p class="text-[11px] font-bold text-slate-400 text-center py-8">いま届いているお願いはありません</p>`}</div>
      ${others.length ? `<p class="text-[9px] font-bold text-slate-400 mt-6 mb-2 tracking-wider">これまでのお願い</p><div class="space-y-2">${others.slice(0, 12).map(card).join('')}</div>` : ''}
    `;
  }

  const row = (w) => `
    <div class="p-3 rounded-xl border border-slate-100 bg-white flex justify-between gap-2">
      <div class="min-w-0">
        <p class="font-bold text-sm text-slate-800">${Number(w.points) || 0}円</p>
        <p class="text-[11px] font-bold text-slate-500 mt-0.5 ie-wrap-text">${esc(w.reason || '')}</p>
      </div>
      <span class="text-[10px] font-black shrink-0 ${w.status === 'approved' ? 'text-[#2f8f82]' : w.status === 'rejected' ? 'text-rose-500' : 'text-amber-600'}">${statusText(w)}</span>
    </div>`;

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-[#c47a20]">${getIcon('wish')}</div>${rb('おねがい','お願い')}
    </h2>
    <p class="text-[11px] font-bold text-slate-500 mb-4 leading-relaxed">いくらの円がほしいかと、なぜ必要かを書いて、おうちの人におくってね。</p>
    <div class="ie-field-stack mb-6">
      <label>ほしい円</label>
      <div class="ie-field-row">
        <input type="number" id="wish-points" inputmode="numeric" placeholder="例: 500" class="p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none" />
        <span class="ie-unit">円</span>
      </div>
      <label>なぜ ひつよう？</label>
      <textarea id="wish-reason" placeholder="例: 本を買いたい" class="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm h-24 resize-none focus:outline-none"></textarea>
      <button onclick="sendWish()" class="solid-btn primary-btn w-full py-3 font-bold text-sm mt-1">おうちの人におくる</button>
    </div>
    <p class="text-[9px] font-bold text-slate-400 mb-2 tracking-wider">おくったお願い</p>
    <div class="space-y-2">${list.length ? list.map(row).join('') : `<p class="text-[11px] font-bold text-slate-400 text-center py-6">まだおくりません</p>`}</div>
  `;
}

function renderTickets() {
  const ts = state.tickets.filter(t => state.role === 'child' ? t.status === 'available' || t.status === 'bought' : true);
  const parentForm = state.role === 'parent' ? `
    <div class="ie-field-stack mb-6">
      <label>品名</label>
      <input id="t-title" placeholder="例: ゲーム1時間" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none" />
      <label>ポイント</label>
      <div class="ie-field-row">
        <input id="t-pts" type="number" inputmode="numeric" placeholder="必要な円" class="p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none" />
        <span class="ie-unit">円</span>
      </div>
      <button onclick="addTicket2()" class="solid-btn primary-btn w-full py-3 font-bold text-sm mt-1">追加する</button>
    </div>
  ` : '';

  const list = ts.map(t => {
    const id = esc(t.id);
    const price = Number(t.price) || 0;
    let b = '';
    if (state.role === 'child') {
      if (t.status === 'available') b = `<button onclick="buyTicket('${id}',${price})" class="solid-btn primary-btn px-4 py-2 rounded-lg text-[10px] font-bold shrink-0">購入</button>`;
      else b = `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md shrink-0">所持中</span>`;
    } else {
      if (t.status === 'available') b = `<button onclick="deleteTicket('${id}')" class="text-slate-500 hover:text-red-500 text-[10px] font-bold transition shrink-0">削除</button>`;
      else if (t.status === 'bought') b = `<button onclick="useTicket('${id}')" class="solid-btn primary-btn px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0">使用済にする</button>`;
      else b = `<span class="text-[10px] text-slate-400 font-bold shrink-0">使用済</span>`;
    }
    return `
      <div class="p-4 rounded-xl border ${t.status === 'bought' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'} flex justify-between items-start gap-2 min-w-0">
        <div class="min-w-0 flex-1">
          <p class="font-bold text-sm text-slate-700 ie-wrap-text">${esc(t.title)}</p>
          <p class="text-[10px] font-bold mt-0.5 ${t.status === 'bought' ? 'text-slate-500' : 'text-rose-600'}">${price} 円</p>
        </div>
        ${b}
      </div>
    `;
  }).join('');

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-rose-500 shrink-0">${getIcon('ticket')}</div>
      チケット${state.role === 'parent' ? '管理' : '購入'}
    </h2>
    ${parentForm}
    <div class="space-y-3 min-w-0">${list || `<p class="text-[11px] font-bold text-slate-500 text-center py-6">チケットはまだありません</p>`}</div>
  `;
}
function renderHistory() {
  const byDay = groupPointActivityByDay({
    tasks: state.tasks,
    tickets: state.tickets,
    exchanges: state.exchanges,
    paymentLogs: state.paymentLogs,
    banks: state.banks,
    balloons: state.balloons,
    wishes: state.wishes
  });
  const earnedTotal = byDay.reduce((s, g) => s + g.earned + g.gifted, 0);
  const spentTotal = byDay.reduce((s, g) => s + g.spent, 0);
  const { cardDays, stamped, streak, month } = getHelpStampData(state.tasks);
  const monthLabel = `${month + 1}月`;
  const stampCells = Array.from({ length: cardDays }, (_, i) => {
    const day = i + 1;
    const on = stamped.has(day);
    return `<div class="aspect-square rounded-xl flex flex-col items-center justify-center border text-[9px] font-black ${on ? 'ie-stamp-on' : 'bg-[#f7faf9] border-[#eaf1ee] text-[#b9cdc6]'}">${on ? '✓' : day}</div>`;
  }).join('');

  const week = ['日', '月', '火', '水', '木', '金', '土'];
  const dayBlocks = byDay.length
    ? byDay.map(g => {
      const label = `${g.month}/${g.day}（${week[g.weekday]}）`;
      const rows = g.items.map(row => {
        const pts = Number(row.points) || 0;
        const sign = pts >= 0 ? '+' : '';
        const color = row.kind === 'spend'
          ? 'text-rose-500'
          : (row.kind === 'gift' ? 'text-[#c45a8a]' : 'text-[#1c2b27]');
        const kindLabel = row.kind === 'spend'
          ? '使った'
          : (row.kind === 'gift' ? 'ギフト' : '獲得');
        const title = row.kind === 'earn'
          ? jobTitleHtml(row.label, row.titleKana)
          : esc(row.label);
        return `
          <div class="flex justify-between items-start gap-2 py-2 border-b border-[#eaf1ee] last:border-0">
            <div class="min-w-0 flex-1">
              <p class="text-[9px] font-bold text-[#7a8f88]">${kindLabel}</p>
              <p class="text-[#2c3d38] ie-wrap-text text-xs font-bold">${title}</p>
            </div>
            <span class="${color} text-xs font-black shrink-0">${sign}${pts.toLocaleString()} 円</span>
          </div>
        `;
      }).join('');
      const net = g.earned + g.gifted - g.spent;
      const netColor = net >= 0 ? 'text-[#2f8f82]' : 'text-rose-500';
      return `
        <div class="mb-4 rounded-2xl border border-[#eaf1ee] bg-white overflow-hidden">
          <div class="flex justify-between items-center gap-2 px-4 py-3 bg-[#f4f9f7] border-b border-[#eaf1ee]">
            <p class="text-sm font-black text-[#1c2b27]">${label}</p>
            <p class="text-sm font-black ${netColor} shrink-0">${net >= 0 ? '+' : ''}${net.toLocaleString()} <span class="text-[10px] font-bold">円</span></p>
          </div>
          <div class="px-4 py-2 flex flex-wrap gap-3 text-[10px] font-bold text-[#7a8f88] border-b border-[#eaf1ee]">
            <span>獲得 +${g.earned.toLocaleString()}</span>
            <span>ギフト +${g.gifted.toLocaleString()}</span>
            <span>使った −${g.spent.toLocaleString()}</span>
          </div>
          <div class="px-4 py-1">${rows}</div>
        </div>
      `;
    }).join('')
    : `<p class="text-[11px] font-bold text-[#5f7970] text-center py-6">まだ履歴はありません</p>`;

  return `
    <h2 class="text-lg font-bold mb-4 border-b border-[#eaf1ee] pb-3 text-[#1c2b27] flex items-center gap-2">
      <div class="w-4 h-4 text-[#2f8f82]">${getIcon('history')}</div>${rb('資産履歴','しさんりれき')}
    </h2>
    <div class="grid grid-cols-2 gap-2 mb-5">
      <div class="p-4 bg-[#f4f9f7] rounded-2xl text-center border border-[#eaf1ee]">
        <p class="text-[10px] font-bold text-[#7a8f88] mb-1 tracking-widest">獲得・ギフト</p>
        <p class="text-xl font-black text-[#1c2b27] tracking-tight">+${earnedTotal.toLocaleString()} <span class="text-[10px] font-bold text-[#7a8f88]">円</span></p>
      </div>
      <div class="p-4 bg-[#fff7f5] rounded-2xl text-center border border-[#f3e0da]">
        <p class="text-[10px] font-bold text-[#7a8f88] mb-1 tracking-widest">使った分</p>
        <p class="text-xl font-black text-rose-500 tracking-tight">−${spentTotal.toLocaleString()} <span class="text-[10px] font-bold text-[#7a8f88]">円</span></p>
      </div>
    </div>

    <div class="mb-6 p-4 ie-stamp-board">
      <div class="flex items-end justify-between mb-3 gap-2">
        <div>
          <p class="text-[10px] font-bold text-[#c4873f] tracking-wider mb-0.5">${monthLabel}のスタンプカード</p>
          <p class="text-sm font-black text-[#1c2b27]">${streak > 0 ? `${streak}日連続お手伝い達成中！` : '今日からスタンプを集めよう'}</p>
        </div>
        <p class="text-[10px] font-bold text-[#7a8f88] shrink-0">${stamped.size}/${cardDays}日</p>
      </div>
      <div class="grid grid-cols-6 gap-1.5">
        ${stampCells}
      </div>
      <p class="text-[9px] font-bold text-[#7a8f88] mt-3 leading-relaxed">お手伝いが承認された日にスタンプが押されます（1〜${cardDays}日）</p>
    </div>

    <p class="text-[10px] font-bold text-[#7a8f88] tracking-wider mb-2">日ごとの履歴</p>
    <div>${dayBlocks}</div>
  `;
}
function ensureCalendarCursor() {
  if (state.calendarYear && state.calendarMonth) return;
  const j = japanParts();
  state.calendarYear = j.year;
  state.calendarMonth = j.month;
  if (!state.calendarSelectedDay) state.calendarSelectedDay = j.day;
}

/** その月の日付キー（日本時間）に仕事を振り分ける */
function buildCalendarDayMap(year, month) {
  const map = {};
  const add = (day, item) => {
    if (!day || day < 1) return;
    if (!map[day]) map[day] = [];
    map[day].push(item);
  };

  // 承認済み・削除済みも含め、過去の仕事がカレンダーから消えないようにする
  const listed = (state.tasks || []).filter(t =>
    t.deadline
    && !['proposed', 'proposal_rejected', 'deleted'].includes(t.status)
    && (t.status === 'completed' || t.status === 'approved' || !shouldSweepExpiredTask(t))
  );
  for (const t of listed) {
    const j = japanParts(new Date(t.deadline));
    if (j.year !== year || j.month !== month) continue;
    add(j.day, {
      id: t.id,
      title: t.title || 'お仕事',
      titleKana: t.titleKana || '',
      points: Number(t.points) || 0,
      status: t.status,
      deadline: t.deadline,
      kind: 'task',
      repeat: Boolean(getTemplateIdFromTask(t)),
      templateId: getTemplateIdFromTask(t),
      time: `${String(j.hour).padStart(2, '0')}:${String(j.minute).padStart(2, '0')}`
    });
  }

  // 定期テンプレの発生日（過去も含む）。既にタスクがある日は二重に出さない
  for (const temp of (state.taskTemplates || [])) {
    const days = Array.isArray(temp.days) ? temp.days.map(Number) : [];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const timeParts = String(temp.time || '19:00').split(':');
    const hours = Number(timeParts[0]) || 19;
    const minutes = Number(timeParts[1]) || 0;

    for (let day = 1; day <= daysInMonth; day++) {
      let due = false;
      if (temp.type === 'weekly') {
        const wd = new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T12:00:00+09:00`);
        due = days.includes(japanParts(wd).weekday);
      } else if (temp.type === 'monthly') {
        due = days.includes(day);
      }
      if (!due) continue;

      const already = (map[day] || []).some(x => x.templateId === temp.id || (x.repeat && x.title === temp.title));
      if (already) continue;

      const dayDate = new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T12:00:00+09:00`);
      const deadline = japanDeadlineMs(hours, minutes, dayDate);
      if (deadline < japanDayStartMs()) continue;
      add(day, {
        id: `plan-${temp.id}-${day}`,
        title: temp.title || 'お仕事',
        titleKana: temp.titleKana || '',
        points: Number(temp.points) || 0,
        status: deadline < Date.now() ? 'past_plan' : 'planned',
        deadline,
        kind: 'planned',
        repeat: true,
        templateId: temp.id,
        time: temp.time || '19:00'
      });
    }
  }

  for (const day of Object.keys(map)) {
    map[day].sort((a, b) => (a.deadline || 0) - (b.deadline || 0) || String(a.title).localeCompare(String(b.title), 'ja'));
  }
  return map;
}

function renderCalendar() {
  ensureCalendarCursor();
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const today = japanParts();
  const dayMap = buildCalendarDayMap(year, month);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // 月初の曜日（日=0）を日本時間で取る
  const firstWeekday = japanParts(new Date(`${year}-${String(month).padStart(2,'0')}-01T12:00:00+09:00`)).weekday;

  if (!state.calendarSelectedDay || state.calendarSelectedDay > daysInMonth) {
    state.calendarSelectedDay =
      (year === today.year && month === today.month) ? today.day : 1;
  }
  const selected = state.calendarSelectedDay;
  const selectedItems = dayMap[selected] || [];

  const weekHead = ['日','月','火','水','木','金','土']
    .map((w, i) => `<span class="ie-cal-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`)
    .join('');

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(`<div class="ie-cal-cell empty" aria-hidden="true"></div>`);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const items = dayMap[day] || [];
    const isToday = year === today.year && month === today.month && day === today.day;
    const isSelected = day === selected;
    const hasTask = items.some(x => x.kind === 'task');
    const hasPlan = items.some(x => x.kind === 'planned');
    const overdue = items.some(x => x.kind === 'task' && x.deadline && x.deadline < Date.now() && !['completed', 'approved'].includes(x.status));
    const preview = items[0]
      ? `<span class="ie-cal-preview">${esc(items[0].title)}</span>`
      : '';
    cells.push(`
      <button type="button" class="ie-cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasTask || hasPlan ? 'has' : ''} ${overdue ? 'overdue' : ''}"
              onclick="selectCalendarDay(${day})" aria-label="${month}月${day}日${items.length ? ` 仕事${items.length}件` : ''}" aria-pressed="${isSelected}">
        <span class="ie-cal-num">${day}</span>
        ${preview}
      </button>
    `);
  }

  const statusLabel = (it) => {
    const timeBit = it.deadline
      ? `${String(japanParts(new Date(it.deadline)).hour).padStart(2,'0')}:${String(japanParts(new Date(it.deadline)).minute).padStart(2,'0')}`
      : (it.time || '');
    if (it.kind === 'planned') {
      if (it.status === 'past_plan') return `予定だった ${timeBit}`.trim();
      return `予定 ${timeBit}`.trim();
    }
    if (it.status === 'approved') return `完了 ${timeBit}`.trim();
    if (it.status === 'deleted') return `終了 ${timeBit}`.trim();
    if (it.status === 'completed') return `確認待ち ${timeBit}`.trim();
    if (it.status === 'accepted') return `進行中 ${timeBit}`.trim();
    if (it.status === 'open') return `募集中 ${timeBit}`.trim();
    if (it.status === 'proposed') return '見積り';
    if (it.deadline && it.deadline < Date.now()) return `期限切れ ${timeBit}`.trim();
    return `${formatTimeLeft(it.deadline)}${timeBit ? ` · ${timeBit}` : ''}`;
  };

  const list = selectedItems.length
    ? selectedItems.map(it => `
        <div class="ie-cal-item ${it.kind === 'planned' ? 'planned' : ''}">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 min-w-0">
              ${it.repeat ? `<span class="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100"><span class="w-3 h-3">${getIcon('repeat')}</span><span class="text-[8px] font-black">定期</span></span>` : ''}
              <span class="font-bold text-xs text-[#2c3d38] ie-wrap-text">${jobTitleHtml(it.title, it.titleKana)}</span>
            </div>
            <p class="text-[9px] font-bold text-[#7a8f88] mt-1">${esc(statusLabel(it))}</p>
          </div>
          <span class="text-xs font-black text-[#1c2b27] shrink-0">${it.points}<span class="text-[9px] font-bold text-[#7a8f88] ml-0.5">円</span></span>
        </div>
      `).join('')
    : `<div class="ie-cal-empty-day"><p class="text-[11px] font-bold text-[#7a8f88]">この日の仕事はありません</p></div>`;

  return `
    <h2 class="text-lg font-bold mb-3 border-b border-slate-100 pb-3 text-slate-800 flex items-center gap-2">
      <div class="w-4 h-4 text-blue-500">${getIcon('calendar')}</div>${rb('月間予定','げっかんよてい')}
    </h2>

    <div class="ie-cal">
      <div class="ie-cal-nav">
        <button type="button" onclick="shiftCalendarMonth(-1)" class="ie-cal-nav-btn" aria-label="前の月">‹</button>
        <p class="ie-cal-title">${year}年${month}月</p>
        <button type="button" onclick="shiftCalendarMonth(1)" class="ie-cal-nav-btn" aria-label="次の月">›</button>
      </div>
      <div class="ie-cal-weekhead">${weekHead}</div>
      <div class="ie-cal-grid">${cells.join('')}</div>
    </div>

    <div class="mt-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-[11px] font-black text-[#1c2b27]">${month}月${selected}日の仕事</p>
        <p class="text-[9px] font-bold text-[#7a8f88]">${selectedItems.length}件</p>
      </div>
      <div class="space-y-1.5">${list}</div>
    </div>
  `;
}
function renderSetupLoading(message) {
  return `
    <div class="h-full flex flex-col items-center justify-center p-6 ie-setup-shell relative overflow-hidden">
      <div class="w-full max-w-sm ie-setup-card p-12 text-center relative z-10">
        <div class="w-12 h-12 border-4 border-[#dff3ef] border-t-[#2f8f82] rounded-full animate-spin mx-auto mb-5"></div>
        <p class="text-sm font-black text-[#1c2b27] mb-2">しばらくお待ちください</p>
        <p class="text-[10px] font-bold text-[#7a8f88] leading-relaxed">${message || '処理中...'}</p>
      </div>
    </div>
  `;
}

function renderPasswordSetup() { return `<div class="h-full flex flex-col items-center justify-center p-6 bg-slate-50 relative overflow-hidden"><img src="logo.png" class="absolute inset-0 w-full h-full object-cover opacity-5 pointer-events-none mix-blend-multiply" onerror="this.style.display='none'" /><div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10 text-center animate-in zoom-in-95"><h3 class="font-black text-slate-800 mb-2 text-lg">パスワードを設定</h3><p class="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">次回以降のログインに使う<br>パスワードを決めてください。</p><div class="password-wrapper"><input type="password" id="new-password" placeholder="パスワード（6文字以上）" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition" /><div id="eye-new" class="password-eye" onclick="togglePassword('new-password', 'eye-new')">${getIcon('eye')}</div></div><div class="password-wrapper"><input type="password" id="new-password-confirm" placeholder="もう一度入力（確認用）" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition" /><div id="eye-confirm" class="password-eye" onclick="togglePassword('new-password-confirm', 'eye-confirm')">${getIcon('eye')}</div></div><button onclick="saveNewPassword()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md shadow-blue-200">設定して開始</button></div></div>`; }

function renderPasswordResetForm() {
  if (state.isSending) {
    return `<div class="h-full flex flex-col items-center justify-center p-6 bg-slate-50"><div class="w-full max-w-sm bg-white p-12 rounded-3xl shadow-xl border border-slate-100 text-center"><div class="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-4"></div><p class="text-[10px] font-bold text-slate-500">通信中...</p></div></div>`;
  }
  return `
    <div class="h-full flex flex-col items-center justify-center p-6 bg-slate-50 relative overflow-hidden">
      <img src="logo.png" class="absolute inset-0 w-full h-full object-cover opacity-5 pointer-events-none mix-blend-multiply" onerror="this.style.display='none'" />
      <div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10 text-center animate-in zoom-in-95">
        <h3 class="font-black text-slate-800 mb-2 text-lg">新しいパスワード</h3>
        <p class="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">新しいパスワードを入力してください。<br>（6文字以上）</p>
        <div class="password-wrapper">
          <input type="password" id="reset-new-password" placeholder="新しいパスワード" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition" />
          <div id="eye-reset-new" class="password-eye" onclick="togglePassword('reset-new-password', 'eye-reset-new')">${getIcon('eye')}</div>
        </div>
        <div class="password-wrapper">
          <input type="password" id="reset-new-password-confirm" placeholder="もう一度入力（確認用）" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition" />
          <div id="eye-reset-confirm" class="password-eye" onclick="togglePassword('reset-new-password-confirm', 'eye-reset-confirm')">${getIcon('eye')}</div>
        </div>
        <button onclick="submitPasswordReset()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md">パスワードを変更する</button>
      </div>
    </div>
  `;
}
function renderWaitingChild() {
  const childSelect = renderChildSelect('light');
  return `
    <div class="h-full flex flex-col items-center justify-center p-6 bg-slate-50 relative overflow-hidden">
      <img src="logo.png" class="absolute inset-0 w-full h-full object-cover opacity-5 pointer-events-none mix-blend-multiply" onerror="this.style.display='none'" />
      <div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10 text-center animate-in zoom-in-95">
        <h3 class="font-black text-slate-800 mb-2 text-lg">${esc(state.childName)} の連携待機中</h3>
        <p class="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
          子供の端末で「子供として開始」を選び、<br>以下の同期IDを入力してください。
        </p>
        <div class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 font-mono font-black text-3xl tracking-widest text-slate-800">${esc(state.familyCode)}</div>
        ${childSelect ? `<div class="mb-6 text-left">${childSelect}</div>` : ''}
        <div class="flex items-center justify-center gap-2 mb-6 text-xs font-bold text-slate-400 animate-pulse">
          <div class="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>子供の接続を待機中...
        </div>
        <button onclick="logoutAccount()" class="text-[10px] text-slate-400 hover:text-slate-600 font-bold underline">ログアウト</button>
      </div>
    </div>
  `;
}

function renderSetupInstallPrompt(kind) {
  if (!kind) return '';
  return `<div class="w-full max-w-sm relative z-10 mb-6">${renderInstallGate(kind)}</div>`;
}

function renderSetup() {
  markInstallPromptDoneIfStandalone();
  const browserPrompt = getSetupBrowserPromptKind();
  let content = '';
  if (state.isSending) { content = `<div class="w-full max-w-sm ie-setup-card p-12 text-center relative z-10"><div class="w-10 h-10 border-4 border-[#dff3ef] border-t-[#2f8f82] rounded-full animate-spin mx-auto mb-4"></div><p class="text-[10px] font-bold text-[#7a8f88]">通信中...</p></div>`; } 
  else if (!state.setupMode) { content = `<div class="w-full max-w-sm ie-setup-card p-8 mb-6 relative z-10 text-center"><p class="text-sm font-bold text-[#2f8f82] mb-4 leading-relaxed">はじめに、おうちの人が設定してください</p><ol class="ie-setup-first-steps text-left text-[11px] font-bold text-[#5f7970] leading-relaxed mb-6"><li>① おうちの人が「親として開始」</li><li>② 初期設定をする</li><li>③ 設定が終わったら、子どもが自分の端末で始める</li></ol><h3 class="font-black text-[#1c2b27] mb-6 text-lg">どちらで始めますか？</h3><button onclick="setSetupMode('parent_select')" class="solid-btn primary-btn w-full py-4 font-bold mb-3">親として開始</button><button onclick="setSetupMode('child')" class="solid-btn w-full py-4 font-bold text-[#3d524c]">子供として開始</button></div>`; } 
  else if (state.setupMode === 'parent_select') { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10"><button onclick="cancelSetup()" class="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-sm">◀ 戻る</button><h3 class="font-black text-slate-800 mb-6 text-center text-lg mt-4">親のアカウント設定</h3><button onclick="setSetupMode('parent_register')" class="solid-btn primary-btn w-full py-4 font-bold mb-3 shadow-md">新しく始める（メール認証）</button><button onclick="setSetupMode('parent_login')" class="solid-btn w-full py-4 font-bold text-slate-600 hover:bg-slate-50">既存のアカウントにログイン</button></div>`; } 
  else if (state.setupMode === 'parent_register' && state.setupStep === 2) { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10 text-center"><div class="w-16 h-16 text-emerald-500 mx-auto mb-4"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></div><h3 class="font-black text-slate-800 mb-4 text-lg">メールを送信しました</h3><p class="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">「${esc(state.message || '')}」宛に<br>登録用URLを送信しました。<br><br>メールアプリを開き、<br>リンクをクリックしてください。</p><p class="text-[10px] text-slate-400 mb-5">※メールを確認したあと、またこのアプリを開いてください</p><button type="button" onclick="cancelSetup()" class="solid-btn w-full py-3 font-bold text-sm text-slate-600 hover:bg-slate-50">ホームへ戻る</button></div>`; } 
  else if (state.setupMode === 'parent_register') { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10"><button onclick="setSetupMode('parent_select')" class="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-sm">◀ 戻る</button><h3 class="font-black text-slate-800 mb-2 text-center text-lg mt-4">新規登録（親）</h3><p class="text-[10px] font-medium text-slate-400 text-center mb-6 leading-relaxed">入力したアドレスに認証リンクを送信します。<br>パスワードは認証後に設定します。</p><input type="email" id="setup-email" placeholder="メールアドレス" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 font-bold text-sm focus:outline-none focus:border-slate-400 focus:bg-white transition" /><button onclick="sendRealEmailLink()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md">認証メールを送信する</button></div>`; } 
  else if (state.setupMode === 'parent_login') { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10"><button onclick="setSetupMode('parent_select')" class="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-sm">◀ 戻る</button><h3 class="font-black text-slate-800 mb-6 text-center text-lg mt-4">ログイン（親）</h3><input type="email" id="login-email" placeholder="メールアドレス" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-3 font-bold text-sm focus:outline-none focus:border-slate-400 focus:bg-white transition" /><div class="password-wrapper"><input type="password" id="login-password" placeholder="パスワード" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:border-slate-400 focus:bg-white transition" /><div id="eye-login" class="password-eye" onclick="togglePassword('login-password', 'eye-login')">${getIcon('eye')}</div></div><button onclick="loginParent()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md mb-4">ログイン</button><button type="button" onclick="setSetupMode('parent_forgot')" class="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 underline underline-offset-2 transition">パスワードを忘れた方はこちら</button></div>`; } 
  else if (state.setupMode === 'parent_forgot' && state.setupStep === 2) { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10 text-center"><div class="w-16 h-16 text-emerald-500 mx-auto mb-4"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></div><h3 class="font-black text-slate-800 mb-4 text-lg">メールを送信しました</h3><p class="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">「${state.message}」宛に<br>パスワード再設定用のリンクを送信しました。<br><br>メールアプリを開き、<br>リンクをタップしてください。</p><button onclick="setSetupMode('parent_login')" class="solid-btn w-full py-3 font-bold text-sm text-slate-600 hover:bg-slate-50">ログイン画面へ戻る</button></div>`; }
  else if (state.setupMode === 'parent_forgot') { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10"><button onclick="setSetupMode('parent_login')" class="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-sm">◀ 戻る</button><h3 class="font-black text-slate-800 mb-2 text-center text-lg mt-4">パスワード再設定</h3><p class="text-[10px] font-medium text-slate-400 text-center mb-6 leading-relaxed">登録しているメールアドレスを入力してください。<br>再設定用のリンクを送信します。</p><input type="email" id="reset-email" placeholder="メールアドレス" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 font-bold text-sm focus:outline-none focus:border-slate-400 focus:bg-white transition" /><button onclick="sendPasswordReset()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md">再設定メールを送信</button></div>`; }
  else if (state.setupMode === 'child') { content = `<div class="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100 relative z-10"><button onclick="cancelSetup()" class="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-sm">◀ 戻る</button><h3 class="font-black text-slate-800 mb-2 text-center text-lg mt-4">親の同期IDを入力</h3><p class="text-[10px] font-medium text-slate-400 text-center mb-6 leading-relaxed">親のアプリの設定画面にある<br>「同期ID」を入力して連携します。</p><input id="setup-family-code" placeholder="IDを入力" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 text-center font-mono font-black text-2xl uppercase tracking-widest focus:outline-none focus:border-slate-400 focus:bg-white transition" /><button onclick="joinFamily()" class="solid-btn primary-btn w-full py-4 font-bold shadow-md">同期してスタート</button></div>`; }
  return `<div class="h-full flex flex-col items-center justify-center p-6 ie-setup-shell relative overflow-hidden"><div class="w-24 h-24 mb-8 rounded-[28px] overflow-hidden bg-white shadow-[0_12px_32px_rgba(47,143,130,0.18)] flex items-center justify-center relative z-10 border border-[#eaf1ee]"><img src="logo.png" class="w-full h-full object-cover" onerror="this.style.display='none'" /></div><h1 class="text-3xl font-black text-[#1c2b27] mb-6 tracking-tight relative z-10">イエノミクス</h1>${renderSetupInstallPrompt(browserPrompt)}${browserPrompt ? '' : content}</div>`;
}
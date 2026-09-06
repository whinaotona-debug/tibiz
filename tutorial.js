// 使い方ガイド。ホーム画面の要素を1つずつスポットライトで示しながら説明する。
// 対象は ui.js 側の data-tour 属性で指定する。
import { esc } from './utils.js?v=267';

const SEEN_KEY = 'ienomics_tutorial_seen';

let steps = [];
let index = 0;
let active = false;
let root = null;
let onFinish = null;

const PARENT_STEPS = [
  {
    target: null,
    title: 'イエノミクスへようこそ',
    body: '家庭の中でお金の動きを体験する、経済教育のアプリです。お手伝いを「お仕事」として発注し、円で報酬を払います。まずは親の画面を一通り案内します。'
  },
  {
    target: 'synccode',
    title: '同期ID',
    body: 'お子さまの端末でこのIDを入力すると、親子の画面がつながります。タップするとコピーできます。お子さまの追加は設定からどうぞ。'
  },
  {
    target: 'childtabs',
    // お子さまがひとりのときは切り替えタブが出ないので、この説明も飛ばす
    requireTarget: true,
    title: 'お子さまの切り替え',
    body: 'ごきょうだいを登録すると、同期IDの下に名前のメニューが出ます。選ぶとその子の口座に切り替わります。「つながり待ち」は、まだ端末がつながっていない子です。'
  },
  {
    target: 'job',
    title: 'お仕事を発注する',
    body: 'ここから仕事の内容・報酬を決めて発注します。仕事の時間は空でも出せます。「定期的に繰り返す」をオンにすると、毎週や毎月に合わせて仕事が追加されます。定期は受注不要で、子供はすぐ完了報告できます。'
  },
  {
    target: 'templates',
    title: '定期一覧',
    body: '自動で発注される仕事の一覧です。タップすると内容や曜日をあとから編集・削除できます。'
  },
  {
    target: 'bank',
    title: '家庭内銀行',
    body: 'お子さまが円を預けると、月0.5%の利息がつきます。貯める習慣を体験してもらう仕組みです。'
  },
  {
    target: 'invest',
    title: '資産運用',
    body: '日経平均やS&P500など、市場の値動きに合わせて円を運用できます。値上がりも値下がりもあります。'
  },
  {
    target: 'payments',
    title: '支払いの設定',
    body: 'スマホ代やお小遣いの返済など、定期的に引き落とす支払いを設定できます。定額のほか、前月の稼ぎの何％かを税金のように指定できます。残高が足りないとマイナスになり、株の購入と換金が止まります。'
  },
  {
    target: 'exchange',
    title: '換金の承認',
    body: 'お子さまからの「円を現金にしたい」という申請は、ここで承認または却下します。'
  },
  {
    target: 'news',
    title: 'ニュース',
    body: '平日は日経平均・S&P500・金・原油の解説が出ます。土日は取引所が休みなので、宇宙やくらしなど小中学生向けの面白い話に切り替わります。'
  },
  {
    target: 'tasklist',
    title: 'お仕事リスト',
    body: '進行中の仕事が、仕事の時間が近い順に並びます。完了報告が届いたら「付与」で円を渡し、直してほしいときは「やり直し」を押します。期限が近い仕事は色で知らせます。'
  },
  {
    target: 'inbox',
    title: 'お知らせ',
    body: '見積り・完了報告・換金申請・こづかいのお願いなど、お子さまからの連絡がここに集まります。'
  },
  {
    target: 'nav-tickets',
    title: 'チケット',
    body: 'ごほうびチケットの登録と、使ったあとの処理は下のバーから開けます。'
  },
  {
    target: 'nav-home',
    title: 'ホーム',
    body: 'まんなかの丸がホームです。いつでもここに戻ってこられます。'
  },
  {
    target: 'nav-mid',
    title: 'ギフト',
    body: 'がんばった日のごほうびに、メッセージを添えて円を贈れます。'
  },
  {
    target: 'nav-history',
    title: '履歴とスタンプカード',
    body: '獲得した円の履歴と、その月のお手伝いスタンプが見られます。連続記録も表示されます。'
  },
  {
    target: 'nav-settings',
    title: '設定',
    body: 'このガイドはいつでも設定から見直せます。困ったときはここに戻ってきてください。'
  }
];

const CHILD_STEPS = [
  {
    target: null,
    title: 'イエノミクスへようこそ',
    body: 'おうちの なかで おかねの うごきを たいけんする、けいざい教育のアプリです。おしごとを して 円を もらいます。つかいかたを じゅんばんに せつめいします。'
  },
  {
    target: 'job',
    title: 'みつもりを おくる',
    body: '「このおてつだいを ○○円で やりたい」と じぶんから ていあんできます。おうちの人が オーケーしたら おしごとになります。'
  },
  {
    target: 'templates',
    title: 'ていき一覧',
    body: 'まいしゅう や まいつき たのまれている おしごとの いちらんです。よていが かくにんできます。'
  },
  {
    target: 'bank',
    title: 'ぎんこう',
    body: '円を あずけると すこしずつ りそくが つきます。つかわずに ためると おとくです。'
  },
  {
    target: 'invest',
    title: 'うんよう',
    body: '円を かぶに かえて ふやせるかも しれません。ただし へることも あります。'
  },
  {
    target: 'exchange',
    title: 'かんきん しんせい',
    body: 'ためた 円を おかねに かえたいときは ここから おねがいします。おうちの人が みとめたら せいりつです。'
  },
  {
    target: 'news',
    title: 'ニュース',
    body: 'へいじつは かぶの はなし、どにちは とりひきじょが やすみなので、うちゅうや くらしの おもしろい はなしに かわります。'
  },
  {
    target: 'tasklist',
    title: 'おしごとリスト',
    body: 'たのまれた おしごとが、じかんが ちかいじゅんに ならびます。「じゅちゅう」で ひきうけて、おわったら「かんりょう」を おしてね。'
  },
  {
    target: 'inbox',
    title: 'おしらせ',
    body: 'あたらしい おしごとや ギフトが とどくと ここに でます。ギフトは タップすると うけとれます。'
  },
  {
    target: 'nav-tickets',
    title: 'チケット',
    body: '「ゲーム1じかん」などを 円で かえます。したのバーから ひらけます。'
  },
  {
    target: 'nav-home',
    title: 'ホーム',
    body: 'まんなかの まるが ホーム。いつでも ここにもどれるよ。'
  },
  {
    target: 'nav-wish',
    title: 'おねがい',
    body: 'いくらくれと、なぜひつようかを かいて、おうちの人におくれるよ。'
  },
  {
    target: 'nav-history',
    title: 'りれきと スタンプ',
    body: 'これまでに もらった 円と、その月の スタンプカードが みられます。まいにち つづけて スタンプを あつめよう。'
  },
  {
    target: 'nav-settings',
    title: 'せってい',
    body: 'この つかいかたガイドは いつでも せっていから みなおせます。フリガナの オン・オフも ここです。'
  }
];

function ensureRoot() {
  let el = document.getElementById('ie-tour-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ie-tour-root';
    document.body.appendChild(el);
  }
  return el;
}

function findTarget(name) {
  if (!name) return null;
  return document.querySelector(`[data-tour="${name}"]`);
}

let scrollRetryTimer = null;

/** 説明カードの中身を作り直す。ステップが変わったときだけ呼ぶ。 */
function draw() {
  if (!active) return;
  const step = steps[index];
  if (!step) return end();

  const total = steps.length;
  const isLast = index === total - 1;

  root.innerHTML = `
    <div class="ie-tour-layer" role="dialog" aria-modal="true" aria-label="使い方ガイド">
      <div class="ie-tour-spot" data-tour-spot hidden></div>
      <div class="ie-tour-dim" data-tour-dim hidden></div>
      <div class="ie-tour-card-wrap" data-tour-card>
       <div class="ie-tour-card">
        <div class="ie-tour-head">
          <span class="ie-tour-count">${index + 1} / ${total}</span>
          <button type="button" class="ie-tour-skip" data-tour-end>とじる</button>
        </div>
        <h2 class="ie-tour-title">${esc(step.title)}</h2>
        <p class="ie-tour-body">${esc(step.body)}</p>
        <div class="ie-tour-dots" aria-hidden="true">
          ${steps.map((_, i) => `<span class="ie-tour-dot ${i === index ? 'on' : ''}"></span>`).join('')}
        </div>
        <div class="ie-tour-actions">
          <button type="button" class="ie-tour-btn" data-tour-prev ${index === 0 ? 'disabled' : ''}>もどる</button>
          <button type="button" class="ie-tour-btn ie-tour-next" data-tour-next>${isLast ? 'はじめる' : 'つぎへ'}</button>
        </div>
       </div>
      </div>
    </div>
  `;

  root.querySelector('[data-tour-next]').addEventListener('click', goNext);
  root.querySelector('[data-tour-prev]').addEventListener('click', goPrev);
  root.querySelector('[data-tour-end]').addEventListener('click', end);

  position();
}

/**
 * 枠とカードの位置だけを測り直す。
 * データ更新で画面が作り直されてもカードが点滅しないよう、中身には触れない。
 */
function position() {
  if (!active || !root) return;
  const step = steps[index];
  const spot = root.querySelector('[data-tour-spot]');
  const dim = root.querySelector('[data-tour-dim]');
  const card = root.querySelector('[data-tour-card]');
  if (!spot || !card) return;

  const el = findTarget(step?.target);
  if (!el) {
    spot.hidden = true;
    dim.hidden = false;
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const r = el.getBoundingClientRect();
  // 画面外に隠れている場合は見える位置まで運び、動き終わってから測り直す
  if (r.top < 0 || r.bottom > window.innerHeight) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearTimeout(scrollRetryTimer);
    scrollRetryTimer = setTimeout(position, 380);
  }

  const pad = 6;
  dim.hidden = true;
  spot.hidden = false;
  spot.style.top = `${Math.max(0, r.top - pad)}px`;
  spot.style.left = `${Math.max(0, r.left - pad)}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  // 対象の下に置く。下が狭ければ上に回す。
  const cardH = card.offsetHeight || 200;
  const below = window.innerHeight - r.bottom;
  const top = below > cardH + 24
    ? r.bottom + 14
    : Math.max(12, r.top - cardH - 14);
  card.style.top = `${top}px`;
  card.style.transform = 'translateX(-50%)';
}

function goNext() {
  if (index >= steps.length - 1) end();
  else { index++; draw(); }
}

function goPrev() {
  if (index > 0) { index--; draw(); }
}

function onKey(e) {
  if (!active) return;
  if (e.key === 'Escape') { e.preventDefault(); end(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
}

function onResize() {
  position();
}

export function startTutorial(role, options = {}) {
  steps = role === 'parent' ? PARENT_STEPS : CHILD_STEPS;
  index = 0;
  active = true;
  onFinish = options.onFinish || null;
  root = ensureRoot();
  document.body.classList.add('ie-tour-open');
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKey, true);
  localStorage.setItem(SEEN_KEY, 'true');
  // ホームが描画され終わってから、実際に画面にある項目だけに絞って始める
  setTimeout(() => {
    steps = steps.filter(s => !s.requireTarget || findTarget(s.target));
    draw();
  }, 80);
}

export function end() {
  if (!active) return;
  active = false;
  clearTimeout(scrollRetryTimer);
  document.body.classList.remove('ie-tour-open');
  window.removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onKey, true);
  if (root) root.innerHTML = '';
  const cb = onFinish;
  onFinish = null;
  if (cb) cb();
}

/** 画面が再描画されたあとに枠の位置を測り直す */
export function refreshTutorial() {
  if (active) position();
}

export function isTutorialActive() {
  return active;
}

export function hasSeenTutorial() {
  return localStorage.getItem(SEEN_KEY) === 'true';
}

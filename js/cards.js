// 抽卡:卡组加载、随机抽取、翻面、指针倾斜、朗读、卡片总览
const DECKS = {
  trending: { url: 'data/trending.json', label: '流行' },
  daily: { url: 'data/daily.json', label: '日常' },
};
const cache = {};
const state = { deck: 'trending', cur: null, flipped: false, history: [], tag: '全部' };
const $ = (s) => document.querySelector(s);

export async function loadDeck(name) {
  if (!cache[name]) {
    const res = await fetch(DECKS[name].url);
    if (!res.ok) throw new Error('词库加载失败:' + name);
    cache[name] = await res.json();
  }
  return cache[name];
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  const clean = String(text).replace(/\(.*?\)/g, ' ').replace(/[+/]/g, ' ');
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('ko'));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

function lenClass(s) {
  const n = [...s].length;
  return n > 9 ? 'l' : n > 5 ? 'm' : 's';
}

function renderFront(c) {
  const f = $('#face-front');
  f.replaceChildren();
  const top = el('div', 'f-top');
  top.append(el('span', 'chip', c.tag), el('span', 'no mono', 'NO.' + c.id.slice(1) + ' · ' + DECKS[state.deck].label));
  const body = el('div', 'f-body');
  const kr = el('h3', 'f-kr', c.kr);
  kr.lang = 'ko';
  kr.dataset.len = lenClass(c.kr);
  body.append(kr, el('div', 'f-brush'), el('p', 'f-zh', c.zh));
  const foot = el('div', 'f-foot');
  foot.append(el('span', null, c.tone), el('span', 'hint', '点击翻面 ▸'));
  f.append(top, body, foot, el('span', 'cut tr'), el('span', 'cut bl'));
}

function renderBack(c) {
  const b = $('#face-back');
  b.replaceChildren();
  const hasOrigin = c.origin && c.origin !== '—';
  const h1 = hasOrigin ? el('h3', null, '词源 / 全称') : document.createDocumentFragment();
  const origin = hasOrigin ? el('p', 'b-origin', c.origin) : document.createDocumentFragment();
  if (hasOrigin) origin.lang = 'ko';
  const h2 = el('h3', null, '用法');
  const note = el('p', 'b-note', c.note);
  const h3 = el('h3', null, '例句');
  const ol = el('ul', 'b-ex');
  c.ex.forEach(([k, z]) => {
    const li = el('li');
    const kp = el('p', 'k', k);
    kp.lang = 'ko';
    li.append(kp, el('p', 'z', z));
    ol.append(li);
  });
  b.append(h1, origin, h2, note, h3, ol, el('p', 'b-tone', '语气:' + c.tone));
}

function setFlipped(v) {
  state.flipped = v;
  $('#card').classList.toggle('is-flipped', v);
  $('#face-front').inert = v;
  $('#face-back').inert = !v;
  $('#face-front').setAttribute('aria-hidden', String(v));
  $('#face-back').setAttribute('aria-hidden', String(!v));
  $('#btn-flip').textContent = v ? '翻回正面' : '翻面';
}

function show(c, animate = true) {
  state.cur = c;
  renderFront(c);
  renderBack(c);
  setFlipped(false);
  const card = $('#card');
  if (animate) {
    card.classList.remove('is-drawing');
    void card.offsetWidth;
    card.classList.add('is-drawing');
  }
  state.history = [c, ...state.history.filter((x) => x.id !== c.id)].slice(0, 6);
  renderHistory();
}

async function draw() {
  const deck = await loadDeck(state.deck);
  const recent = new Set(state.history.slice(0, Math.min(4, deck.length - 1)).map((x) => x.id));
  const pool = deck.filter((c) => !recent.has(c.id));
  show(pool[Math.floor(Math.random() * pool.length)]);
}

function renderHistory() {
  const ul = $('#history');
  ul.replaceChildren();
  state.history.slice(1).forEach((c) => {
    const li = el('li');
    const b = el('button', null, c.kr);
    b.type = 'button';
    b.lang = 'ko';
    b.addEventListener('click', () => show(c));
    li.append(b);
    ul.append(li);
  });
}

async function renderGrid() {
  const deck = await loadDeck(state.deck);
  $('#deck-count').textContent = deck.length;
  const tags = ['全部', ...new Set(deck.map((c) => c.tag))];
  const chips = $('#chips');
  chips.replaceChildren();
  tags.forEach((t) => {
    const b = el('button', null, t);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(t === state.tag));
    b.addEventListener('click', () => {
      state.tag = t;
      renderGrid();
    });
    chips.append(b);
  });
  const grid = $('#grid');
  grid.replaceChildren();
  deck
    .filter((c) => state.tag === '全部' || c.tag === state.tag)
    .forEach((c) => {
      const li = el('li');
      const b = el('button');
      b.type = 'button';
      const k = el('span', 'g-kr', c.kr);
      k.lang = 'ko';
      b.append(k, el('span', 'g-zh', c.zh));
      b.addEventListener('click', () => {
        show(c);
        $('#stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      li.append(b);
      grid.append(li);
    });
}

function setupTilt(reduced) {
  const tilt = $('#tilt');
  if (reduced) return;
  const stage = $('#stage');
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tilt.style.setProperty('--ry', ((x - 0.5) * 16).toFixed(2) + 'deg');
    tilt.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(2) + 'deg');
    tilt.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    tilt.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
  });
  stage.addEventListener('pointerleave', () => {
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
  });
}

export async function initCards({ reduced = false } = {}) {
  const speakBtn = $('#btn-speak');
  if (!('speechSynthesis' in window)) speakBtn.hidden = true;

  $('#btn-draw').addEventListener('click', draw);
  $('#btn-flip').addEventListener('click', () => setFlipped(!state.flipped));
  $('#card').addEventListener('click', () => setFlipped(!state.flipped));
  speakBtn.addEventListener('click', () => state.cur && speak(state.cur.kr));

  document.querySelectorAll('.tabs [role=tab]').forEach((t) =>
    t.addEventListener('click', async () => {
      if (state.deck === t.dataset.deck) return;
      state.deck = t.dataset.deck;
      state.tag = '全部';
      state.history = [];
      document.querySelectorAll('.tabs [role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      await renderGrid();
      await draw();
    }),
  );

  setupTilt(reduced);
  await renderGrid();
  const deck = await loadDeck('trending');
  show(deck[Math.floor(Math.random() * deck.length)], false);
}

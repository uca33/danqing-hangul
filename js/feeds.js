// 新闻 / 视频板块:读取 data/news.json、data/videos.json(由每日任务写入)
const $ = (s) => document.querySelector(s);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}
async function loadJSON(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}
function fmtDate(s) {
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function list(title, items, render) {
  if (!Array.isArray(items) || !items.length) return null;
  const box = el('div');
  box.append(el('h4', null, title));
  const ul = el('ul');
  items.forEach((x) => {
    const li = el('li');
    render(li, x);
    ul.append(li);
  });
  box.append(ul);
  return box;
}

function newsNode(n) {
  const art = el('article', 'news-item');
  const meta = el('div', 'meta mono');
  meta.append(el('span', null, n.source || ''), el('span', null, fmtDate(n.publishedAt)));
  const h = el('h3');
  h.lang = 'ko';
  const url = safeUrl(n.url);
  if (url) {
    const a = el('a', null, n.title);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    h.append(a);
  } else h.textContent = n.title;
  art.append(meta, h);
  if (n.summary) art.append(el('p', null, n.summary));
  const an = n.analysis;
  if (an) {
    const d = el('details');
    d.append(el('summary', null, '展开解析:词汇 · 语法 · 表达'));
    const g = el('div', 'an-grid');
    const parts = [
      list('词汇', an.vocab, (li, v) => (li.textContent = v.kr + ' — ' + v.zh)),
      list('语法', an.grammar, (li, v) => (li.textContent = v.pattern + ':' + v.explain + (v.example ? '(例:' + v.example + ')' : ''))),
      list('表达', an.expressions, (li, v) => (li.textContent = v.kr + ' — ' + v.zh)),
      list('热点', an.hot, (li, v) => (li.textContent = typeof v === 'string' ? v : v.kr + ' — ' + v.zh)),
    ].filter(Boolean);
    parts.forEach((p) => g.append(p));
    d.append(g);
    if (an.level) d.append(el('p', 'basis', '难度估计:' + an.level));
    d.append(el('p', 'basis', '依据:' + (an.basis || '标题与 RSS 摘要') + '(未读全文,请以原文为准)'));
    art.append(d);
  }
  return art;
}

function videoNode(v) {
  const box = el('article', 'vid');
  const id = /^[\w-]{11}$/.test(v.videoId || '') ? v.videoId : null;
  if (id) {
    const t = el('button', 'thumb');
    t.type = 'button';
    t.setAttribute('aria-label', '播放:' + v.title);
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    t.append(img);
    t.addEventListener('click', () => {
      const f = el('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      f.title = v.title;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      t.replaceWith(f);
    });
    box.append(t);
  }
  const cap = el('div', 'cap');
  const meta = el('div', 'meta mono');
  meta.append(el('span', null, v.source || ''), el('span', null, fmtDate(v.publishedAt)));
  const h = el('h3', null, v.title);
  h.lang = 'ko';
  cap.append(meta, h);
  if (v.note) cap.append(el('p', null, v.note));
  box.append(cap);
  return box;
}

export async function initFeeds() {
  const [news, videos] = await Promise.all([loadJSON('data/news.json'), loadJSON('data/videos.json')]);
  const nl = $('#news-list');
  const vl = $('#video-list');
  nl.replaceChildren(...news.slice(0, 30).map(newsNode));
  vl.replaceChildren(...(videos.length ? videos.slice(0, 24).map(videoNode) : CHANNELS.map(channelNode)));
}

// YouTube 已不再提供可抓取的频道 RSS,因此没有 videos.json 数据时,直接嵌入官方频道的「最新上传」播放列表
const CHANNELS = [
  { source: 'KBS 뉴스', id: 'UCcQTRi69dsVYHN3exePtZ1A' },
  { source: 'MBC 뉴스', id: 'UCF4Wxdo3inmxP-Y59wXDsFw' },
  { source: 'YTN', id: 'UChlgI3UHCOnwUGzWzbJ3H5w' },
  { source: '연합뉴스TV', id: 'UCTHCOPwqNfZ0uiKOvFyhGwg' },
];

function channelNode(c) {
  const box = el('article', 'vid');
  const t = el('button', 'thumb');
  t.type = 'button';
  t.setAttribute('aria-label', '播放 ' + c.source + ' 最新视频');
  t.append(el('span', 'mono', '▶ ' + c.source + ' · 最新上传'));
  t.addEventListener('click', () => {
    const f = el('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/videoseries?list=UU' + c.id.slice(2) + '&rel=0';
    f.title = c.source + ' 最新上传';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    t.replaceWith(f);
  });
  box.append(t);
  const cap = el('div', 'cap');
  const meta = el('div', 'meta mono');
  meta.append(el('span', null, c.source), el('span', null, '官方频道'));
  const h = el('h3', null, c.source + ' 官方频道最新视频');
  h.lang = 'ko';
  cap.append(meta, h);
  box.append(cap);
  return box;
}

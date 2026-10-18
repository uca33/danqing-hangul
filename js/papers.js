// 论文板块:读取 data/papers.json(由每日任务写入),按推送日期分组,可按领域筛选
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
const todayKST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

function block(title, body) {
  if (!body) return null;
  const d = el('div', 'pb');
  d.append(el('h4', null, title), el('p', null, body));
  return d;
}

function paperNode(p) {
  const art = el('article', 'paper');
  const meta = el('div', 'p-meta');
  meta.append(el('span', 'badge src', p.source || ''), el('span', 'badge oa', '免费全文'));
  if (p.field) meta.append(el('span', 'badge', p.field));
  if (p.analysis?.level) meta.append(el('span', 'badge', p.analysis.level));

  const h = el('h3');
  h.lang = 'ko';
  const url = safeUrl(p.url);
  if (url) {
    const a = el('a', null, p.title);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    h.append(a);
  } else h.textContent = p.title;

  const by = el('p', 'p-by');
  const parts = [(p.authors || []).join(', '), [p.journal, p.year, p.volume && p.volume + '권', p.issue && p.issue + '호'].filter(Boolean).join(' · ')].filter(Boolean);
  by.textContent = parts.join(' — ');
  by.lang = 'ko';
  art.append(meta, h, by);

  const an = p.analysis;
  if (an) {
    art.append(el('p', 'p-sum', an.summary));
    const d = el('details');
    d.append(el('summary', null, '展开解析:问题 · 方法 · 发现 · 术语'));
    const g = el('div', 'p-grid');
    [block('研究问题', an.question), block('研究方法', an.method), block('主要发现', an.findings), block('阅读价值', an.why)]
      .filter(Boolean)
      .forEach((b) => g.append(b));
    if (an.terms?.length) {
      const t = el('div', 'pb');
      t.append(el('h4', null, '核心术语'));
      const ul = el('ul');
      an.terms.forEach((x) => {
        const li = el('li');
        const k = el('span', 'tk', x.kr);
        k.lang = 'ko';
        li.append(k, document.createTextNode(' — ' + x.zh));
        ul.append(li);
      });
      t.append(ul);
      g.append(t);
    }
    d.append(g);
    if (an.caveat) d.append(el('p', 'p-cav', '提示:' + an.caveat));
    d.append(el('p', 'p-basis', '依据:' + (an.basis || '作者摘要') + '(未读全文)'));
    art.append(d);
  } else {
    art.append(el('p', 'p-sum muted', '中文解析生成中,稍后补充。'));
  }

  if (url) {
    const act = el('p', 'p-act');
    const a = el('a', 'btn btn-small', '打开原文 ↗');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    act.append(a);
    art.append(act);
  }
  return art;
}

let all = [];
let field = '全部';

function render() {
  const list = $('#paper-list');
  const items = all.filter((p) => field === '全部' || p.field === field || (p.fields || []).includes(field));
  list.replaceChildren();
  const today = todayKST();
  let day = '';
  items.slice(0, 60).forEach((p) => {
    if (p.pushedAt !== day) {
      day = p.pushedAt;
      const h = el('h3', 'day mono', day + (day === today ? ' · 今日推送' : ''));
      list.append(h);
    }
    list.append(paperNode(p));
  });
  if (!items.length && all.length) list.append(el('p', 'res-msg', '这个领域暂时没有论文。'));
}

export async function initPapers() {
  all = await loadJSON('data/papers.json');
  if (!all.length) return;
  $('#paper-note').hidden = false;
  const fields = ['全部', ...new Set(all.map((p) => p.field).filter(Boolean))];
  const chips = $('#paper-chips');
  chips.hidden = fields.length < 3;
  fields.forEach((f) => {
    const b = el('button', null, f);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(f === field));
    b.addEventListener('click', () => {
      field = f;
      chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
    chips.append(b);
  });
  render();
}

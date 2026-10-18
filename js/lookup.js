// 查词:站内词库即时匹配(零成本)+ 访客自带 Key 的 AI 分析
import { loadDeck } from './cards.js';

const $ = (s) => document.querySelector(s);
const MAX = 2000;

const DEFAULT_MODEL = { gemini: 'gemini-2.5-flash', anthropic: 'claude-haiku-5-5' };

const SYSTEM = `你是面向中文母语学习者的韩语老师。用户会输入韩语(可能是单词、语法、句子,或一整段文字)。
只输出一个 JSON 对象,不要输出任何其他文字或代码块标记。结构如下:
{
 "type": "word | grammar | sentence | passage",
 "summary": "整体意思的中文翻译或释义",
 "items": [
  {
   "kind": "word | grammar | expression | sentence",
   "focus": true 或 false,
   "text": "韩语原文片段",
   "base": "原形/基本形(没有则为空字符串)",
   "meaning": "中文释义",
   "usage": "用法、接续方式、语气(敬语/半语/口语/书面)、与相近表达的区别",
   "examples": [{"kr": "韩语例句", "zh": "中文翻译"}]
  }
 ],
 "note": "需要提醒的地方,例如原文的错误和更自然的说法;没有则为空字符串"
}
要求:
1. 输入是一段文字时,拆出值得学习的词汇、语法点和固定表达,并把最可能是用户想查的项目放在最前,标 focus 为 true。
2. 每项给出 1 到 2 个自然的例句,并附中文翻译。
3. 语法项要写清接续方式,并与相近语法对比。
4. 输入不是韩语或有明显错误时,在 note 里指出并给出更自然的说法。
5. 不确定的内容要明确写出不确定,不要编造。`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function safeStore(kind) {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
function getKeyStored() {
  for (const k of ['session', 'local']) {
    const s = safeStore(k);
    try {
      const v = s && s.getItem('dq.key');
      if (v) return { key: v, remembered: k === 'local' };
    } catch {}
  }
  return { key: '', remembered: false };
}
function storeKey(key, remember) {
  for (const k of ['session', 'local']) {
    try {
      const s = safeStore(k);
      if (s) s.removeItem('dq.key');
    } catch {}
  }
  if (!key) return;
  try {
    const s = safeStore(remember ? 'local' : 'session');
    if (s) s.setItem('dq.key', key);
  } catch {}
}
function getPref(name, fallback) {
  try {
    return localStorage.getItem('dq.' + name) || fallback;
  } catch {
    return fallback;
  }
}
function setPref(name, v) {
  try {
    localStorage.setItem('dq.' + name, v);
  } catch {}
}

function variants(kr) {
  const out = [];
  kr.split(/\s*\/\s*/).forEach((part) => {
    const m = part.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (m) out.push(m[1].trim(), m[2].trim());
    else out.push(part.trim());
  });
  return out.filter(Boolean);
}

function localSearch(text, cards) {
  const q = text.trim();
  const ql = q.toLowerCase();
  const scored = [];
  cards.forEach((c) => {
    const vs = variants(c.kr);
    let s = 0;
    if (vs.some((v) => v === q)) s = 100;
    else if (vs.some((v) => v.length >= 2 && q.includes(v))) s = 70 + Math.max(...vs.filter((v) => q.includes(v)).map((v) => v.length));
    else if (q.length >= 2 && vs.some((v) => v.includes(q))) s = 60;
    else if (q.length >= 2 && (c.zh.includes(q) || c.origin.includes(q))) s = 40;
    else if (q.length >= 2 && c.ex.some(([k]) => k.includes(q))) s = 30;
    else if (ql.length >= 2 && c.note.toLowerCase().includes(ql)) s = 10;
    if (s) scored.push([s, c]);
  });
  return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

function itemNode(it, focus) {
  const box = el('article', 'item' + (focus ? ' focus' : ''));
  const top = el('div', 'top');
  top.append(el('span', 'kind', (it.kind || 'item').toUpperCase()));
  const kr = el('span', 'kr', it.text || it.kr || '');
  kr.lang = 'ko';
  top.append(kr);
  if (it.base && it.base !== it.text) top.append(el('span', 'base', '原形:' + it.base));
  box.append(top);
  const meaning = it.meaning || it.zh;
  if (meaning) box.append(el('p', 'mean', meaning));
  const use = it.usage || it.note;
  if (use) box.append(el('p', 'use', use));
  const ex = it.examples || (it.ex || []).map(([k, z]) => ({ kr: k, zh: z }));
  if (ex.length) {
    const ul = el('ul');
    ex.forEach((e) => {
      const li = el('li');
      const k = el('p', 'k', e.kr);
      k.lang = 'ko';
      li.append(k, el('p', 'z', e.zh));
      ul.append(li);
    });
    box.append(ul);
  }
  return box;
}

const result = () => $('#result');
function msg(text, cls = '') {
  result().replaceChildren(el('div', 'res-msg ' + cls, text));
}

async function runLocal() {
  const q = $('#q').value.trim();
  if (!q) return msg('先输入一些韩语。');
  const cards = [...(await loadDeck('trending')), ...(await loadDeck('daily'))];
  const hits = localSearch(q, cards);
  const box = result();
  box.replaceChildren();
  if (!hits.length) {
    box.append(el('div', 'res-msg', '站内词库里没有找到相关条目。想要完整的词汇和语法拆解,请在下方“AI 分析设置”里填入你自己的 Key,再点“AI 分析”。'));
    return;
  }
  const head = el('p', 'res-head');
  head.append(el('h3', null, '站内词库命中 ' + hits.length + ' 条'));
  box.append(head);
  hits.slice(0, 12).forEach((c, i) => box.append(itemNode({ ...c, text: c.kr, kind: 'word' }, i === 0)));
  box.append(el('div', 'res-msg', '站内词库只覆盖已收录的流行语和生活词汇。其他内容可用“AI 分析”。'));
}

function parseJSON(raw) {
  let t = String(raw).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

async function callProvider(provider, model, key, input, signal) {
  if (provider === 'gemini') {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096 },
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data?.error?.message);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || '').join('');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: input }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res.status, data?.error?.message);
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function httpError(status, detail) {
  const map = {
    400: '请求被拒绝(400),请检查模型名称是否正确。',
    401: 'Key 无效或已过期(401)。',
    403: 'Key 没有权限使用这个模型(403)。',
    404: '找不到这个模型(404),请检查模型名称。',
    429: '请求太频繁或免费额度用完了(429),请稍后再试。',
  };
  const e = new Error((map[status] || '服务出错(' + status + ')。') + (detail ? ' 服务商返回:' + String(detail).slice(0, 160) : ''));
  e.status = status;
  return e;
}

function renderAI(data) {
  const box = result();
  box.replaceChildren();
  if (!data || !Array.isArray(data.items)) throw new Error('返回内容格式不对');
  if (data.summary) {
    const s = el('div', 'res-summary');
    s.append(el('p', 'lab', 'SUMMARY / 整体意思'), el('p', null, data.summary));
    box.append(s);
  }
  data.items.forEach((it) => box.append(itemNode(it, !!it.focus)));
  if (data.note) box.append(el('div', 'res-msg', '提示:' + data.note));
  box.append(el('div', 'res-msg', 'AI 生成内容可能有误,重要用法请再核对词典或母语者。'));
}

let controller = null;
async function runAI() {
  const input = $('#q').value.trim();
  if (!input) return msg('先输入一些韩语。');
  const provider = $('#provider').value;
  const model = $('#model').value.trim() || DEFAULT_MODEL[provider];
  const key = $('#key').value.trim();
  if (!key) {
    $('#settings').open = true;
    $('#key').focus();
    return msg('AI 分析需要你自己的 API Key。展开上方设置填入即可,Key 只保存在你的浏览器里。', 'err');
  }
  storeKey(key, $('#remember').checked);
  setPref('provider', provider);
  setPref('model:' + provider, model);
  if (controller) controller.abort();
  controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const btn = $('#btn-ai');
  btn.disabled = true;
  msg('正在分析……', 'busy');
  try {
    const raw = await callProvider(provider, model, key, input, controller.signal);
    renderAI(parseJSON(raw));
  } catch (e) {
    if (e.name === 'AbortError') msg('请求超时或已取消,请重试。', 'err');
    else if (e instanceof SyntaxError || /格式/.test(e.message)) msg('模型返回的内容无法解析,请重试一次。', 'err');
    else if (e.status) msg(e.message, 'err');
    else msg('网络出错,没能连上服务商。请检查网络后重试。', 'err');
  } finally {
    clearTimeout(timer);
    btn.disabled = false;
  }
}

export function initLookup() {
  const q = $('#q');
  q.addEventListener('input', () => ($('#q-count').textContent = [...q.value].length));
  $('#lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runLocal();
  });
  $('#btn-ai').addEventListener('click', runAI);

  const provider = $('#provider');
  const model = $('#model');
  provider.value = getPref('provider', 'gemini');
  const syncModel = () => {
    model.value = getPref('model:' + provider.value, DEFAULT_MODEL[provider.value]);
  };
  syncModel();
  provider.addEventListener('change', syncModel);

  const stored = getKeyStored();
  if (stored.key) {
    $('#key').value = stored.key;
    $('#remember').checked = stored.remembered;
  }
  $('#btn-clear-key').addEventListener('click', () => {
    storeKey('', false);
    $('#key').value = '';
    $('#remember').checked = false;
    msg('已清除保存的 Key。');
  });
}

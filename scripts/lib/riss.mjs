// RISS Open API(可选)。端点与字段取自公开的第三方封装,尚未用真实密钥验证:
// 首次运行请开启 RISS_DEBUG=1,在日志里核对字段;如与实际不符,只需改这个文件。
import { parseXml, find, findAll, childrenOf } from './xml.mjs';
import { fetchText, redact } from './util.mjs';

export const RISS_URL = 'https://www.riss.kr/openApi';

function strip(name) {
  return name.replace(/^riss\./i, '').toLowerCase();
}

/** metadata 子节点 → {字段名: 文本}(字段名去掉 riss. 前缀并转小写) */
export function parseRissMetadata(meta) {
  const o = {};
  for (const c of meta.children) {
    const k = strip(c.name);
    if (o[k]) o[k] += ';' + c.text;
    else o[k] = c.text;
  }
  return o;
}

/** 是否可免费下载全文:image=Y(有原文)且 charge=1(免费) */
export function isFreeRiss(o) {
  return (o.image || '').toUpperCase() === 'Y' && String(o.charge || '') === '1';
}

export function parseRissResponse(xml) {
  const root = parseXml(xml);
  const head = find(root, 'head');
  const err = head ? find(head, 'Error') : null;
  if (err && !['0', '000', ''].includes(err.text)) {
    const msg = find(head, 'ErrorMessage')?.text || err.text;
    throw new Error('RISS 返回错误:' + msg);
  }
  const metas = findAll(root, 'metadata');
  return metas.map((m) => {
    const o = parseRissMetadata(m);
    const authors = (o.author || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const abstract = o.abstract || o.abstractdesc || o.description || '';
    return {
      id: o.control_no || o.controlno || o.url || o.title,
      source: 'RISS',
      title: o.title || '',
      titleEn: '',
      authors,
      journal: o.stitle || '',
      publisher: o.publisher || '',
      year: (o.pubdate || '').slice(0, 4),
      month: '',
      volume: '',
      issue: '',
      pages: '',
      doi: '',
      url: o.url || '',
      category: o.subject || '',
      openAccess: isFreeRiss(o),
      abstractKo: abstract,
      abstractEn: '',
      citations: 0,
      _raw: o,
    };
  });
}

export async function rissSearch(key, { keyword, rsnum = 1, rowcount = 50 }) {
  const u = new URL(RISS_URL);
  u.searchParams.set('key', key);
  u.searchParams.set('version', '1.0');
  u.searchParams.set('type', 'A'); // A = 国内学术论文
  u.searchParams.set('keyword', keyword);
  u.searchParams.set('rsnum', String(rsnum));
  u.searchParams.set('rowcount', String(rowcount));
  const xml = await fetchText(u.href, { retries: 1, headers: { accept: 'application/xml' } }).catch((e) => {
    throw new Error('RISS 请求失败:' + redact(e.message));
  });
  if (process.env.RISS_DEBUG) console.log('[RISS_DEBUG] 响应前 800 字符:\n' + xml.slice(0, 800));
  return parseRissResponse(xml);
}

// KCI(한국학술지인용색인)Open API 封装。接口说明见 README。
// 文档来源:open.kci.go.kr 的 openApiSearch.kci。字段名以官方 XML 为准(解析时尽量容错)。
import { parseXml, find, findAll, child, childrenOf, textOf } from './xml.mjs';
import { fetchText, redact } from './util.mjs';

export const KCI_URL = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';

export function buildKciUrl(params) {
  const u = new URL(KCI_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.href;
}

function pickLang(nodes, ...langs) {
  for (const l of langs) {
    const n = nodes.find((x) => (x.attrs.lang || '').toLowerCase() === l);
    if (n && n.text) return n.text;
  }
  return nodes.find((x) => x.text)?.text || '';
}

function authorName(t) {
  return t.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** 解析一个 <record> 节点为统一的论文对象 */
export function parseKciRecord(rec) {
  const j = child(rec, 'journalInfo');
  const a = child(rec, 'articleInfo');
  if (!a) return null;
  const titles = childrenOf(child(a, 'title-group'), 'article-title');
  const abstracts = childrenOf(child(a, 'abstract-group'), 'abstract');
  const authors = childrenOf(child(a, 'author-group'), 'author').map((x) => authorName(x.text)).filter(Boolean);
  const cit = child(a, 'citation-count');
  const articleId = a.attrs['article-id'] || '';
  return {
    id: articleId ? 'kci:' + articleId : '',
    source: 'KCI',
    title: pickLang(titles, 'original', 'foreign', 'english'),
    titleEn: pickLang(titles, 'english'),
    authors,
    journal: textOf(j, 'journal-name'),
    publisher: textOf(j, 'publisher-name'),
    year: textOf(j, 'pub-year'),
    month: textOf(j, 'pub-mon'),
    volume: textOf(j, 'volume'),
    issue: textOf(j, 'issue'),
    pages: [textOf(a, 'fpage'), textOf(a, 'lpage')].filter(Boolean).join('–'),
    doi: textOf(a, 'doi'),
    url: textOf(a, 'url'),
    category: textOf(a, 'article-categories'),
    openAccess: textOf(a, 'orte-open-yn').toUpperCase() === 'Y',
    abstractKo: pickLang(abstracts, 'original'),
    abstractEn: pickLang(abstracts, 'english'),
    citations: Number(cit?.attrs?.kci || 0) || 0,
  };
}

/** 解析搜索响应。出错时抛异常(密钥问题、参数问题等)。 */
export function parseKciResponse(xml) {
  const root = parseXml(xml);
  const records = findAll(root, 'record');
  const totalNode = find(root, 'total');
  const total = totalNode ? Number(totalNode.text) || 0 : records.length;
  if (!records.length) {
    // KCI 的出错信息放在 MetaData 下的文字里
    const errNode = findAll(root, 'error')[0] || findAll(root, 'errorMessage')[0] || findAll(root, 'message')[0];
    const body = errNode?.text || '';
    if (/key|키|인증|apiCode|필수|expired|만료/i.test(body)) throw new Error('KCI 返回错误:' + body.slice(0, 200));
  }
  return { total, papers: records.map(parseKciRecord).filter((p) => p && p.id) };
}

let lastKci = 0;
async function throttle(ms = 600) {
  const w = lastKci + ms - Date.now();
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  lastKci = Date.now();
}

export async function kciSearch(key, params) {
  await throttle();
  const url = buildKciUrl({ apiCode: 'articleSearch', key, displayCount: 100, page: 1, ...params });
  const xml = await fetchText(url, { retries: 2 }).catch((e) => {
    throw new Error('KCI 请求失败:' + redact(e.message));
  });
  return parseKciResponse(xml);
}

export async function kciDetail(key, articleId) {
  await throttle();
  const url = buildKciUrl({ apiCode: 'articleDetail', key, id: articleId });
  const xml = await fetchText(url, { retries: 2 });
  const root = parseXml(xml);
  const rec = findAll(root, 'record')[0] || find(root, 'MetaData');
  const p = rec ? parseKciRecord(rec) : null;
  return p;
}

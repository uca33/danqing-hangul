// 论文的相关性判断、每日挑选、AI 摘要分析(纯函数为主,便于测试)
import { clip, normTitle } from './util.mjs';
import { geminiJSON } from './gemini.mjs';

function countHits(text, patterns) {
  const t = text || '';
  let n = 0;
  for (const p of patterns) if (t.includes(p)) n++;
  return n;
}

/** 判断论文是否属于国语学/国文学/融合领域,并给出得分 */
export function classify(p, cfg) {
  const title = `${p.title} ${p.titleEn}`;
  const abs = `${p.abstractKo} ${p.abstractEn}`;
  const per = cfg.fields.map((f) => {
    const t = countHits(title, f.patterns);
    const c = countHits(p.category, f.patterns);
    const a = countHits(abs, f.patterns);
    return { name: f.name, t, c, a, s: 2 * t + c + 0.4 * a };
  });
  const relevant = per.some((x) => x.t >= 1 || x.c >= 1 || x.a >= 3);
  const hit = per.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  let score = hit.reduce((s, x) => s + x.s, 0);
  if (countHits(p.category, cfg.categoryBonus || []) > 0) score += 1;
  if ((p.abstractKo + p.abstractEn).length >= cfg.minAbstractChars) score += 1;
  const y = Number(p.year) || 0;
  if (y >= new Date().getFullYear() - 1) score += 0.5;
  return { relevant, score, fields: hit.map((x) => x.name), field: hit[0]?.name || '' };
}

export function isEligible(p, cfg, seen, seenTitles) {
  if (!p.id || !p.title || !p.url && !p.doi) return false;
  if (!p.openAccess) return false;
  if ((p.abstractKo + p.abstractEn).trim().length < cfg.minAbstractChars) return false;
  if (seen.has(p.id) || seenTitles.has(normTitle(p.title))) return false;
  return classify(p, cfg).relevant;
}

/** 合并多来源候选:同标题只留一个,优先 KCI(摘要更全) */
export function mergeCandidates(list) {
  const byTitle = new Map();
  for (const p of list) {
    const k = normTitle(p.title);
    const cur = byTitle.get(k);
    if (!cur || (cur.source !== 'KCI' && p.source === 'KCI')) byTitle.set(k, p);
  }
  return [...byTitle.values()];
}

/** 按得分挑选,同一期刊最多 maxPerJournal 篇 */
export function pickDaily(cands, cfg, n) {
  const scored = cands
    .map((p) => ({ p, c: classify(p, cfg) }))
    .sort((a, b) => b.c.score - a.c.score || (Number(b.p.year) || 0) - (Number(a.p.year) || 0));
  const out = [];
  const perJournal = new Map();
  for (const { p, c } of scored) {
    if (out.length >= n) break;
    const j = p.journal || '?';
    if ((perJournal.get(j) || 0) >= (cfg.maxPerJournal || 2)) continue;
    perJournal.set(j, (perJournal.get(j) || 0) + 1);
    out.push({ ...p, field: c.field, fields: c.fields });
  }
  return out;
}

/** 存入 data/papers.json 的公开字段(不保存摘要原文) */
export function toPublic(p, pushedAt) {
  const doiUrl = p.doi ? 'https://doi.org/' + p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : '';
  return {
    id: p.id,
    source: p.source,
    title: p.title,
    titleEn: p.titleEn || '',
    authors: (p.authors || []).slice(0, 6),
    journal: p.journal || '',
    year: p.year || '',
    volume: p.volume || '',
    issue: p.issue || '',
    pages: p.pages || '',
    doi: p.doi || '',
    url: p.url || doiUrl,
    openAccess: true,
    field: p.field || '',
    fields: p.fields || [],
    citations: p.citations || 0,
    pushedAt,
    analysis: null,
    analysisTries: 0,
  };
}

/* ───────── AI 摘要分析 ───────── */
const SYSTEM = `你是韩国语言文学领域的研究助理,为中文读者概括韩语学术论文。
只依据用户给出的论文信息(标题、期刊、作者摘要)作答,不得编造摘要里没有的数据、结论或方法;摘要没有提到的内容写“摘要未说明”。
只输出一个 JSON 对象,不要有其他文字。结构:
{
 "summary": "3到4句中文概述:研究什么、怎么做、得出什么",
 "question": "研究问题(一句话)",
 "method": "研究方法或研究材料(一句话)",
 "findings": "主要发现(1到2句)",
 "terms": [{"kr": "韩语学术术语", "zh": "中文释义"}],
 "field": "国语学 | 国文学 | 融合研究",
 "level": "入门 | 进阶 | 专业",
 "why": "对韩语学习者或研究者的价值(1到2句)",
 "caveat": "信息不足之处;没有则为空字符串"
}
terms 给 4 到 6 个论文里最核心的学术术语,韩语原词加中文释义。`;

export function buildPaperPrompt(p) {
  return [
    `标题:${p.title}`,
    p.titleEn ? `英文标题:${p.titleEn}` : '',
    `期刊:${p.journal} ${p.year}${p.volume ? ' 卷' + p.volume : ''}${p.issue ? ' 号' + p.issue : ''}`,
    p.authors?.length ? `作者:${p.authors.slice(0, 4).join(', ')}` : '',
    p.category ? `学科分类:${p.category}` : '',
    p.abstractKo ? `作者摘要(韩语):\n${clip(p.abstractKo, 2500)}` : '',
    p.abstractEn ? `作者摘要(英语):\n${clip(p.abstractEn, 2500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const str = (v, max) => (typeof v === 'string' ? clip(v.trim(), max) : '');

export function normalizeAnalysis(o) {
  if (!o || typeof o !== 'object') return null;
  const terms = (Array.isArray(o.terms) ? o.terms : [])
    .map((t) => ({ kr: str(t?.kr, 40), zh: str(t?.zh, 60) }))
    .filter((t) => t.kr && t.zh)
    .slice(0, 8);
  const a = {
    summary: str(o.summary, 600),
    question: str(o.question, 200),
    method: str(o.method, 240),
    findings: str(o.findings, 360),
    terms,
    field: ['国语学', '国文学', '融合研究'].includes(o.field) ? o.field : '',
    level: ['入门', '进阶', '专业'].includes(o.level) ? o.level : '',
    why: str(o.why, 300),
    caveat: str(o.caveat, 240),
    basis: '作者摘要',
  };
  return a.summary ? a : null;
}

export async function analyzePaper(p) {
  const raw = await geminiJSON({ system: SYSTEM, user: buildPaperPrompt(p), maxOutputTokens: 2048 });
  return normalizeAnalysis(raw);
}

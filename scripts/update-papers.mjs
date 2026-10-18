#!/usr/bin/env node
// 每日论文推送:KCI(必需)+ RISS(可选)→ 筛选免费全文、国语学/国文学/融合领域 → AI 摘要 → data/papers.json
// 环境变量:KCI_API_KEY、RISS_API_KEY(可选)、GEMINI_API_KEY(可选)、PAPERS_PER_DAY、--dry-run
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, kstDate, ymd, addDays, addMonths, normTitle, log, warn, summary } from './lib/util.mjs';
import { kciSearch, kciDetail } from './lib/kci.mjs';
import { rissSearch } from './lib/riss.mjs';
import { hasGemini, NoKeyError } from './lib/gemini.mjs';
import { isEligible, mergeCandidates, pickDaily, toPublic, analyzePaper } from './lib/papers-core.mjs';

const P = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const PAPERS = P('../data/papers.json');
const dry = process.argv.includes('--dry-run');

async function main() {
  const cfg = await readJson(P('./config/papers.json'));
  const perDay = Number(process.env.PAPERS_PER_DAY || cfg.perDay);
  const kciKey = process.env.KCI_API_KEY;
  const rissKey = process.env.RISS_API_KEY;
  const today = kstDate();
  const archive = await readJson(PAPERS, []);
  const notes = [];

  if (!kciKey && !rissKey) {
    warn('没有设置 KCI_API_KEY 或 RISS_API_KEY,跳过论文更新。');
    await summary('### 论文\n未设置 KCI_API_KEY / RISS_API_KEY,已跳过。');
    return;
  }

  const seen = new Set(archive.map((p) => p.id));
  const seenTitles = new Set(archive.map((p) => normTitle(p.title)));
  const already = archive.filter((p) => p.pushedAt === today).length;
  const need = Math.max(0, perDay - already);
  let calls = 0;
  const budget = cfg.maxCallsPerRun;
  const pool = new Map();
  const add = (list) => list.forEach((p) => p.id && !pool.has(p.id) && pool.set(p.id, p));
  const eligible = () => mergeCandidates([...pool.values()].filter((p) => isEligible(p, cfg, seen, seenTitles)));

  if (need > 0 && kciKey) {
    const now = new Date();
    const windows = [{ from: ymd(addDays(now, -cfg.windowDays)), to: ymd(now), terms: cfg.terms }];
    // 近期没有足够新论文时,按 60 天一段向前回溯
    let end = addDays(now, -cfg.windowDays - 1);
    const limit = addMonths(now, -cfg.backfillMonths);
    while (end > limit && windows.length < 14) {
      const start = addDays(end, -60);
      windows.push({ from: ymd(start), to: ymd(end), terms: cfg.terms.slice(0, 10) });
      end = addDays(start, -1);
    }
    let keywordMode = true;
    outer: for (const [wi, w] of windows.entries()) {
      for (const term of w.terms) {
        if (calls >= budget) break outer;
        try {
          calls++;
          const r = await kciSearch(kciKey, { title: term, regDateFrom: w.from, regDateTo: w.to });
          add(r.papers);
          if (wi === 0 && keywordMode && calls < budget) {
            calls++;
            try {
              add((await kciSearch(kciKey, { title: undefined, keyword: term, regDateFrom: w.from, regDateTo: w.to })).papers);
            } catch (e) {
              keywordMode = false; // 该参数组合不被接受,本次运行不再尝试
              notes.push('keyword 检索不可用:' + e.message.slice(0, 80));
            }
          }
        } catch (e) {
          warn(`KCI 检索「${term}」失败:${e.message}`);
          if (/key|키|인증|만료/i.test(e.message)) {
            notes.push('KCI 密钥问题:' + e.message.slice(0, 120));
            break outer;
          }
        }
      }
      if (eligible().length >= need * 3) break;
    }
    log(`KCI:${calls} 次请求,候选 ${pool.size} 篇,符合条件 ${eligible().length} 篇`);
  }

  if (need > 0 && rissKey) {
    for (const term of cfg.terms.slice(0, 8)) {
      try {
        add((await rissSearch(rissKey, { keyword: term, rowcount: 50 })).map(({ _raw, ...p }) => p));
      } catch (e) {
        warn(`RISS 检索「${term}」失败:${e.message}`);
        notes.push('RISS:' + e.message.slice(0, 100));
        break;
      }
    }
  }

  const picked = need > 0 ? pickDaily(eligible(), cfg, need) : [];
  log(`今天已有 ${already} 篇,需要 ${need} 篇,选出 ${picked.length} 篇`);

  const fresh = [];
  for (const p of picked) {
    const item = toPublic(p, today);
    if (hasGemini()) {
      try {
        item.analysis = await analyzePaper(p);
        item.analysisTries = 1;
        if (item.analysis?.field) item.field = item.analysis.field;
      } catch (e) {
        warn(`摘要分析失败「${p.title.slice(0, 30)}」:${e.message}`);
        item.analysisTries = 1;
      }
    }
    fresh.push(item);
  }

  // 补做之前失败的摘要分析(最多 3 次),需要重新取摘要
  let retried = 0;
  if (hasGemini() && kciKey) {
    for (const item of archive) {
      if (item.analysis || item.analysisTries >= 3 || item.source !== 'KCI' || retried >= 3) continue;
      try {
        const detail = await kciDetail(kciKey, item.id.replace(/^kci:/, ''));
        if (detail && (detail.abstractKo || detail.abstractEn)) {
          item.analysis = await analyzePaper({ ...item, ...detail, id: item.id });
        }
      } catch (e) {
        warn(`补做分析失败 ${item.id}:${e.message}`);
      }
      item.analysisTries = (item.analysisTries || 0) + 1;
      retried++;
    }
  }

  const next = [...fresh, ...archive].sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : a.pushedAt > b.pushedAt ? -1 : 0)).slice(0, cfg.keepMax);
  const withAnalysis = fresh.filter((x) => x.analysis).length;
  if (dry) {
    log(JSON.stringify(fresh, null, 1));
    log('(dry-run,未写入文件)');
  } else if (fresh.length || retried) {
    await writeJson(PAPERS, next);
  }
  if (need > 0 && picked.length < need) notes.push(`只找到 ${picked.length}/${need} 篇符合条件的免费论文`);
  await summary(
    `### 论文\n- 今日新增 ${fresh.length} 篇(含摘要分析 ${withAnalysis} 篇),补做分析 ${retried} 篇\n- 请求 ${calls} 次,候选 ${pool.size} 篇\n${notes.map((n) => '- ⚠️ ' + n).join('\n')}`,
  );
  if (!hasGemini()) log('提示:未设置 GEMINI_API_KEY,论文只写入了题录信息,没有摘要分析。');
}

main().catch((e) => {
  if (e instanceof NoKeyError) return;
  console.error(e);
  process.exitCode = 1;
});

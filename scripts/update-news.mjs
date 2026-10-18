#!/usr/bin/env node
// 每日新闻:读取各媒体 RSS → 选新条目 → AI 词汇/语法/表达解析 → data/news.json
// 只使用 RSS 里公开的标题与摘要,不抓取文章全文。单个源失败不影响其它源。
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, fetchText, clip, log, warn, summary, addDays } from './lib/util.mjs';
import { parseFeed } from './lib/feed.mjs';
import { selectItems, analyzeNews } from './lib/news-core.mjs';
import { hasGemini } from './lib/gemini.mjs';

const P = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const NEWS = P('../data/news.json');
const dry = process.argv.includes('--dry-run');

async function main() {
  const cfg = await readJson(P('./config/feeds.json'));
  const archive = await readJson(NEWS, []);
  const seenLinks = new Set(archive.map((n) => n.url));
  const cap = Number(process.env.NEWS_PER_DAY || cfg.newsPerDay);
  const now = new Date();
  const picks = [];
  const report = [];

  for (const f of cfg.news) {
    if (f.enabled === false) continue;
    try {
      const xml = await fetchText(f.url, { retries: 1, timeout: 20000, headers: { accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      const items = parseFeed(xml);
      const sel = selectItems(items, { seenLinks, now, maxAgeDays: cfg.maxAgeDays, perFeed: f.perFeed });
      sel.forEach((x) => picks.push({ ...x, source: f.source }));
      report.push(`✅ ${f.source}:${items.length} 条,选 ${sel.length}`);
    } catch (e) {
      warn(`${f.source} 读取失败:${e.message}`);
      report.push(`❌ ${f.source}:${String(e.message).slice(0, 80)}`);
    }
  }

  const chosen = picks.slice(0, cap);
  const fresh = [];
  for (const p of chosen) {
    let ai = null;
    if (hasGemini()) {
      try {
        ai = await analyzeNews(p);
      } catch (e) {
        warn(`解析失败「${p.title.slice(0, 24)}」:${e.message}`);
      }
    }
    fresh.push({
      source: p.source,
      title: p.title,
      url: p.link,
      publishedAt: p.date || now.toISOString(),
      summary: ai ? ai.summary : clip(p.summary, 120),
      summaryLang: ai ? 'zh' : 'ko',
      analysis: ai ? ai.analysis : null,
    });
  }

  const minTime = addDays(now, -cfg.keepDays).getTime();
  const next = [...fresh, ...archive]
    .filter((n) => new Date(n.publishedAt).getTime() >= minTime)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, cfg.keepMax);

  log(`新闻:新增 ${fresh.length} 条(含解析 ${fresh.filter((x) => x.analysis).length} 条)`);
  if (dry) log(JSON.stringify(fresh, null, 1));
  else if (fresh.length || next.length !== archive.length) await writeJson(NEWS, next);
  await summary(`### 新闻\n- 新增 ${fresh.length} 条\n${report.map((r) => '- ' + r).join('\n')}${hasGemini() ? '' : '\n- ⚠️ 未设置 GEMINI_API_KEY,只写入了标题与摘要'}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

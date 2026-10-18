#!/usr/bin/env node
// 每日视频新闻:读取官方 YouTube 频道的 RSS 订阅源 → data/videos.json(只存标题、ID、时间,页面里用官方嵌入播放)
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, fetchText, log, warn, summary, addDays } from './lib/util.mjs';
import { parseYouTubeFeed } from './lib/feed.mjs';

const P = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const VIDEOS = P('../data/videos.json');
const dry = process.argv.includes('--dry-run');

/** 从一个频道的视频里挑新的:去掉已有、Shorts、过旧 */
export function selectVideos(videos, { seen, now = new Date(), maxAgeDays = 3, perChannel = 2 }) {
  const minTime = now.getTime() - maxAgeDays * 86400000;
  return videos
    .filter((v) => !seen.has(v.videoId))
    .filter((v) => !/#shorts/i.test(v.title))
    .filter((v) => !v.date || new Date(v.date).getTime() >= minTime)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, perChannel);
}

async function main() {
  const cfg = (await readJson(P('./config/feeds.json'))).videos;
  const archive = await readJson(VIDEOS, []);
  const seen = new Set(archive.map((v) => v.videoId));
  const now = new Date();
  const fresh = [];
  const report = [];

  for (const ch of cfg.channels) {
    try {
      const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.channelId)}`, { retries: 4, timeout: 20000 });
      const { channelTitle, videos } = parseYouTubeFeed(xml);
      if (ch.expectTitle && !channelTitle.toLowerCase().includes(ch.expectTitle.toLowerCase())) {
        warn(`${ch.source}:频道名「${channelTitle}」与预期「${ch.expectTitle}」不符,已跳过(请核对 channelId)`);
        report.push(`⚠️ ${ch.source}:频道名不符(${channelTitle}),已跳过`);
        continue;
      }
      const sel = selectVideos(videos, { seen, now, maxAgeDays: 3, perChannel: ch.perChannel });
      sel.forEach((v) => fresh.push({ source: ch.source, title: v.title, videoId: v.videoId, publishedAt: v.date || now.toISOString() }));
      report.push(`✅ ${ch.source}:${videos.length} 条,选 ${sel.length}`);
    } catch (e) {
      warn(`${ch.source} 读取失败:${e.message}`);
      report.push(`❌ ${ch.source}:${String(e.message).slice(0, 80)}`);
    }
  }

  const minTime = addDays(now, -cfg.keepDays).getTime();
  const next = [...fresh, ...archive]
    .filter((v) => new Date(v.publishedAt).getTime() >= minTime)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, cfg.keepMax);

  log(`视频:新增 ${fresh.length} 条`);
  if (dry) log(JSON.stringify(fresh, null, 1));
  else if (fresh.length || next.length !== archive.length) await writeJson(VIDEOS, next);
  await summary(`### 视频\n- 新增 ${fresh.length} 条\n${report.map((r) => '- ' + r).join('\n')}`);
}

// 被测试 import 时不执行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
#!/usr/bin/env node
// 每日视频新闻:读取官方 YouTube 频道的 RSS 订阅源 → data/videos.json(只存标题、ID、时间,页面里用官方嵌入播放)
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, fetchText, log, warn, summary, addDays } from './lib/util.mjs';
import { parseYouTubeFeed } from './lib/feed.mjs';

const P = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const VIDEOS = P('../data/videos.json');
const dry = process.argv.includes('--dry-run');

/** 从一个频道的视频里挑新的:去掉已有、Shorts、过旧 */
export function selectVideos(videos, { seen, now = new Date(), maxAgeDays = 3, perChannel = 2 }) {
  const minTime = now.getTime() - maxAgeDays * 86400000;
  return videos
    .filter((v) => !seen.has(v.videoId))
    .filter((v) => !/#shorts/i.test(v.title))
    .filter((v) => !v.date || new Date(v.date).getTime() >= minTime)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, perChannel);
}

async function main() {
  const cfg = (await readJson(P('./config/feeds.json'))).videos;
  const archive = await readJson(VIDEOS, []);
  const seen = new Set(archive.map((v) => v.videoId));
  const now = new Date();
  const fresh = [];
  const report = [];

  for (const ch of cfg.channels) {
    try {
      const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.channelId)}`, { retries: 4, timeout: 20000 });
      const { channelTitle, videos } = parseYouTubeFeed(xml);
      if (ch.expectTitle && !channelTitle.toLowerCase().includes(ch.expectTitle.toLowerCase())) {
        warn(`${ch.source}:频道名「${channelTitle}」与预期「${ch.expectTitle}」不符,已跳过(请核对 channelId)`);
        report.push(`⚠️ ${ch.source}:频道名不符(${channelTitle}),已跳过`);
        continue;
      }
      const sel = selectVideos(videos, { seen, now, maxAgeDays: 3, perChannel: ch.perChannel });
      sel.forEach((v) => fresh.push({ source: ch.source, title: v.title, videoId: v.videoId, publishedAt: v.date || now.toISOString() }));
      report.push(`✅ ${ch.source}:${videos.length} 条,选 ${sel.length}`);
    } catch (e) {
      warn(`${ch.source} 读取失败:${e.message}`);
      report.push(`❌ ${ch.source}:${String(e.message).slice(0, 80)}`);
    }
  }

  const minTime = addDays(now, -cfg.keepDays).getTime();
  const next = [...fresh, ...archive]
    .filter((v) => new Date(v.publishedAt).getTime() >= minTime)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, cfg.keepMax);

  log(`视频:新增 ${fresh.length} 条`);
  if (dry) log(JSON.stringify(fresh, null, 1));
  else if (fresh.length || next.length !== archive.length) await writeJson(VIDEOS, next);
  await summary(`### 视频\n- 新增 ${fresh.length} 条\n${report.map((r) => '- ' + r).join('\n')}`);
}

// 被测试 import 时不执行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

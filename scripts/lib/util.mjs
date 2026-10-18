// 通用工具:带超时/重试的请求、日期、JSON 读写、文本清理
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 在日志里隐藏 URL 中的密钥 */
export function redact(url) {
  return String(url).replace(/([?&](?:key|apiKey|serviceKey|api_key)=)[^&]+/gi, '$1***');
}

export class HttpError extends Error {
  constructor(status, url, body = '') {
    super(`HTTP ${status} ${redact(url)}`);
    this.status = status;
    this.body = body.slice(0, 300);
  }
}

/** GET 文本。遇到 429/5xx/网络错误时指数退避重试。 */
export async function fetchText(url, { timeout = 25000, retries = 2, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'danqing-hangul-bot/1.0 (+personal learning site)', accept: '*/*', ...headers },
      });
      const text = await res.text();
      if (res.ok) return text;
      lastErr = new HttpError(res.status, url, text);
      if (res.status < 500 && res.status !== 429) throw lastErr;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
    } finally {
      clearTimeout(t);
    }
    if (attempt < retries) await sleep(1500 * 2 ** attempt);
  }
  throw lastErr;
}

/** 首尔时间的 YYYY-MM-DD */
export function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Date → YYYYMMDD(首尔时间) */
export function ymd(d = new Date()) {
  return kstDate(d).replaceAll('-', '');
}
export function ym(d = new Date()) {
  return ymd(d).slice(0, 6);
}
export function addDays(d, days) {
  return new Date(d.getTime() + days * 86400000);
}
export function addMonths(d, months) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 1) + '\n', 'utf8');
}

export function stripHtml(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
export function clip(s = '', max = 300) {
  const a = [...String(s)];
  return a.length <= max ? String(s) : a.slice(0, max - 1).join('') + '…';
}

export function normTitle(s = '') {
  return String(s).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 只允许 https 链接,其余返回 null */
export function httpsUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.href : x.protocol === 'http:' ? 'https://' + x.href.slice(7) : null;
  } catch {
    return null;
  }
}

export function log(...a) {
  console.log(...a);
}
export function warn(...a) {
  console.warn('[warn]', ...a);
}
/** 写入 GitHub Actions 的运行摘要(本地运行时忽略) */
export async function summary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (!f) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(f, md + '\n');
}

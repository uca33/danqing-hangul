// Gemini 调用(免费额度即可):返回解析后的 JSON。限速、重试、容错。
import { sleep, HttpError, redact } from './util.mjs';

export class NoKeyError extends Error {
  constructor() {
    super('未设置 GEMINI_API_KEY');
    this.name = 'NoKeyError';
  }
}

let lastCall = 0;
const MIN_INTERVAL = Number(process.env.GEMINI_MIN_INTERVAL_MS || 6500); // 免费层约 10 次/分钟

export function hasGemini() {
  return !!process.env.GEMINI_API_KEY;
}

export function parseModelJson(raw) {
  let t = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

export async function geminiJSON({ system, user, maxOutputTokens = 4096, temperature = 0.3, retries = 3 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new NoKeyError();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig = { responseMimeType: 'application/json', temperature, maxOutputTokens };
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // 摘要任务不需要长思考,省额度

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = lastCall + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new HttpError(res.status, url, JSON.stringify(data?.error?.message || ''));
        if (res.status === 429 || res.status >= 500) {
          lastErr = err;
          await sleep(8000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error('模型没有返回内容(可能被安全策略拦截)');
      return parseModelJson(text);
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e; // 4xx 不重试
      if (e instanceof SyntaxError || e.name === 'TimeoutError' || e.name === 'AbortError' || /没有返回/.test(e.message)) {
        if (attempt < retries) continue;
      }
      if (attempt >= retries) break;
      await sleep(3000 * 2 ** attempt);
    }
  }
  throw new Error('Gemini 调用失败:' + redact(lastErr?.message || lastErr));
}

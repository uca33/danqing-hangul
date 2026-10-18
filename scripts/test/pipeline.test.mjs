import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, findAll } from '../lib/xml.mjs';
import { parseFeed, parseYouTubeFeed } from '../lib/feed.mjs';
import { parseKciResponse } from '../lib/kci.mjs';
import { selectItems, normalizeNewsAnalysis } from '../lib/news-core.mjs';
import { selectVideos } from '../update-videos.mjs';
import { classify, isEligible, pickDaily } from '../lib/papers-core.mjs';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../config/papers.json', import.meta.url)));

test('xml: 实体与 CDATA', () => {
  const r = parseXml('<a><b x="1">A &amp; B</b><c><![CDATA[<i>hi</i>]]></c></a>');
  assert.equal(findAll(r, 'b')[0].text, 'A & B');
  assert.equal(findAll(r, 'c')[0].text, '<i>hi</i>');
});

test('xml: 不展开 DOCTYPE 实体', () => {
  const r = parseXml('<!DOCTYPE a [<!ENTITY x "BOOM">]><a>&x;</a>');
  assert.ok(!findAll(r, 'a')[0].text.includes('BOOM'));
});

test('RSS 解析', () => {
  const xml = `<rss><channel><item><title>제목 &amp; 테스트</title><link>https://e.com/1</link>
  <pubDate>Sat, 17 Oct 2026 01:00:00 GMT</pubDate><description><![CDATA[<p>본문 요약입니다</p>]]></description></item>
  <item><title>x</title><link>ftp://insecure.com/2</link></item></channel></rss>`;
  const it = parseFeed(xml);
  assert.equal(it.length, 1);
  assert.equal(it[0].title, '제목 & 테스트');
  assert.equal(it[0].summary, '본문 요약입니다');
});

test('YouTube 订阅源解析', () => {
  const xml = `<feed xmlns:yt="y" xmlns:media="m"><title>KBS News</title>
  <entry><yt:videoId>abcdefghijk</yt:videoId><title>뉴스</title><published>2026-10-17T01:00:00+00:00</published></entry>
  <entry><yt:videoId>bad</yt:videoId><title>x</title></entry></feed>`;
  const r = parseYouTubeFeed(xml);
  assert.equal(r.channelTitle, 'KBS News');
  assert.equal(r.videos.length, 1);
});

test('选视频:去重、去 Shorts、去过旧', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const v = [
    { videoId: 'a', title: '新', date: '2026-10-17T00:00:00Z' },
    { videoId: 'b', title: '旧', date: '2026-10-01T00:00:00Z' },
    { videoId: 'c', title: '短 #shorts', date: '2026-10-17T00:00:00Z' },
    { videoId: 'd', title: '已有', date: '2026-10-17T00:00:00Z' },
  ];
  const r = selectVideos(v, { seen: new Set(['d']), now });
  assert.deepEqual(r.map((x) => x.videoId), ['a']);
});

test('选新闻:去重与时效', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const items = [
    { title: '충분히 긴 뉴스 제목입니다 정말로', link: 'https://e.com/1', date: '2026-10-17T00:00:00Z', summary: '' },
    { title: '충분히 긴 뉴스 제목입니다 정말로2', link: 'https://e.com/2', date: '2026-10-17T00:00:00Z', summary: '' },
    { title: '충분히 긴 뉴스 제목입니다 정말로3', link: 'https://e.com/3', date: '2026-09-01T00:00:00Z', summary: '' },
  ];
  const r = selectItems(items, { seenLinks: new Set(['https://e.com/1']), now });
  assert.deepEqual(r.map((x) => x.link), ['https://e.com/2']);
});

test('新闻解析结果规整:非法输入返回 null', () => {
  assert.equal(normalizeNewsAnalysis(null), null);
  assert.ok(normalizeNewsAnalysis({ summary: '摘要', vocab: [{ kr: '단어', zh: '词' }] }));
});

const KCI = `<MetaData><outputData><total>1</total><record>
<journalInfo><journal-name>국어학</journal-name><pub-year>2026</pub-year></journalInfo>
<articleInfo article-id="ART1"><title-group><article-title lang="original">한국어 조사의 의미 연구</article-title></title-group>
<abstract-group><abstract lang="original">${'이 논문은 한국어 조사의 의미 기능을 분석한다. '.repeat(6)}</abstract></abstract-group>
<author-group><author>홍길동 (서울대학교)</author></author-group><orte-open-yn>Y</orte-open-yn><url>https://www.kci.go.kr/x</url></articleInfo>
</record></outputData></MetaData>`;

test('KCI 记录解析', () => {
  const { total, papers } = parseKciResponse(KCI);
  assert.equal(total, 1);
  assert.equal(papers[0].id, 'kci:ART1');
  assert.equal(papers[0].openAccess, true);
  assert.deepEqual(papers[0].authors, ['홍길동']);
});

test('论文分类、资格与每刊限额', () => {
  const p = parseKciResponse(KCI).papers[0];
  assert.equal(isEligible(p, cfg, new Set(), new Set()), true);
  assert.equal(isEligible({ ...p, openAccess: false }, cfg, new Set(), new Set()), false);
  assert.equal(isEligible(p, cfg, new Set([p.id]), new Set()), false);
  assert.ok(classify(p, cfg));
  const many = [1, 2, 3, 4].map((i) => ({ ...p, id: 'kci:' + i, title: 'T' + i }));
  assert.ok(pickDaily(many, cfg, 3).length <= cfg.maxPerJournal);
});

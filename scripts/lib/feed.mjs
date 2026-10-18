// RSS 2.0 / Atom / YouTube 频道订阅源 解析
import { parseXml, find, findAll, child, textOf } from './xml.mjs';
import { stripHtml, clip, httpsUrl } from './util.mjs';

function toISO(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** 解析 RSS 或 Atom,返回 [{title, link, date(ISO), summary}] */
export function parseFeed(xml) {
  const root = parseXml(xml);
  const items = findAll(root, 'item');
  if (items.length) {
    return items
      .map((it) => {
        const desc = textOf(it, 'description') || textOf(it, 'content:encoded');
        return {
          title: stripHtml(textOf(it, 'title')),
          link: httpsUrl(textOf(it, 'link') || textOf(it, 'guid')),
          date: toISO(textOf(it, 'pubDate') || textOf(it, 'dc:date')),
          summary: clip(stripHtml(desc), 400),
        };
      })
      .filter((x) => x.title && x.link);
  }
  return findAll(root, 'entry')
    .map((e) => {
      const links = e.children.filter((c) => c.name === 'link');
      const alt = links.find((l) => !l.attrs.rel || l.attrs.rel === 'alternate') || links[0];
      return {
        title: stripHtml(textOf(e, 'title')),
        link: httpsUrl(alt?.attrs?.href || ''),
        date: toISO(textOf(e, 'published') || textOf(e, 'updated')),
        summary: clip(stripHtml(textOf(e, 'summary') || textOf(e, 'content')), 400),
      };
    })
    .filter((x) => x.title && x.link);
}

/** 解析 YouTube 频道订阅源:返回 {channelTitle, videos:[{videoId,title,date}]} */
export function parseYouTubeFeed(xml) {
  const root = parseXml(xml);
  const feed = find(root, 'feed');
  const channelTitle = feed ? textOf(feed, 'title') : '';
  const videos = findAll(root, 'entry')
    .map((e) => ({
      videoId: textOf(e, 'yt:videoId'),
      title: stripHtml(textOf(e, 'title')),
      date: toISO(textOf(e, 'published')),
      description: clip(stripHtml(textOf(child(e, 'media:group') || e, 'media:description')), 300),
    }))
    .filter((v) => /^[\w-]{11}$/.test(v.videoId) && v.title);
  return { channelTitle, videos };
}

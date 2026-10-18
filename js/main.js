import { initCards } from './cards.js';
import { initLookup } from './lookup.js';
import { initFeeds } from './feeds.js';
import { initPapers } from './papers.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 导航高亮
const links = [...document.querySelectorAll('[data-nav]')];
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === e.target.id));
    });
  },
  { rootMargin: '-40% 0px -55% 0px' },
);
['cards', 'lookup', 'news', 'video', 'papers'].forEach((id) => {
  const s = document.getElementById(id);
  if (s) io.observe(s);
});

// 整页 3D 场景(固定全屏画布,随滚动变化)。
// 约定:index.html 里有 <canvas id="stage3d">,js/scene.js 导出 initScene(canvas, { reduced }) 。
// WebGL 不可用或加载失败时,给 <html> 加 no-webgl,由 CSS 提供静态后备。
async function startScene() {
  try {
    const canvas = document.getElementById('stage3d');
    if (!canvas) throw new Error('缺少 #stage3d');
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const { initScene } = await import('./scene.js');
    initScene(canvas, { reduced });
    document.documentElement.classList.add('has-3d');
  } catch (err) {
    console.warn('[scene] 使用静态后备:', err.message);
    document.documentElement.classList.add('no-webgl');
  }
}

startScene();
initCards({ reduced }).catch((e) => console.error(e));
initLookup();
initFeeds();
initPapers();

// 本地桌面版:每分钟 ping 一次本地小服务,它在长时间没有页面时会自动退出(线上站点不执行)
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const ping = () => fetch('/__ping', { cache: 'no-store' }).catch(() => {});
  setInterval(ping, 60000);
}

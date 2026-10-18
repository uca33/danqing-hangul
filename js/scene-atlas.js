// 丹青韩语 · 程序生成的水墨剪影图集(松枝 / 枯枝 / 乌篷舟 / 渡口栈桥 / 芦苇 / 亭 / 礁石)
// 全部在 Canvas2D 上用「毛笔笔触」现画,不使用任何外部图片;只写 alpha(墨量),颜色由着色器决定。

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ATLAS_SIZE = 1024;

// 返回 { canvas, cells: { name: [u0, v0, du, dv, aspect(w/h)] } }
export function makeAtlas() {
  const S = ATLAS_SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rng(20251018);
  const cells = {};
  const canBlur = typeof g.filter === 'string';

  // 锥形笔触:沿折线铺圆点,半径 w0→w1,带轻微抖动和干笔断续
  function stroke(pts, w0, w1, alpha = 1, dry = 0) {
    g.fillStyle = `rgba(0,0,0,${alpha})`;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const L = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(L / 1.2));
      for (let j = 0; j < n; j++) {
        const t = j / n;
        const u = (run + L * t) / Math.max(1e-3, total);
        if (dry && R() < dry * u) continue; // 飞白:越到笔尾越容易断
        const w = (w0 + (w1 - w0) * u) * (0.9 + R() * 0.2);
        g.beginPath();
        g.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.35, w / 2), 0, Math.PI * 2);
        g.fill();
      }
      run += L;
    }
  }
  // 带弯曲与抖动的路径
  function path(x, y, ang, len, bend = 0, jit = 0.04, steps = 14) {
    const pts = [[x, y]];
    for (let i = 1; i <= steps; i++) {
      ang += bend / steps + (R() - 0.5) * jit;
      x += (Math.cos(ang) * len) / steps;
      y += (Math.sin(ang) * len) / steps;
      pts.push([x, y]);
    }
    return { pts, x, y, ang };
  }
  function soft(fn, blur = 6, alpha = 0.3) {
    if (!canBlur) return;
    g.save();
    g.filter = `blur(${blur}px)`;
    g.globalAlpha = alpha;
    fn();
    g.restore();
  }
  function cell(name, x, y, w, h, fn) {
    g.save();
    g.beginPath();
    g.rect(x + 2, y + 2, w - 4, h - 4);
    g.clip();
    g.translate(x, y);
    fn(w, h);
    g.restore();
    cells[name] = [x / S, 1 - (y + h) / S, w / S, h / S, w / h];
  }

  // 松针团:扇形放射的短笔
  function needles(cx, cy, r, n = 26, sq = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI + (R() - 0.5) * 0.12; // 上半圆
      const rr = r * (0.75 + R() * 0.35);
      stroke(
        [
          [cx, cy],
          [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq],
        ],
        1.6,
        0.6,
        0.85,
      );
    }
    stroke(
      [
        [cx - r * 0.25, cy + 1],
        [cx + r * 0.25, cy + 1],
      ],
      2.2,
      1.8,
      0.9,
    );
  }

  /* 1) 松枝:从左缘伸出,向右下垂的苍劲老枝 */
  cell('pine', 0, 0, 512, 512, (w, h) => {
    const clusters = [];
    const main = path(4, 150, 0.18, 470, 0.55, 0.09, 26);
    const draw = () => {
      stroke(main.pts, 30, 7, 1, 0.12);
      // 树皮鳞纹
      for (let i = 2; i < main.pts.length - 4; i += 2) {
        const [px, py] = main.pts[i];
        stroke(
          [
            [px - 6, py - 5],
            [px + 4, py + 3],
          ],
          2.2,
          1,
          0.55,
        );
      }
    };
    // 副枝
    const subs = [];
    for (let i = 5; i < main.pts.length - 2; i += 4) {
      const [px, py] = main.pts[i];
      const up = R() < 0.55;
      const s = path(px, py, up ? -0.5 - R() * 0.5 : 0.5 + R() * 0.5, 90 + R() * 70, up ? 0.3 : -0.3, 0.12, 10);
      subs.push(s);
      clusters.push([s.x, s.y, 46 + R() * 22]);
      const mid = s.pts[5];
      clusters.push([mid[0] + 10, mid[1] - 6, 30 + R() * 14]);
    }
    clusters.push([main.x, main.y, 52]);
    soft(() => clusters.forEach(([x, y, r]) => {
      g.beginPath();
      g.ellipse(x, y - r * 0.2, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
      g.fillStyle = '#000';
      g.fill();
    }), 9, 0.22);
    draw();
    subs.forEach((s) => stroke(s.pts, 11, 3, 0.95, 0.15));
    clusters.forEach(([x, y, r]) => needles(x, y, r));
  });

  /* 2) 枯枝:自左下角向右上分叉,细枝末梢带枝节 */
  cell('bare', 512, 0, 512, 512, () => {
    function branch(x, y, ang, len, wd, depth) {
      const p = path(x, y, ang, len, (R() - 0.5) * 0.8, 0.16, 10);
      stroke(p.pts, wd, wd * 0.45, 0.95, depth < 2 ? 0.2 : 0.05);
      if (depth >= 4 || wd < 1.4) return;
      const n = depth === 0 ? 4 : 2 + (R() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const k = 4 + Math.floor(R() * 6);
        const [bx, by] = p.pts[Math.min(p.pts.length - 1, k)];
        branch(bx, by, ang + (R() - 0.5) * 1.3 - 0.15, len * (0.5 + R() * 0.25), wd * 0.55, depth + 1);
      }
      if (R() < 0.4) {
        g.beginPath();
        g.ellipse(p.x, p.y, wd * 0.9, wd * 0.6, ang, 0, Math.PI * 2);
        g.fill();
      }
    }
    soft(() => {
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(80, 440, 90, 40, -0.6, 0, Math.PI * 2);
      g.fill();
    }, 14, 0.15);
    branch(6, 506, -0.75, 300, 24, 0);
    branch(30, 500, -0.35, 220, 13, 1);
  });

  /* 3) 乌篷舟 + 篙 + 水纹 */
  cell('boat', 0, 512, 512, 256, (w, h) => {
    const wl = h - 52; // 水线
    // 船身
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(40, wl - 34);
    g.quadraticCurveTo(70, wl + 8, 200, wl + 10);
    g.lineTo(330, wl + 10);
    g.quadraticCurveTo(450, wl + 6, 484, wl - 40);
    g.quadraticCurveTo(440, wl - 14, 330, wl - 12);
    g.lineTo(200, wl - 12);
    g.quadraticCurveTo(100, wl - 14, 40, wl - 34);
    g.fill();
    // 乌篷
    g.beginPath();
    g.moveTo(170, wl - 12);
    g.bezierCurveTo(176, wl - 92, 330, wl - 98, 340, wl - 12);
    g.closePath();
    g.globalAlpha = 0.86;
    g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      const x = 190 + i * 25;
      stroke(
        [
          [x, wl - 14],
          [x + 4, wl - 70 - Math.sin((i / 5) * Math.PI) * 12],
        ],
        1.4,
        1,
        0.35,
      );
    }
    // 篙
    stroke(
      [
        [430, wl - 196],
        [372, wl + 40],
      ],
      4.5,
      2.2,
      0.92,
      0.06,
    );
    // 水纹
    for (let i = 0; i < 9; i++) {
      const y = wl + 18 + i * 3.4;
      const x0 = 60 + R() * 120;
      stroke(
        [
          [x0, y],
          [x0 + 120 + R() * 200, y + (R() - 0.5) * 2],
        ],
        2.4 - i * 0.18,
        0.6,
        0.35 - i * 0.03,
        0.4,
      );
    }
  });

  /* 4) 亭:立在礁石上的六角亭 */
  cell('pavilion', 512, 512, 256, 256, (w, h) => {
    const base = h - 40;
    // 礁石
    soft(() => {
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(128, base + 10, 120, 26, 0, 0, Math.PI * 2);
      g.fill();
    }, 8, 0.35);
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(14, base + 22);
    g.quadraticCurveTo(40, base - 30, 92, base - 22);
    g.quadraticCurveTo(140, base - 34, 180, base - 18);
    g.quadraticCurveTo(232, base - 10, 244, base + 22);
    g.closePath();
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
      const x = 30 + R() * 200;
      stroke(
        [
          [x, base - 20 + R() * 8],
          [x + 6 - R() * 12, base + 18],
        ],
        2,
        0.8,
        0.3,
      );
    }
    // 台基与柱
    g.fillRect(84, base - 36, 88, 8);
    [92, 116, 140, 164].forEach((x) => g.fillRect(x - 1.5, base - 96, 3.2, 62));
    stroke(
      [
        [86, base - 66],
        [170, base - 66],
      ],
      2,
      2,
      0.6,
    );
    // 飞檐屋顶
    g.beginPath();
    g.moveTo(56, base - 92);
    g.quadraticCurveTo(80, base - 98, 100, base - 112);
    g.quadraticCurveTo(122, base - 138, 128, base - 160);
    g.quadraticCurveTo(134, base - 138, 156, base - 112);
    g.quadraticCurveTo(176, base - 98, 200, base - 92);
    g.quadraticCurveTo(186, base - 104, 184, base - 100);
    g.lineTo(72, base - 100);
    g.quadraticCurveTo(70, base - 104, 56, base - 92);
    g.fill();
    stroke(
      [
        [128, base - 160],
        [128, base - 178],
      ],
      2.6,
      1.4,
      1,
    );
  });

  /* 5) 渡口栈桥 */
  cell('pier', 768, 512, 256, 256, (w, h) => {
    const wl = h - 54;
    stroke(
      [
        [6, wl - 60],
        [250, wl - 44],
      ],
      7,
      5,
      0.92,
      0.1,
    );
    for (let i = 0; i < 6; i++) {
      const x = 16 + i * 44 + R() * 6;
      const top = wl - 74 + i * 3;
      stroke(
        [
          [x, top],
          [x + (R() - 0.5) * 3, wl + 6],
        ],
        7 - i * 0.5,
        5,
        0.95,
        0.05,
      );
    }
    // 缆绳
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(20, wl - 66);
    g.quadraticCurveTo(80, wl - 30, 150, wl - 54);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const y = wl + 14 + i * 4;
      stroke(
        [
          [10 + R() * 40, y],
          [150 + R() * 90, y],
        ],
        2,
        0.6,
        0.28,
        0.45,
      );
    }
  });

  /* 6) 芦苇丛 */
  cell('reeds', 0, 768, 512, 256, (w, h) => {
    const base = h - 30;
    for (let i = 0; i < 34; i++) {
      const x = 20 + R() * 470;
      const ht = 110 + R() * 110;
      const lean = (R() - 0.35) * 0.5;
      const p = path(x, base, -Math.PI / 2 + lean * 0.3, ht, lean, 0.03, 12);
      stroke(p.pts, 3.2, 1, 0.85);
      // 叶
      if (R() < 0.7) {
        const k = 3 + Math.floor(R() * 5);
        const [lx, ly] = p.pts[k];
        const side = R() < 0.5 ? -1 : 1;
        const lf = path(lx, ly, -Math.PI / 2 + side * (0.5 + R() * 0.5), 50 + R() * 40, side * 1.0, 0.05, 8);
        stroke(lf.pts, 4.5, 0.6, 0.8);
      }
      // 苇花
      if (R() < 0.55) {
        soft(() => {
          g.fillStyle = '#000';
          g.beginPath();
          g.ellipse(p.x + lean * 6, p.y - 8, 6, 15, lean, 0, Math.PI * 2);
          g.fill();
        }, 4, 0.55);
      }
    }
  });

  /* 7) 礁石小岛(米点皴) */
  cell('isle', 512, 768, 512, 256, (w, h) => {
    const base = h - 30;
    soft(() => {
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(256, base - 30, 230, 60, 0, 0, Math.PI * 2);
      g.fill();
    }, 12, 0.3);
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(20, base + 6);
    g.bezierCurveTo(60, base - 70, 140, base - 120, 200, base - 92);
    g.bezierCurveTo(250, base - 150, 330, base - 110, 360, base - 70);
    g.bezierCurveTo(420, base - 80, 470, base - 30, 494, base + 6);
    g.closePath();
    g.globalAlpha = 0.55;
    g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 260; i++) {
      const x = 40 + R() * 440;
      const top = base - 20 - Math.max(0, 110 - Math.abs(x - 250) * 0.5) * (0.6 + R() * 0.4);
      const y = top + R() * (base - top);
      g.globalAlpha = 0.35 + R() * 0.5;
      g.beginPath();
      g.ellipse(x, y, 4 + R() * 4, 2 + R() * 2, -0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });

  return { canvas: c, cells };
}

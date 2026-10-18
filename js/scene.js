// 丹青韩语 · 整页水墨 3D 场景(「丹青渡」)
// 固定全屏画布,位于全部页面内容之后。整页是一个连续的三维山水:
//   相机随滚动沿一条样条「穿行」:渡口水面(hero)→ 江上(卡片)→ 峡谷群山(查词)
//   → 云海之上(新闻)→ 月下枯枝萤火(视频)→ 归渡小亭(论文)。
//   远山 / 云 / 水 / 剪影 / 立绘 / 枫叶 / 雁群 处在同一空间,按深度排序遮挡,深度雾做空气透视。
// 叠加:屏幕空间墨场(文字保护 / 滚动横扫 / 点击涟漪)+ 低分辨率流墨(点击溅墨、向按钮汇聚)
//   + 宣纸纤维 / 光照 / 暗角,以正片叠底合成。
// 画质分三档并按帧时自动降档;prefers-reduced-motion 时只按需渲染静态帧。
import * as THREE from '../vendor/three.module.min.js';
import { makeAtlas } from './scene-atlas.js';
import * as SH from './scene-shaders.js';

THREE.ColorManagement.enabled = false; // 全部按 sRGB 数值直接运算,与 CSS 的 multiply 一致

const { MAX_RECTS, MAX_RIPPLES, MAX_SPLATS, ART_RATIO } = SH;
const PAPER = 0xf3f1ea;
const PAPER_V = new THREE.Vector3(0.953, 0.945, 0.918);
const MIST = new THREE.Vector3(0.66, 0.71, 0.77);
const ART = ['assets/art/art1.jpg', 'assets/art/art2.jpg', 'assets/art/art3.jpg', 'assets/art/art4.jpg'];
const FOV = 46;
const SECTIONS = ['hero', 'cards', 'lookup', 'news', 'video', 'papers'];

// 需要保证可读的文字区域(墨与景物在这些区域里被压淡)
const PROTECT =
  '.hero-copy > *, .scroll-hint, .sec-head, .deck-side, .all > summary, .all[open] .chips, .all[open] .grid,' +
  ' .lookup, .result, .feed, #paper-chips:not([hidden]), .paper-note:not([hidden]), .foot';
// 鼠标靠近时墨向其汇聚的控件
const ATTRACT = '.btn, #tilt, .tabs, #q, .history button';

/* 画质档位(见文末性能表):
   dpr 像素比上限 · ink 墨场分辨率比例 · ranges 山层数 · clouds 云层数 · fluid 流墨宽(0 关)
   refl 山的水中倒影 · mirrors 剪影倒影 · fauna 雁群/萤火 · leaves 枫叶总数 · ui3d 前景 CSS 3D */
const TIERS = [
  { dpr: 0.75, ink: 0.18, ranges: 6, clouds: 3, fluid: 0, refl: 0, mirrors: 0, fauna: 0, leaves: 9, ui3d: 0 },
  { dpr: 1.0, ink: 0.25, ranges: 8, clouds: 5, fluid: 128, refl: 1, mirrors: 0, fauna: 1, leaves: 21, ui3d: 1 },
  { dpr: 1.25, ink: 0.3, ranges: 11, clouds: 8, fluid: 192, refl: 1, mirrors: 1, fauna: 1, leaves: 33, ui3d: 1 },
];
const RANGE_MAX = 11;
const CLOUD_MAX = 8;
const RANGE_GAP = 4.6;
const REF = 0.5; // 山平面在水线以下用于倒影的比例

// 相机关键帧:P = 板块进度(0 hero … 5 papers,6 = 页尾)
const KEYS = [
  { x: 0.0, y: 0.8, z: 8, pitch: 0.06, yaw: 0.0 },
  { x: 0.7, y: 1.0, z: -4, pitch: -0.01, yaw: 0.07 },
  { x: -0.4, y: 1.7, z: -17, pitch: 0.0, yaw: -0.06 },
  { x: 0.3, y: 5.3, z: -31, pitch: -0.19, yaw: 0.04 },
  { x: -0.4, y: 2.6, z: -45, pitch: -0.04, yaw: -0.05 },
  { x: 0.3, y: 1.0, z: -58, pitch: -0.03, yaw: 0.03 },
  { x: 0.0, y: 0.9, z: -67, pitch: -0.02, yaw: 0.0 },
];

// 各板块的「丹青渡」意象剪影(在对应板块的相机姿态下按屏幕位置摆放,之后就是世界里的固定物体)
// nx/ny:屏幕 NDC;depth:离相机距离;hf:高度占屏高比例;water:水线在图块中的高度比例(有则立在水面上)
const PIECES = [
  { cell: 'pine', P: 0, nx: 1.2, ny: 1.18, depth: 3.4, hf: 0.38, flip: 1, anchor: 'tr', seg: 0, col: [0.07, 0.085, 0.1] },
  { cell: 'pier', P: 0, nx: -0.98, depth: 7, hf: 0.26, water: 0.21, seg: 0, col: [0.09, 0.1, 0.13] },
  { cell: 'boat', P: 0.2, nx: -0.08, depth: 15, hf: 0.12, water: 0.2, seg: 0, drift: 0.5, col: [0.1, 0.12, 0.16] },
  { cell: 'reeds', P: 1.25, nx: 0.9, depth: 5, hf: 0.34, water: 0.12, seg: 1, col: [0.1, 0.12, 0.13] },
  { cell: 'isle', P: 1.3, nx: -0.55, depth: 17, hf: 0.17, water: 0.12, seg: 1, col: [0.15, 0.18, 0.23] },
  { cell: 'boat', P: 1.3, nx: 0.05, depth: 10, hf: 0.12, water: 0.2, seg: 1, drift: -0.7, flip: 1, col: [0.1, 0.12, 0.16] },
  { cell: 'pine', P: 2.3, nx: 1.04, ny: 0.75, depth: 6.5, hf: 0.5, flip: 1, anchor: 'tr', seg: 2, col: [0.08, 0.095, 0.11] },
  { cell: 'bare', P: 4.3, nx: -1.04, ny: 1.04, depth: 5, hf: 0.62, anchor: 'tl', seg: 4, col: [0.07, 0.08, 0.1] },
  { cell: 'bare', P: 4.2, nx: 1.05, ny: 0.35, depth: 10, hf: 0.42, anchor: 'tr', flip: 1, seg: 4, col: [0.1, 0.12, 0.15] },
  { cell: 'pavilion', P: 5.3, nx: 0.62, depth: 14, hf: 0.22, water: 0.16, seg: 5, col: [0.1, 0.12, 0.15] },
  { cell: 'isle', P: 5.3, nx: -0.55, depth: 22, hf: 0.16, water: 0.12, seg: 5, col: [0.16, 0.19, 0.24] },
  { cell: 'boat', P: 5.4, nx: 0.1, depth: 9, hf: 0.12, water: 0.2, seg: 5, drift: 0.25, col: [0.1, 0.12, 0.16] },
];

/* ───────── 工具 ───────── */
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (k, s = 0) => {
  let h = Math.imul((k | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const bell = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));

function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const f = new Float32Array(size * size);
  const chans = [
    { base: 4, oct: 5, seed: 11 },
    { base: 5, oct: 5, seed: 23 },
    { base: 3, oct: 6, seed: 37 },
    { base: 16, oct: 3, seed: 51 },
  ];
  chans.forEach((c, ci) => {
    f.fill(0);
    let amp = 1;
    let cells = c.base;
    for (let o = 0; o < c.oct; o++) {
      const rnd = mulberry(c.seed * 977 + o * 131);
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        const gy = (y / size) * cells;
        const iy = Math.floor(gy);
        let fy = gy - iy;
        fy = fy * fy * (3 - 2 * fy);
        const y0 = iy % cells;
        const y1 = (iy + 1) % cells;
        for (let x = 0; x < size; x++) {
          const gx = (x / size) * cells;
          const ix = Math.floor(gx);
          let fx = gx - ix;
          fx = fx * fx * (3 - 2 * fx);
          const x0 = ix % cells;
          const x1 = (ix + 1) % cells;
          const a = lat[y0 * cells + x0];
          const b = lat[y0 * cells + x1];
          const cc = lat[y1 * cells + x0];
          const d = lat[y1 * cells + x1];
          f[y * size + x] += amp * (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy);
        }
      }
      amp *= 0.5;
      cells *= 2;
    }
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < f.length; i++) {
      if (f[i] < mn) mn = f[i];
      if (f[i] > mx) mx = f[i];
    }
    for (let i = 0; i < f.length; i++) data[i * 4 + ci] = Math.round(((f[i] - mn) / (mx - mn)) * 255);
  });
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// 雁:两条弯折的翼带,aWing 记录到翼尖的距离(顶点着色器据此扇动)
function makeBirdGeometry() {
  const pos = [];
  const wing = [];
  const idx = [];
  const N = 6;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = side * t;
      const y = 0.16 * Math.sin(t * Math.PI * 0.9) - 0.12 * t * t;
      const th = 0.09 * (1 - t) + 0.014;
      pos.push(x, y + th / 2, 0, x, y - th / 2, 0);
      wing.push(side * t, side * t);
      if (i < N) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const b = pos.length / 3;
  pos.push(0, 0.06, 0, -0.07, -0.03, 0, 0.07, -0.03, 0, 0, -0.07, 0);
  wing.push(0, 0, 0, 0);
  idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  return g;
}

const BLEND_NORMAL = { transparent: true, blending: THREE.NormalBlending, depthTest: false, depthWrite: false };
const BLEND_MULTIPLY = {
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.ZeroFactor,
  depthTest: false,
  depthWrite: false,
};

/* ───────── 主入口 ───────── */
export function initScene(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  renderer.autoClear = false;
  renderer.setClearColor(PAPER, 1);

  const coarse = matchMedia('(pointer: coarse)').matches;
  let tier = coarse || innerWidth < 760 ? 1 : 2;
  let downgraded = false;
  // 调试 / 调参:?scene-tier=0|1|2 锁定档位(不再自动升降)
  const forced = new URLSearchParams(location.search).get('scene-tier');
  let locked = forced !== null && /^[012]$/.test(forced);
  if (locked) tier = +forced;
  let disposed = false;

  const noise = makeNoiseTexture();
  const disposables = [noise];
  const track = (o) => (disposables.push(o), o);

  /* 屏幕空间墨场 */
  const inkRT = track(
    new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }),
  );
  const common = {
    uInk: { value: inkRT.texture },
    uNoise: { value: noise },
    uBuf: { value: new THREE.Vector2(1, 1) },
    uFogDens: { value: 0.022 },
    uMist: { value: MIST },
  };
  const quadGeo = track(new THREE.PlaneGeometry(2, 2));
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsScene = (mat) => {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(quadGeo, mat);
    m.frustumCulled = false;
    s.add(m);
    return s;
  };

  const rects = Array.from({ length: MAX_RECTS }, () => new THREE.Vector4());
  const rips = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));
  const inkMat = track(
    new THREE.ShaderMaterial({
      vertexShader: SH.QUAD_VERT,
      fragmentShader: SH.INK_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uNoise: common.uNoise,
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uFlow: { value: 0 },
        uIntro: { value: 0 },
        uRest: { value: 1 },
        uMouse: { value: new THREE.Vector3(0.7, 0.5, 0) },
        uRects: { value: rects },
        uRectN: { value: 0 },
        uRip: { value: rips },
      },
    }),
  );
  const inkScene = fsScene(inkMat);

  /* 流墨(ping-pong) */
  const caps = renderer.capabilities;
  const halfOK = caps.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  let fluidA = null;
  let fluidB = null;
  let fluidW = 0;
  let fluidH = 0;
  const splats = [];
  const spU = Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4());
  const svU = Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4());
  const fluidMat = track(
    new THREE.ShaderMaterial({
      vertexShader: SH.QUAD_VERT,
      fragmentShader: SH.FLUID_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uNoise: common.uNoise,
        uTexel: { value: new THREE.Vector2(1, 1) },
        uDt: { value: 0 },
        uTime: { value: 0 },
        uAsp: { value: 1 },
        uSp: { value: spU },
        uSv: { value: svU },
        uSpN: { value: 0 },
      },
    }),
  );
  const fluidScene = fsScene(fluidMat);
  function clearFluid() {
    if (!fluidA) return;
    const prev = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(new THREE.Color(0, 0.5, 0.5), 0);
    for (const rt of [fluidA, fluidB]) {
      renderer.setRenderTarget(rt);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(prev, 1);
  }
  function ensureFluid(w) {
    if (!w || reduced) {
      if (fluidA) {
        fluidA.dispose();
        fluidB.dispose();
        fluidA = fluidB = null;
      }
      fluidW = 0;
      return;
    }
    const W = Math.round(Math.min(w, Math.max(64, vw * 0.16)));
    const H = Math.max(16, Math.round((W * vh) / vw));
    if (fluidA && W === fluidW && H === fluidH) return;
    const opt = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      type: halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType,
    };
    if (fluidA) {
      fluidA.dispose();
      fluidB.dispose();
    }
    fluidA = new THREE.WebGLRenderTarget(W, H, opt);
    fluidB = new THREE.WebGLRenderTarget(W, H, opt);
    fluidW = W;
    fluidH = H;
    fluidMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    clearFluid();
  }

  const compMat = track(
    new THREE.ShaderMaterial({
      vertexShader: SH.QUAD_VERT,
      fragmentShader: SH.COMP_FRAG,
      ...BLEND_MULTIPLY,
      uniforms: {
        uInk: common.uInk,
        uNoise: common.uNoise,
        uFluid: { value: inkRT.texture },
        uFTexel: { value: new THREE.Vector2(1, 1) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uFlow: { value: 0 },
        uTime: { value: 0 },
        uCap: { value: 0.1 },
        uDry: { value: 0.3 },
        uFluidOn: { value: 0 },
        uLight: { value: 1 },
      },
    }),
  );
  const compScene = fsScene(compMat);

  /* ───────── 三维世界 ───────── */
  const world = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 140);
  cam.rotation.order = 'YXZ';
  world.add(cam);
  const probe = new THREE.PerspectiveCamera(FOV, 1, 0.1, 140); // 用于按「某板块的相机姿态」摆放物体
  probe.rotation.order = 'YXZ';

  // 相机样条
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const pose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 };
  function poseAt(P, out = pose) {
    const n = KEYS.length - 1;
    const p = clamp(P, 0, n);
    const i = Math.min(n - 1, Math.floor(p));
    const t = p - i;
    const k0 = KEYS[Math.max(0, i - 1)];
    const k1 = KEYS[i];
    const k2 = KEYS[i + 1];
    const k3 = KEYS[Math.min(n, i + 2)];
    for (const c of ['x', 'y', 'z', 'pitch', 'yaw']) out[c] = catmull(k0[c], k1[c], k2[c], k3[c], t);
    return out;
  }
  // 世界 z → 「相机在此处时」的 P(用于按区域决定山的形态)
  function pOfZ(z) {
    if (z >= KEYS[0].z) return 0;
    for (let i = 0; i < KEYS.length - 1; i++) {
      const a = KEYS[i].z;
      const b = KEYS[i + 1].z;
      if (z <= a && z >= b) return i + (a - z) / (a - b);
    }
    return KEYS.length - 1;
  }
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  function setProbe(P) {
    const q = poseAt(P, {});
    probe.position.set(q.x, q.y, q.z);
    probe.rotation.set(q.pitch, q.yaw, 0);
    probe.aspect = vw / vh;
    probe.updateMatrixWorld(true);
    return probe;
  }

  // 水面
  const waterRips = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));
  const waterMat = track(
    new THREE.ShaderMaterial({
      vertexShader: SH.WATER_VERT,
      fragmentShader: SH.WATER_FRAG,
      ...BLEND_NORMAL,
      uniforms: { ...common, uWR: { value: waterRips }, uTime: { value: 0 }, uAlpha: { value: 1 } },
    }),
  );
  const waterGeo = track(new THREE.PlaneGeometry(240, 240, 1, 1));
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.renderOrder = -10;
  water.frustumCulled = false;
  world.add(water);

  // 远山:按槽位沿 -z 无限循环,参数由槽号哈希决定(来回滚动看到的是同一片山)
  const rangeGeo = track(new THREE.PlaneGeometry(1, 1 + REF, 48, 1));
  rangeGeo.translate(0, (1 - REF) / 2, 0);
  const ranges = [];
  for (let i = 0; i < RANGE_MAX; i++) {
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: SH.RANGE_VERT,
        fragmentShader: SH.RANGE_FRAG,
        ...BLEND_NORMAL,
        uniforms: {
          ...common,
          uSeed: { value: 0 },
          uAlpha: { value: 0 },
          uRefl: { value: 1 },
          uTime: { value: 0 },
          uWidth: { value: 60 },
          uRise: { value: 1 },
          uTone: { value: 0 },
        },
      }),
    );
    const mesh = new THREE.Mesh(rangeGeo, mat);
    mesh.frustumCulled = false;
    world.add(mesh);
    ranges.push({ mesh, mat, k: null, seg: 0, h: 1 });
  }
  const cloudGeo = track(new THREE.PlaneGeometry(1, 1, 32, 1));
  cloudGeo.translate(0, 0.5, 0);
  const clouds = [];
  for (let i = 0; i < CLOUD_MAX; i++) {
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: SH.RANGE_VERT,
        fragmentShader: SH.CLOUD_FRAG,
        ...BLEND_NORMAL,
        uniforms: { ...common, uSeed: { value: 0 }, uAlpha: { value: 0 }, uTime: { value: 0 }, uWidth: { value: 60 } },
      }),
    );
    const mesh = new THREE.Mesh(cloudGeo, mat);
    mesh.frustumCulled = false;
    world.add(mesh);
    clouds.push({ mesh, mat, k: null, dens: 0 });
  }

  // 剪影
  const atlas = makeAtlas();
  const atlasTex = track(new THREE.CanvasTexture(atlas.canvas));
  atlasTex.colorSpace = THREE.NoColorSpace;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex.generateMipmaps = true;
  const silGeo = track(new THREE.PlaneGeometry(1, 1));
  const pieces = PIECES.map((def, i) => {
    const mk = (mirror) => {
      const c = atlas.cells[def.cell];
      const mat = track(
        new THREE.ShaderMaterial({
          vertexShader: SH.SIL_VERT,
          fragmentShader: SH.SIL_FRAG,
          ...BLEND_NORMAL,
          uniforms: {
            ...common,
            uAtlas: { value: atlasTex },
            uCell: { value: new THREE.Vector4(c[0], c[1], c[2], c[3]) },
            uAlpha: { value: 1 },
            uReveal: { value: 0 },
            uMirror: { value: mirror ? 1 : 0 },
            uTime: { value: 0 },
            uSeed: { value: 0.13 + i * 0.37 },
            uCol: { value: new THREE.Vector3(...def.col) },
            uWl: { value: def.water ?? 0 },
          },
        }),
      );
      const m = new THREE.Mesh(silGeo, mat);
      m.frustumCulled = false;
      m.visible = false;
      world.add(m);
      return m;
    };
    return { def, mesh: mk(false), mirror: def.water != null ? mk(true) : null, base: new THREE.Vector3(), w: 1, h: 1, reveal: reduced ? 1 : 0 };
  });

  // 月(烘云托月),跟随相机平移,呈「无限远」
  const moonMat = track(
    new THREE.ShaderMaterial({ vertexShader: SH.SIL_VERT, fragmentShader: SH.MOON_FRAG, ...BLEND_NORMAL, uniforms: { ...common, uAlpha: { value: 0 } } }),
  );
  const moon = new THREE.Mesh(silGeo, moonMat);
  moon.renderOrder = -20;
  moon.frustumCulled = false;
  world.add(moon);

  // 立绘
  const loader = new THREE.TextureLoader();
  const artGeo = track(new THREE.PlaneGeometry(1, ART_RATIO, 1, 1));
  const anchors = [...document.querySelectorAll('[data-art]')];
  const arts = anchors.map((el, i) => {
    const idx = Math.max(1, Math.min(4, parseInt(el.dataset.art, 10) || 1)) - 1;
    const isHero = !!el.closest('.hero');
    const uniforms = {
      uTex: { value: null },
      uNoise: common.uNoise,
      uInk: common.uInk,
      uBuf: common.uBuf,
      uReveal: { value: 0 },
      uOpacity: { value: isHero ? 1 : 0.5 },
      uSeed: { value: 0.17 + i * 0.29 },
      uLoaded: { value: 0 },
      uTime: { value: 0 },
      uPass: { value: 0 },
      uPaper: { value: PAPER_V },
    };
    const cover = track(new THREE.ShaderMaterial({ vertexShader: SH.ART_VERT, fragmentShader: SH.ART_FRAG, ...BLEND_NORMAL, uniforms }));
    const mult = track(
      new THREE.ShaderMaterial({ vertexShader: SH.ART_VERT, fragmentShader: SH.ART_FRAG, ...BLEND_MULTIPLY, uniforms: { ...uniforms, uPass: { value: 1 } } }),
    );
    const group = new THREE.Group();
    const m0 = new THREE.Mesh(artGeo, cover);
    const m1 = new THREE.Mesh(artGeo, mult);
    m1.position.z = 0.002; // 比遮挡层略近,排序时保证后画
    m0.frustumCulled = m1.frustumCulled = false;
    group.add(m0, m1);
    group.visible = false;
    (isHero ? world : cam).add(group);
    const a = { el, group, u: uniforms, isHero, side: el.dataset.side || '', loaded: false, reveal: reduced ? 1 : 0, show: 0, base: new THREE.Vector3(), w: 1 };
    const tex = loader.load(
      ART[idx],
      () => {
        a.loaded = true;
        requestRender();
      },
      undefined,
      () => console.warn('[scene] 立绘加载失败', ART[idx]),
    );
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 2;
    disposables.push(tex);
    uniforms.uTex.value = tex;
    return a;
  });

  // 红枫 / 花瓣:按深度分三带,各带一个实例化网格,与山 / 剪影穿插排序
  const BANDS = [
    [1.3, 3.6],
    [3.6, 7.2],
    [7.2, 13],
  ];
  const BURST = 10;
  const AMB_MAX = 11;
  const CAP = AMB_MAX + BURST;
  const leafGeo = track(new THREE.PlaneGeometry(1, 1));
  const MAPLE = [0xd23a22, 0xe2582a, 0xec7a2a, 0xc22e26, 0xdc4a2a, 0xe8962c].map((h) => new THREE.Color(h));
  const PETAL = [0xf1c9c4, 0xeab3b0, 0xf6dcd2, 0xe49a96].map((h) => new THREE.Color(h));
  const rnd = mulberry(7);
  const bands = BANDS.map(([d0, d1], bi) => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = leafGeo.index;
    geo.setAttribute('position', leafGeo.getAttribute('position'));
    geo.setAttribute('uv', leafGeo.getAttribute('uv'));
    const aCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    aMisc.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', aCol);
    geo.setAttribute('aMisc', aMisc);
    track(geo);
    const mat = track(
      new THREE.ShaderMaterial({ vertexShader: SH.LEAF_VERT, fragmentShader: SH.LEAF_FRAG, side: THREE.DoubleSide, ...BLEND_NORMAL, uniforms: { ...common } }),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    world.add(mesh);
    const items = [];
    for (let i = 0; i < CAP; i++) {
      const burst = i >= AMB_MAX;
      items.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28),
        spin: new THREE.Vector3((rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.8, (rnd() - 0.5) * 1.4),
        s: 0.13 + rnd() * 0.1,
        kind: 0,
        alpha: burst ? 0 : 0.92,
        life: burst ? 0 : Infinity,
        burst,
        init: false,
        seed: rnd(),
      });
      const isPetal = !burst && rnd() < 0.28;
      setLeafKind(aCol, items[i], i, isPetal);
    }
    aCol.needsUpdate = true;
    return { d0, d1, mesh, aCol, aMisc, items, n: 0, bi };
  });
  function setLeafKind(aCol, it, i, petal) {
    it.kind = petal ? 1 : 0;
    const c = petal ? PETAL[Math.floor(rnd() * PETAL.length)] : MAPLE[Math.floor(rnd() * MAPLE.length)];
    aCol.setXYZ(i, c.r, c.g, c.b);
    aCol.needsUpdate = true;
  }
  const dummy = new THREE.Object3D();

  // 雁群
  const birdGeoBase = track(makeBirdGeometry());
  const FLOCK = 7;
  const birdGeo = new THREE.InstancedBufferGeometry();
  birdGeo.index = birdGeoBase.index;
  birdGeo.setAttribute('position', birdGeoBase.getAttribute('position'));
  birdGeo.setAttribute('aWing', birdGeoBase.getAttribute('aWing'));
  birdGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: FLOCK }, (_, i) => i * 0.7 + rnd())), 1));
  track(birdGeo);
  const birdMat = track(
    new THREE.ShaderMaterial({ vertexShader: SH.BIRD_VERT, fragmentShader: SH.BIRD_FRAG, side: THREE.DoubleSide, ...BLEND_NORMAL, uniforms: { ...common, uTime: { value: 0 }, uAlpha: { value: 0 } } }),
  );
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, FLOCK);
  birds.frustumCulled = false;
  birds.visible = false;
  world.add(birds);
  const flock = { active: false, t: 0, dir: new THREE.Vector3(), vel: new THREE.Vector3(), side: 1, last: -99, next: 22 };

  // 萤光(视频板块的月夜)
  const FF_N = 42;
  const ffGeo = track(new THREE.BufferGeometry());
  {
    const P = new Float32Array(FF_N * 3);
    const S = new Float32Array(FF_N);
    for (let i = 0; i < FF_N; i++) S[i] = rnd();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(S, 1));
  }
  const ffMat = track(
    new THREE.ShaderMaterial({ vertexShader: SH.FF_VERT, fragmentShader: SH.FF_FRAG, ...BLEND_NORMAL, uniforms: { ...common, uTime: { value: 0 }, uScale: { value: 30 }, uAlpha: { value: 0 } } }),
  );
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  world.add(fireflies);

  /* ───────── 尺寸 / 布局 ───────── */
  let vw = 1;
  let vh = 1;
  let dpr = 1;
  let T = TIERS[tier];
  let ambN = 0;
  const bounds = [0, 1, 2, 3, 4, 5, 6];
  let maxScroll = 1;
  let layoutDirty = true;

  function measure() {
    layoutDirty = false;
    const sy = window.scrollY;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const tops = SECTIONS.map((id) => {
      const el = document.getElementById(id);
      return el ? el.getBoundingClientRect().top + sy : 0;
    });
    bounds[0] = 0;
    for (let i = 1; i < 6; i++) bounds[i] = Math.max(0, tops[i] - vh * 0.3);
    bounds[6] = maxScroll;
    for (let i = 5; i >= 1; i--) bounds[i] = Math.min(bounds[i], bounds[i + 1] - vh * (i === 5 ? 0.15 : 0.1));
    for (let i = 1; i < 7; i++) bounds[i] = Math.max(bounds[i], bounds[i - 1] + 1);
    placeWorld();
  }
  function scrollP(sy) {
    for (let i = 0; i < 6; i++) {
      if (sy < bounds[i + 1] || i === 5) {
        const f = clamp((sy - bounds[i]) / (bounds[i + 1] - bounds[i]), 0, 1);
        return i === 5 ? 5 + f * 0.85 : i + f;
      }
    }
    return 5;
  }

  // 按板块的相机姿态把剪影 / 主立绘 / 萤火摆进世界
  function placeWorld() {
    for (const pc of pieces) {
      const d = pc.def;
      const pr = setProbe(d.P);
      const hh = d.depth * tanH;
      const hw = hh * (vw / vh);
      // 竖屏时按屏宽限制尺寸,避免剪影横穿文字
      const asp = vw / vh;
      const c = atlas.cells[d.cell];
      let h = d.hf * 2 * hh * (asp < 1 ? 0.62 : 1);
      let w = h * c[4];
      const maxW = 2 * hw * (asp < 1 ? 0.72 : 0.6);
      if (w > maxW) {
        h *= maxW / w;
        w = maxW;
      }
      let cx = d.nx * hw;
      let cy = (d.ny ?? 0) * hh;
      if (d.anchor === 'tr') {
        cx -= w / 2;
        cy -= h / 2;
      } else if (d.anchor === 'tl') {
        cx += w / 2;
        cy -= h / 2;
      }
      _v.set(cx, cy, -d.depth).applyMatrix4(pr.matrixWorld);
      if (d.water != null) _v.y = h * (0.5 - d.water);
      pc.base.copy(_v);
      pc.w = w;
      pc.h = h;
    }
    // 主立绘:按 DOM 锚点在「页面顶部」时的屏幕位置,放到 hero 姿态前方的固定深度
    const pr = setProbe(0);
    const sy = window.scrollY;
    for (const a of arts) {
      if (!a.isHero) continue;
      const r = a.el.getBoundingClientRect();
      if (r.width < 2) continue;
      const D = 9;
      const hh = D * tanH;
      const k = (2 * hh) / vh;
      const cx = r.left + r.width / 2;
      const cy = r.top + sy + r.height / 2;
      _v.set((cx - vw / 2) * k, -(cy - vh / 2) * k, -D).applyMatrix4(pr.matrixWorld);
      a.base.copy(_v);
      a.w = r.width * k;
    }
    // 萤火:视频板块姿态前方的一团
    const pf = setProbe(4);
    const pos = ffGeo.getAttribute('position');
    const R = mulberry(31);
    for (let i = 0; i < FF_N; i++) {
      const depth = 2.5 + R() * 11;
      const hh = depth * tanH;
      _v.set((R() * 2 - 1) * hh * (vw / vh) * 1.1, (R() * 1.6 - 0.9) * hh, -depth).applyMatrix4(pf.matrixWorld);
      pos.setXYZ(i, _v.x, Math.max(0.3, _v.y), _v.z);
    }
    // 以团块中心为物体原点,保证与山 / 剪影按深度正确排序
    _v2.set(0, 0, -8).applyMatrix4(pf.matrixWorld);
    for (let i = 0; i < FF_N; i++) pos.setXYZ(i, pos.getX(i) - _v2.x, pos.getY(i) - _v2.y, pos.getZ(i) - _v2.z);
    pos.needsUpdate = true;
    fireflies.position.copy(_v2);
  }

  function resize() {
    vw = Math.max(1, canvas.clientWidth);
    vh = Math.max(1, canvas.clientHeight);
    T = TIERS[tier];
    dpr = Math.min(window.devicePixelRatio || 1, T.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    common.uBuf.value.set(Math.round(vw * dpr), Math.round(vh * dpr));
    inkRT.setSize(Math.max(2, Math.ceil(vw * T.ink)), Math.max(2, Math.ceil(vh * T.ink)));
    inkMat.uniforms.uRes.value.set(vw, vh);
    compMat.uniforms.uRes.value.set(vw, vh);
    compMat.uniforms.uDpr.value = dpr;
    cam.aspect = vw / vh;
    cam.updateProjectionMatrix();
    ensureFluid(T.fluid);
    if (fluidA) {
      fluidMat.uniforms.uAsp.value = vw / vh;
      compMat.uniforms.uFTexel.value.set(1 / fluidW, 1 / fluidH);
    }
    ranges.forEach((r, i) => (r.mesh.visible = i < T.ranges));
    clouds.forEach((c, i) => (c.mesh.visible = i < T.clouds));
    ranges.forEach((r) => (r.k = null));
    clouds.forEach((c) => (c.k = null));
    ambN = Math.max(2, Math.round((T.leaves / 3) * (vw < 700 ? 0.6 : 1)));
    bands.forEach((b) => (b.mesh.count = Math.min(CAP, AMB_MAX + BURST)));
    fireflies.visible = !!T.fauna;
    ffMat.uniforms.uScale.value = 26 * dpr * (vh / 800);
    document.documentElement.classList.toggle('ui3d', !!T.ui3d && !reduced && !coarse);
    measure();
    requestRender();
  }

  /* ───────── 输入 ───────── */
  const mouse = { x: 0.72, y: 0.45, tx: 0.72, ty: 0.45, amt: 0, tAmt: 0, last: -10, px: -1, py: -1, has: false };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let ripIdx = 0;
  let wripIdx = 0;
  let lastInput = 0;
  const ripStart = new Array(MAX_RIPPLES).fill(-99);
  const wripStart = new Array(MAX_RIPPLES).fill(-99);
  function onMove(e) {
    mouse.tx = e.clientX / vw;
    mouse.ty = 1 - e.clientY / vh;
    mouse.px = e.clientX;
    mouse.py = e.clientY;
    if (e.pointerType === 'mouse') {
      par.tx = mouse.tx * 2 - 1;
      par.ty = mouse.ty * 2 - 1;
      mouse.tAmt = 1;
      mouse.has = true;
    }
    mouse.last = time;
    lastInput = time;
    kick();
  }
  function onDown(e) {
    onMove(e);
    if (e.pointerType !== 'mouse') {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
      mouse.tAmt = 0.8;
    }
    const r = rips[ripIdx];
    r.set((e.clientX / vw) * (vw / vh), 1 - e.clientY / vh, 0, 1);
    ripStart[ripIdx] = time;
    ripIdx = (ripIdx + 1) % MAX_RIPPLES;
    waterRipple(e.clientX, e.clientY, 0.6);
    pushLeaves(e.clientX, e.clientY);
  }
  function onLeave() {
    mouse.tAmt = 0;
    mouse.has = false;
    par.tx = par.ty = 0;
  }

  // 屏幕点 → 相机空间某深度的世界点
  function screenToWorld(sx, sy, depth, out) {
    const hh = depth * tanH;
    const hw = hh * (vw / vh);
    return out.set(((sx / vw) * 2 - 1) * hw, (1 - (sy / vh) * 2) * hh, -depth).applyMatrix4(cam.matrixWorld);
  }
  // 屏幕点射向水面(y=0),打不到就取正下方的水面
  function waterRipple(sx, sy, amp = 1) {
    const ndcx = (sx / vw) * 2 - 1;
    let ndcy = 1 - (sy / vh) * 2;
    _v.set(ndcx, ndcy, 0.5).unproject(cam).sub(cam.position).normalize();
    let hit = null;
    if (_v.y < -0.02) {
      const t = -cam.position.y / _v.y;
      if (t < 40) hit = _v2.copy(cam.position).addScaledVector(_v, t);
    }
    if (!hit) {
      ndcy = -0.75;
      _v.set(ndcx, ndcy, 0.5).unproject(cam).sub(cam.position).normalize();
      const t = _v.y < -0.01 ? Math.min(30, -cam.position.y / _v.y) : 12;
      hit = _v2.copy(cam.position).addScaledVector(_v, t);
    }
    waterRips[wripIdx].set(hit.x, hit.z, 0, amp);
    wripStart[wripIdx] = time;
    wripIdx = (wripIdx + 1) % MAX_RIPPLES;
  }
  // 点击处的水纹把附近的叶子推开
  const pushes = [];
  function pushLeaves(sx, sy) {
    if (reduced) return;
    pushes.push({ sx, sy, t: 0 });
    if (pushes.length > 3) pushes.shift();
  }
  // 溅墨
  function splash(sx, sy, power = 1) {
    if (!fluidA) {
      // 无流墨时退化为墨场涟漪
      rips[ripIdx].set((sx / vw) * (vw / vh), 1 - sy / vh, 0, 0.8 * power);
      ripStart[ripIdx] = time;
      ripIdx = (ripIdx + 1) % MAX_RIPPLES;
      return;
    }
    const x = sx / vw;
    const y = 1 - sy / vh;
    splats.push({ x, y, r: 0.035 * power, a: 0.55, vx: 0, vy: 0, w: 1 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.8;
      const sp = (0.5 + Math.random() * 0.6) * power;
      const off = 0.02 * power;
      splats.push({ x: x + (Math.cos(ang) * off) / (vw / vh), y: y + Math.sin(ang) * off, r: 0.016 * power * (0.6 + Math.random()), a: 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 1 });
    }
    if (splats.length > 32) splats.splice(0, splats.length - 32);
  }
  // 花瓣与红枫迸出
  function burst(sx, sy, n) {
    if (reduced) return;
    let made = 0;
    for (let k = 0; k < n * 3 && made < n; k++) {
      const depth = 1.9 + Math.random() * 2.8;
      const b = bands[depth < BANDS[0][1] ? 0 : 1];
      const i = b.items.findIndex((it) => it.burst && it.life <= 0);
      if (i < 0) continue;
      const it = b.items[i];
      screenToWorld(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 40, depth, it.p);
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 1.6;
      _v.set(Math.cos(ang) * sp, Math.abs(Math.sin(ang)) * sp * 0.9 + 0.6, (Math.random() - 0.3) * 1.2).applyQuaternion(cam.quaternion);
      it.v.copy(_v);
      it.life = 2.6 + Math.random() * 1.6;
      it.alpha = 0.95;
      it.s = 0.09 + Math.random() * 0.08;
      it.init = true;
      setLeafKind(b.aCol, it, i, Math.random() < 0.7);
      made++;
    }
  }
  // 抽卡 / 翻卡 / 切换卡组:事件委托,不改 cards.js
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
  }
  function center(el) {
    const r = el.getBoundingClientRect();
    return r.width ? [r.left + r.width / 2, r.top + r.height / 2, r] : null;
  }
  function onClick(e) {
    if (reduced) return;
    const t = e.target && e.target.closest ? e.target.closest('#btn-draw, #btn-flip, #card, .tabs [role=tab], .history button, .grid button') : null;
    if (!t) return;
    const big = !t.matches('#btn-flip, #card');
    const bc = center(t);
    if (bc && t.id !== 'card') splash(bc[0], bc[1], big ? 0.9 : 0.6);
    const tilt = document.getElementById('tilt');
    const cc = tilt && center(tilt);
    if (cc) {
      later(() => {
        const c2 = center(tilt) || cc;
        splash(c2[0], c2[1], big ? 1.5 : 0.9);
        burst(c2[0], c2[1] - c2[2].height * 0.1, big ? 16 : 8);
        waterRipple(c2[0], c2[2].bottom, big ? 1.2 : 0.8);
        pushLeaves(c2[0], c2[1]);
        kick();
      }, big ? 160 : 40);
    }
    lastInput = time;
    kick();
  }

  /* 板块进入视口:点亮对应的 3D 元素 */
  const appear = SECTIONS.map((_, i) => (reduced || i === 0 ? 1 : 0));
  const appearT = appear.slice();
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = SECTIONS.indexOf(e.target.id);
          if (i < 0 || !e.isIntersecting) continue;
          appearT[i] = 1;
          if (e.target.id === 'news' && time - flock.last > 14) launchFlock();
          kick();
        }
      },
      { threshold: 0.12 },
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  } else appearT.fill(1);

  function launchFlock() {
    if (!T.fauna || reduced) return;
    flock.active = true;
    flock.t = 0;
    flock.last = time;
    flock.side = Math.random() < 0.5 ? -1 : 1;
    const depth = 15 + Math.random() * 6;
    const hh = depth * tanH;
    const hw = hh * (vw / vh);
    birds.position.set(-flock.side * hw * 1.25, hh * (0.3 + Math.random() * 0.25), -depth).applyMatrix4(cam.matrixWorld);
    _v.set(flock.side, 0.05, -0.15).applyQuaternion(cam.quaternion);
    _v.y = Math.abs(_v.y) * 0.3 + 0.04;
    flock.vel.copy(_v.normalize()).multiplyScalar(2.3 + Math.random() * 0.6);
    flock.depth = depth;
    birds.visible = true;
  }

  /* ───────── 滚动 / DOM 读数 ───────── */
  let lastScroll = window.scrollY;
  let energy = 0;
  let capE = 0;
  let flow = 0;
  let flowVel = 0;
  let Pd = 0;
  function onScroll() {
    lastInput = time;
    if (reduced) requestRender();
    else kick();
  }
  let protEls = [];
  let attractEls = [];
  function queryProt() {
    protEls = [...document.querySelectorAll(PROTECT)];
    attractEls = [...document.querySelectorAll(ATTRACT)];
  }
  function updateRects() {
    let n = 0;
    for (const el of protEls) {
      if (n >= MAX_RECTS) break;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < -60 || r.top > vh + 60 || r.right < -60 || r.left > vw + 60) continue;
      rects[n++].set(r.left, r.top, r.right, r.bottom);
    }
    inkMat.uniforms.uRectN.value = n;
  }
  // 鼠标靠近控件:墨顺着流场向它汇聚
  function attract(dt) {
    if (!fluidA || !mouse.has || time - mouse.last > 2.5) return;
    let best = null;
    let bd = 150;
    for (const el of attractEls) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > vh) continue;
      const dx = Math.max(r.left - mouse.px, 0, mouse.px - r.right);
      const dy = Math.max(r.top - mouse.py, 0, mouse.py - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) return;
    const cx = best.left + best.width / 2;
    const cy = best.top + best.height / 2;
    let dx = cx - mouse.px;
    let dy = cy - mouse.py;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L;
    dy /= L;
    const k = 1 - bd / 150;
    // 起点:鼠标与控件边缘之间
    const ox = bd > 0 ? mouse.px : cx - dx * (best.width / 2 + 14);
    const oy = bd > 0 ? mouse.py : cy - dy * (best.height / 2 + 14);
    splats.push({ x: ox / vw, y: 1 - oy / vh, r: 0.022, a: 0.05 * k * dt * 60, vx: dx * 0.9 * k, vy: -dy * 0.9 * k, w: 0.5 });
  }

  /* ───────── 每帧更新 ───────── */
  let time = 0;
  let introT = reduced ? 99 : 0;
  const t0 = performance.now();
  const uiMain = document.querySelector('main');
  let uiX = 0;
  let uiY = 0;

  function updateRanges(dt) {
    const camZ = cam.position.z;
    const heroShow = arts.reduce((m, a) => (a.isHero ? Math.max(m, a.show) : m), 0);
    const N = T.ranges;
    const kmin = Math.floor((8 - camZ + 1.0) / RANGE_GAP) + 1;
    const span = N * RANGE_GAP;
    for (let i = 0; i < N; i++) {
      const r = ranges[i];
      let k = kmin + (((i - kmin) % N) + N) % N;
      const z = 8 - k * RANGE_GAP;
      if (r.k !== k) {
        r.k = k;
        const zp = pOfZ(z + 14);
        const cloudy = bell(zp, 2.2, 2.9, 3.9, 4.6);
        const valley = bell(zp, 1.3, 1.8, 2.6, 3.0);
        const side = hash(k, 1) < 0.5 ? -1 : 1;
        const h = 2.6 + 3.4 * hash(k, 2) + cloudy * (5 + 4 * hash(k, 3)) + valley * 2.5;
        const x = valley > 0.3 ? side * (6 + 6 * hash(k, 4)) : (hash(k, 4) - 0.5) * 16;
        const W = 46 + 40 * hash(k, 5) - valley * 14;
        r.mesh.position.set(x + (hash(k, 6) - 0.5) * 4, 0, z);
        r.mesh.scale.set(W, h, 1);
        r.mat.uniforms.uSeed.value = hash(k, 7) * 10;
        r.mat.uniforms.uWidth.value = W;
        r.mat.uniforms.uTone.value = hash(k, 8);
        r.seg = clamp(Math.round(zp), 0, 5);
        r.h = h;
      }
      const d = camZ - z;
      // 主立绘可见时,比她更近的山淡出,避免山压在人物身上
      const near = smooth(0.8 + 9 * heroShow, 6.0 + 6.5 * heroShow, d);
      const far = 1 - smooth(span - 9, span, d);
      const u = r.mat.uniforms;
      u.uAlpha.value = 0.8 * near * far;
      u.uRise.value = 0.55 + 0.45 * appear[r.seg];
      u.uRefl.value = T.refl;
      u.uTime.value = time;
    }
    const NC = T.clouds;
    const gapC = span / NC;
    const kminC = Math.floor((8 - gapC * 0.5 - camZ + 1.2) / gapC) + 1;
    for (let i = 0; i < NC; i++) {
      const c = clouds[i];
      let k = kminC + (((i - kminC) % NC) + NC) % NC;
      const z = 8 - gapC * 0.5 - k * gapC;
      if (c.k !== k) {
        c.k = k;
        const zp = pOfZ(z + 10);
        const cloudy = bell(zp, 2.2, 2.8, 3.7, 4.3);
        const W = 50 + 30 * hash(k, 11);
        c.mesh.position.set((hash(k, 12) - 0.5) * 18, -0.6 + cloudy * 3.0 + hash(k, 13) * 0.6, z);
        c.mesh.scale.set(W, 1.3 + cloudy * 3.2 + hash(k, 14) * 0.8, 1);
        c.mat.uniforms.uSeed.value = hash(k, 15) * 10;
        c.mat.uniforms.uWidth.value = W;
        c.dens = 0.35 + 0.65 * cloudy;
      }
      const d = camZ - z;
      const near = smooth(1.0, 5.0, d);
      const far = 1 - smooth(span - 9, span, d);
      c.mat.uniforms.uAlpha.value = c.dens * near * far;
      c.mat.uniforms.uTime.value = time;
    }
  }

  function updatePieces(dt) {
    for (const pc of pieces) {
      const d = pc.def;
      const target = appear[d.seg];
      if (reduced) pc.reveal = target > 0.5 ? 1 : 0;
      else if (dt) pc.reveal = Math.min(target, pc.reveal + dt / 2.6);
      const drift = d.drift ? Math.sin(time * 0.06 + d.P) * d.drift : 0;
      const dist = _v.copy(pc.base).sub(cam.position).length();
      const ahead = _v.copy(pc.base).applyMatrix4(cam.matrixWorldInverse).z < pc.w * 0.6;
      const vis = pc.reveal > 0.01 && dist < 40 && ahead;
      for (const m of [pc.mesh, pc.mirror]) {
        if (!m) continue;
        const isM = m === pc.mirror;
        m.visible = vis && (!isM || !!T.mirrors);
        if (!m.visible) continue;
        m.position.set(pc.base.x + drift, isM ? -pc.base.y : pc.base.y, pc.base.z);
        m.scale.set(pc.w * (d.flip ? -1 : 1), isM ? -pc.h : pc.h, 1);
        // 面向相机(只绕 y 轴),侧面看也不会变成一条线
        m.rotation.y = Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z) * 0.6;
        const u = m.material.uniforms;
        u.uReveal.value = pc.reveal;
        u.uTime.value = time;
        u.uAlpha.value = smooth(0.6, 2.2, dist) * (vw < 700 ? 0.72 : 1);
      }
    }
  }

  function placeArts(dt, sy) {
    const wide = vw >= 1100;
    for (const a of arts) {
      let target;
      if (a.isHero) {
        target = 1 - smooth(0.12, 0.95, sy / vh);
        const dist = a.base.distanceTo(cam.position);
        target *= smooth(1.5, 4.5, dist);
        // 呼吸感:极轻微的浮动
        const br = reduced ? 0 : Math.sin(time * 0.8) * 0.006;
        a.group.position.set(a.base.x, a.base.y + br * a.w, a.base.z);
        a.group.scale.setScalar(a.w * (1 + br * 0.5));
        a.group.rotation.set(-par.y * 0.03, par.x * 0.05, reduced ? 0 : Math.sin(time * 0.43) * 0.004);
      } else {
        if (!wide || a.el.offsetParent === null) {
          a.group.visible = false;
          continue;
        }
        const r = a.el.getBoundingClientRect();
        const w = Math.min(470, Math.max(260, vw * 0.25));
        const inset = 46;
        const cx = a.side === 'r' ? r.left - inset + w / 2 : r.left + inset - w / 2;
        const cy = r.top + (w * ART_RATIO) / 2;
        const c = cy / vh;
        target = smooth(-0.35, 0.3, c) * (1 - smooth(0.75, 1.35, c));
        // 贴在相机前固定深度:位置由 DOM 决定(不压文字),深度参与排序
        const D = 6;
        const k = (2 * D * tanH) / vh;
        const br = reduced ? 0 : Math.sin(time * 0.7 + a.u.uSeed.value * 9) * 0.005;
        a.group.position.set((cx - vw / 2) * k, -(cy - vh / 2) * k + br * w * k, -D);
        a.group.scale.setScalar(w * k);
        a.group.rotation.set(0, 0, 0);
        if (cy + (w * ART_RATIO) / 2 < -40 || cy - (w * ART_RATIO) / 2 > vh + 40) target = 0;
      }
      a.show = reduced || !dt ? target : damp(a.show, target, 2.2, dt);
      const visible = a.show > 0.003;
      a.group.visible = visible;
      if (!visible) continue;
      if (a.loaded) {
        if (!a.t0) a.t0 = performance.now();
        a.reveal = reduced ? 1 : Math.min(1, (performance.now() - a.t0) / 2200);
      }
      const ease = 1 - Math.pow(1 - a.reveal, 3);
      a.u.uLoaded.value = a.loaded ? 1 : 0;
      a.u.uReveal.value = ease * a.show;
      a.u.uTime.value = time;
    }
  }

  function updateLeaves(dt) {
    const asp = vw / vh;
    const inv = cam.matrixWorldInverse;
    const focus = 5.2 + par.y * 1.2;
    const gust = Math.max(0, Math.sin(time * 0.17) * Math.sin(time * 0.071)) * 0.9;
    // 点击推力 → 世界坐标
    const pw = [];
    for (const p of pushes) {
      if (p.t === 0) p.c = screenToWorld(p.sx, p.sy, 3.5, new THREE.Vector3());
      p.t += dt;
      if (p.t < 0.6) pw.push(p);
    }
    for (const b of bands) {
      const { d0, d1, items, aMisc } = b;
      let n = 0;
      for (let i = 0; i < CAP; i++) {
        const it = items[i];
        if (!it.burst && i >= ambN) {
          aMisc.setXYZW(i, 0, 0, 0, 0);
          continue;
        }
        if (it.burst && it.life <= 0) {
          aMisc.setXYZW(i, it.kind, 0, 0, 0);
          continue;
        }
        if (!it.init) respawn(it, d0 + Math.random() * (d1 - d0), true, asp);
        if (dt) {
          const p = it.p;
          const wx = 0.28 + 0.32 * Math.sin(p.y * 0.6 + time * 0.4 + p.z * 0.3) + gust + energy * Math.sign(flowVel || 1) * 0.6;
          const wy = -0.22 + 0.16 * Math.sin(p.x * 0.5 + time * 0.7 + it.seed * 6);
          const wz = 0.18 * Math.sin(p.x * 0.4 - time * 0.3 + it.seed * 3);
          const drag = it.burst ? 1.6 : 1.1;
          it.v.x += (wx - it.v.x) * Math.min(1, drag * dt);
          it.v.y += (wy - it.v.y) * Math.min(1, drag * dt) - (it.burst ? 0.5 * dt : 0);
          it.v.z += (wz - it.v.z) * Math.min(1, drag * dt);
          for (const q of pw) {
            _v.copy(p).sub(q.c);
            const L2 = _v.lengthSq();
            if (L2 < 9) it.v.addScaledVector(_v.normalize(), (1 - L2 / 9) * 7 * dt * (1 - q.t / 0.6));
          }
          p.addScaledVector(it.v, dt);
          const sp = 1 + it.v.length() * 0.6;
          it.r.x += it.spin.x * dt * sp;
          it.r.y += it.spin.y * dt * sp;
          it.r.z += it.spin.z * dt * sp;
          if (it.burst) {
            it.life -= dt;
            it.alpha = 0.95 * Math.min(1, it.life / 0.9);
          }
        }
        // 相机空间回收
        _v.copy(it.p).applyMatrix4(inv);
        const depth = -_v.z;
        const hh = Math.max(0.05, depth) * tanH;
        const hw = hh * asp;
        if (!it.burst) {
          if (depth < d0 - 0.4) respawn(it, d1 - Math.random() * 0.6, true, asp);
          else if (depth > d1 + 1.2) respawn(it, d0 + Math.random() * 0.5, true, asp);
          else if (_v.y < -hh * 1.25) respawn(it, depth, false, asp, hh * 1.15);
          else if (_v.y > hh * 1.5) respawn(it, depth, false, asp, -hh * 1.2);
          else if (Math.abs(_v.x) > hw * 1.3) {
            _v.x = -Math.sign(_v.x) * hw * 1.25;
            it.p.copy(_v.applyMatrix4(cam.matrixWorld));
          }
        } else if (depth < 0.4) it.life = 0;
        const dd = Math.max(0.3, depth);
        const coc = clamp((Math.abs(dd - focus) / (dd * 0.5 + 1.2)) * 1.1, 0, 1);
        aMisc.setXYZW(i, it.kind, coc, it.alpha, it.seed);
        dummy.position.copy(it.p).sub(b.mesh.position);
        dummy.rotation.copy(it.r);
        dummy.scale.setScalar(it.s * (vw < 700 ? 0.85 : 1));
        dummy.updateMatrix();
        b.mesh.setMatrixAt(i, dummy.matrix);
        n++;
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      aMisc.needsUpdate = true;
      b.n = n;
    }
  }
  function respawn(it, depth, randomY, asp, yAt) {
    const hh = depth * tanH;
    const hw = hh * asp;
    _v.set((Math.random() * 2 - 1) * hw * 1.15, randomY ? (Math.random() * 2 - 1) * hh * 1.1 : yAt, -depth);
    it.p.copy(_v.applyMatrix4(cam.matrixWorld));
    it.v.set(0, -0.2, 0);
    it.init = true;
  }

  function updateFauna(dt) {
    // 雁群
    if (T.fauna && !reduced) {
      if (!flock.active && time - flock.last > flock.next && introT > 4) {
        flock.next = 28 + Math.random() * 24;
        launchFlock();
      }
    }
    if (flock.active) {
      flock.t += dt;
      birds.position.addScaledVector(flock.vel, dt);
      _v.copy(birds.position).applyMatrix4(cam.matrixWorldInverse);
      const hw = Math.max(1, -_v.z) * tanH * (vw / vh);
      const out = flock.t > 30 || -_v.z < 2 || _v.x * flock.side > hw * 1.4;
      birdMat.uniforms.uAlpha.value = smooth(0, 1.2, flock.t) * (out ? 0 : 0.85);
      birdMat.uniforms.uTime.value = time;
      for (let i = 0; i < FLOCK; i++) {
        const rank = Math.ceil(i / 2);
        const side = i % 2 ? 1 : -1;
        dummy.position.set(-flock.side * rank * 0.75 + Math.sin(time * 0.7 + i) * 0.08, -rank * 0.12 + Math.sin(time * 0.9 + i * 1.7) * 0.06, side * rank * 0.55);
        dummy.rotation.set(0, 0, -flock.side * 0.12);
        dummy.scale.setScalar(0.32 + (i === 0 ? 0.04 : 0));
        dummy.updateMatrix();
        birds.setMatrixAt(i, dummy.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
      if (out) {
        flock.active = false;
        birds.visible = false;
      }
    }
    // 萤火 + 月
    const night = appear[4] * bell(Pd, 3.1, 3.8, 4.9, 5.5);
    ffMat.uniforms.uAlpha.value = night * 0.9;
    ffMat.uniforms.uTime.value = time;
    moonMat.uniforms.uAlpha.value = appear[4] * bell(Pd, 2.9, 3.7, 5.2, 5.8);
    moon.position.set(cam.position.x - 9, cam.position.y + 5.2, cam.position.z - 46);
    moon.scale.setScalar(11);
    moon.visible = moonMat.uniforms.uAlpha.value > 0.003;
  }

  function step(dt, rdt = dt) {
    time += dt;
    if (!reduced) introT = (performance.now() - t0) / 1000;
    if (layoutDirty) measure();
    const sy = window.scrollY;
    const dy = sy - lastScroll;
    lastScroll = sy;

    if (!reduced && dt > 0) {
      const v = Math.abs(dy) / vh / rdt;
      const tgt = Math.min(1.25, v * 0.55);
      energy = tgt > energy ? damp(energy, tgt, 7, rdt) : damp(energy, tgt, 0.85, rdt);
      capE = tgt > capE ? damp(capE, tgt, 7, rdt) : damp(capE, tgt, 3.2, rdt);
      flowVel = damp(flowVel, dy / vh, 8, rdt);
      flow += (dy / vh) * 0.75 + dt * 0.006;
    }
    const u = inkMat.uniforms;
    u.uTime.value = time;
    u.uEnergy.value = energy;
    u.uFlow.value = flow;
    compMat.uniforms.uCap.value = 0.06 + 0.2 * Math.min(1, capE);
    compMat.uniforms.uDry.value = 0.3 + 0.6 * Math.min(1, energy);
    const it = introT;
    u.uIntro.value = it < 0.9 ? smooth(0, 0.9, it) * 0.78 : it < 1.15 ? 0.78 : it < 2.95 ? 0.78 * (1 - smooth(1.15, 2.95, it)) : 0;
    u.uRest.value = smooth(1.2, 3.0, it);

    mouse.x = damp(mouse.x, mouse.tx, 5, dt);
    mouse.y = damp(mouse.y, mouse.ty, 5, dt);
    if (time - mouse.last > 1.8) mouse.tAmt = Math.min(mouse.tAmt, coarse ? 0 : 0.35);
    mouse.amt = damp(mouse.amt, reduced ? 0 : mouse.tAmt, 2.5, dt);
    u.uMouse.value.set(mouse.x * (vw / vh), mouse.y, mouse.amt * (fluidA ? 0.5 : 1));
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const age = time - ripStart[i];
      rips[i].z = age;
      if (age > 4) rips[i].w = 0;
      const wa = time - wripStart[i];
      waterRips[i].z = wa;
      if (wa > 5) waterRips[i].w = 0;
    }
    par.x = damp(par.x, par.tx, 3, dt);
    par.y = damp(par.y, par.ty, 3, dt);
    for (let i = 0; i < appear.length; i++) appear[i] = reduced || !dt ? appearT[i] : damp(appear[i], appearT[i], 1.4, rdt);

    updateRects();

    // 相机:滚动 → 板块进度 P → 样条姿态;鼠标 → 轻微平移(近景视差更大)
    const Pt = scrollP(sy);
    Pd = reduced || !dt ? Pt : damp(Pd, Pt, 3.2, rdt);
    poseAt(Pd);
    const bob = reduced ? 0 : Math.sin(time * 0.5) * 0.03;
    cam.position.set(pose.x + par.x * 0.42, pose.y + par.y * 0.22 + bob, pose.z);
    cam.rotation.set(pose.pitch + par.y * 0.018, pose.yaw - par.x * 0.035, reduced ? 0 : Math.sin(time * 0.21) * 0.004 - flowVel * 0.15);
    const fov = FOV + Math.min(1, energy) * 3;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    water.position.set(Math.round(cam.position.x / 10) * 10, 0, Math.round(cam.position.z / 10) * 10);
    waterMat.uniforms.uTime.value = time;

    updateRanges(dt);
    updatePieces(dt ? rdt : 0);
    placeArts(rdt, sy);
    for (const b of bands) {
      _v.set(0, 0, -(b.d0 + b.d1) / 2).applyMatrix4(cam.matrixWorld);
      b.mesh.position.copy(_v);
    }
    updateLeaves(reduced ? 0 : dt);
    updateFauna(reduced ? 0 : dt);
    if (!reduced) attract(dt);

    compMat.uniforms.uFlow.value = flow;
    compMat.uniforms.uTime.value = time;

    // 前景 UI 的 CSS 3D:与相机同向的极轻微倾斜
    if (uiMain && T.ui3d && !reduced && !coarse) {
      const tx = clamp(par.x * 0.9 + pose.yaw * 3, -1, 1);
      const ty = clamp(par.y * 0.8 - flowVel * 4, -1, 1);
      if (Math.abs(tx - uiX) > 0.006 || Math.abs(ty - uiY) > 0.006) {
        uiX = tx;
        uiY = ty;
        uiMain.style.setProperty('--ux', tx.toFixed(3));
        uiMain.style.setProperty('--uy', ty.toFixed(3));
      }
    }
    fluidDt = dt;
  }

  let fluidDt = 0;
  function stepFluid() {
    if (!fluidA || fluidDt <= 0) return;
    const n = Math.min(MAX_SPLATS, splats.length);
    for (let i = 0; i < n; i++) {
      const s = splats.shift();
      spU[i].set(s.x, s.y, s.r, s.a);
      svU[i].set(s.vx, s.vy, s.w, 0);
    }
    const fu = fluidMat.uniforms;
    fu.uSpN.value = n;
    fu.uDt.value = Math.min(0.05, fluidDt);
    fu.uTime.value = time;
    fu.uPrev.value = fluidA.texture;
    renderer.setRenderTarget(fluidB);
    renderer.render(fluidScene, orthoCam);
    const t = fluidA;
    fluidA = fluidB;
    fluidB = t;
    fluidDt = 0;
  }

  const gl = renderer.getContext();
  function draw() {
    if (gl.isContextLost()) return; // 丢失事件是异步的,期间不渲染、不编译
    renderer.info.reset();
    renderer.setRenderTarget(inkRT);
    renderer.render(inkScene, orthoCam);
    stepFluid();
    compMat.uniforms.uFluidOn.value = fluidA ? 1 : 0;
    compMat.uniforms.uFluid.value = fluidA ? fluidA.texture : inkRT.texture;
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    renderer.render(world, cam);
    renderer.render(compScene, orthoCam);
    frames++;
  }

  /* ───────── 循环与自适应画质 ───────── */
  let running = false;
  let raf = 0;
  let lost = false;
  let last = 0;
  let skip = false;
  let acc = 0;
  let accN = 0;
  let goodTime = 0;
  let frames = 0;
  let fpsAvg = 0;
  function loop(now) {
    raf = 0;
    if (!running || lost) return;
    const dtRaw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    acc += dtRaw;
    accN++;
    if (acc > 2.5) {
      const avg = acc / accN;
      fpsAvg = 1 / avg;
      if (locked) {
        /* 档位已锁定 */
      } else if (avg > 1 / 30 && tier > 0) {
        // 持续低于 30fps:降一档(降档后不再升档)
        tier--;
        downgraded = true;
        resize();
      } else if (avg < 1 / 52 && !downgraded && tier < 2 && !coarse) {
        goodTime += acc;
        if (goodTime > 8) {
          tier++;
          goodTime = 0;
          resize();
        }
      }
      acc = 0;
      accN = 0;
    }
    const idle = energy < 0.02 && time - lastInput > 1.5 && introT > 3.2 && mouse.amt < 0.4 && !flock.active && splats.length === 0;
    skip = idle ? !skip : false;
    if (!skip) {
      const real = Math.min(0.5, idle ? dtRaw * 2 : dtRaw);
      step(Math.min(0.066, real), real);
      draw();
    }
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (reduced || running || document.hidden || lost || disposed) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function kick() {
    if (!running) start();
  }
  let pending = false;
  function requestRender() {
    if (running || pending || lost || disposed) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (running || lost || disposed) return;
      step(0);
      draw();
    });
  }

  /* ───────── 事件 ───────── */
  const onVis = () => (document.hidden ? stop() : start());
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    stop();
  };
  const onRestored = () => {
    lost = false;
    renderer.setClearColor(PAPER, 1);
    resize();
    clearFluid();
    reduced ? requestRender() : start();
  };
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  const roBody = new ResizeObserver(() => {
    layoutDirty = true;
    requestRender();
  });
  roBody.observe(document.body);
  const reQuery = setInterval(queryProt, 2500);
  if (!reduced) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('click', onClick, true);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  queryProt();
  resize();
  // 预编译全部材质(含尚未出现的雁群 / 萤火),避免首次出现时卡顿
  try {
    const vis = [];
    world.traverse((o) => {
      vis.push([o, o.visible]);
      o.visible = true;
    });
    renderer.compile(world, cam);
    vis.forEach(([o, v]) => (o.visible = v));
  } catch (e) {
    /* 编译失败交给首帧报告 */
  }
  Pd = scrollP(window.scrollY);
  step(0);
  draw();
  if (reduced) document.fonts?.ready?.then(() => requestRender());
  else start();

  function dispose() {
    disposed = true;
    stop();
    ro.disconnect();
    roBody.disconnect();
    io?.disconnect();
    clearInterval(reQuery);
    timers.forEach(clearTimeout);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    document.documentElement.classList.remove('ui3d');
    bands.forEach((b) => b.mesh.dispose());
    birds.dispose();
    if (fluidA) {
      fluidA.dispose();
      fluidB.dispose();
    }
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  }
  const api = {
    renderer,
    dispose,
    get tier() {
      return tier;
    },
    set tier(v) {
      // 调试用:强制档位
      tier = clamp(v | 0, 0, 2);
      locked = true;
      resize();
    },
    get running() {
      return running;
    },
    get frames() {
      return frames;
    },
    get state() {
      return {
        tier,
        fps: +fpsAvg.toFixed(1),
        P: +Pd.toFixed(2),
        energy: +energy.toFixed(2),
        dpr,
        vw,
        vh,
        fluid: fluidA ? [fluidW, fluidH] : null,
        appear: appear.map((x) => +x.toFixed(2)),
        cam: cam.position.toArray().map((v) => +v.toFixed(2)),
        calls: renderer.info.render.calls,
        arts: arts.map((x) => ({ vis: x.group.visible, show: +x.show.toFixed(2), loaded: x.loaded })),
      };
    },
    launchFlock,
  };
  renderer.info.autoReset = false;
  window.__scene3d = api;
  return api;
}

/* 性能档位估算(1366×800 视口;draw call 为同屏最多时):
   档 | 像素比 | 主画布           | 渲染目标                                   | draw call
   0  | 0.75   | 1025×600         | 墨场 246×144(1 个)                        | ~18:墨1 + 水1 + 山6 + 云3 + 剪影≤4 + 立绘2 + 叶3 + 合成1
   1  | 1.0    | 1366×800         | 墨场 342×200 + 流墨 128×75 ×2(半浮点)     | ~28:+流墨1、山8、云5、雁1、萤1、月1
   2  | 1.25   | 1708×1000        | 墨场 410×240 + 流墨 192×112 ×2            | ~38:+山11、云8、剪影倒影≤4
   触屏或窄屏(<760px)从档 1 起步;帧率持续 <30fps 自动降一档,降档后不再回升。 */

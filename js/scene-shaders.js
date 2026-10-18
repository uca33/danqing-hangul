// 丹青韩语 · 场景着色器
// 约定:世界中的物体用普通 alpha 混合画在宣纸色上(近处遮挡远处),
// 最后一遍「合成」以正片叠底叠加墨场 / 流墨 / 纸纹 / 光照。

export const MAX_RECTS = 14;
export const MAX_RIPPLES = 4;
export const MAX_SPLATS = 8;
export const ART_RATIO = 985 / 800;

/* 公共:文字保护遮罩 + 深度雾(空气透视) */
const COMMON = /* glsl */ `
uniform sampler2D uInk, uNoise;
uniform vec2 uBuf;
uniform float uFogDens;
uniform vec3 uMist;
float protect(){ return texture2D(uInk, gl_FragCoord.xy / uBuf).b; }
float fogF(float d){ return 1.0 - exp(-d * uFogDens); }
`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* 1) 屏幕空间墨场:R=墨浓度 G=墨色 B=文字保护遮罩 A=点击涟漪 */
export const INK_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform float uTime, uEnergy, uFlow, uIntro, uRest;
uniform vec3 uMouse;
uniform vec4 uRects[${MAX_RECTS}];
uniform int uRectN;
uniform vec4 uRip[${MAX_RIPPLES}];
varying vec2 vUv;
float n1(vec2 p, int c){ vec4 t = texture2D(uNoise, p); return c==0?t.r:(c==1?t.g:(c==2?t.b:t.a)); }
void main(){
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  vec2 px = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  float prot = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uRectN) break;
    vec4 r = uRects[i];
    vec2 c = (r.xy + r.zw) * 0.5;
    vec2 h = (r.zw - r.xy) * 0.5;
    vec2 q = abs(px - c) - h;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    prot = max(prot, 1.0 - smoothstep(-24.0, 120.0, sd));
  }
  vec2 disp = vec2(0.0);
  float rings = 0.0, drops = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 R = uRip[i];
    if (R.w <= 0.0) continue;
    vec2 dv = p - R.xy;
    float dd = length(dv);
    float age = R.z;
    float fade = exp(-age * 1.15) * R.w;
    float rad = 0.03 + age * 0.21;
    float w1 = (dd - rad) / 0.014;
    float w2 = (dd - rad * 0.62) / 0.011;
    float w3 = (dd - rad * 0.32) / 0.009;
    rings += (exp(-w1 * w1) + 0.7 * exp(-w2 * w2) + 0.45 * exp(-w3 * w3)) * fade;
    disp += normalize(dv + 1e-5) * sin(clamp((dd - rad) * 60.0, -3.14, 3.14)) * 0.012 * fade * step(dd, rad + 0.05);
    float dn = n1(p * 3.0 + R.xy, 3) - 0.5;
    float rr = 0.012 + 0.055 * sqrt(age);
    drops += (1.0 - smoothstep(rr * 0.45, rr, dd + dn * 0.04)) * exp(-age * 0.75) * R.w;
  }
  p += disp;
  float t = uTime;
  vec2 q = vec2(n1(p * 0.33 + vec2(t * 0.007, 0.0), 0), n1(p * 0.33 + vec2(0.37, t * 0.005), 1));
  float f  = n1(p * 0.52 + (q - 0.5) * 0.9 + vec2(0.0, t * 0.004), 2);
  float f2 = n1(p * 1.35 + (q - 0.5) * 0.7 - vec2(t * 0.006, 0.0), 3);
  float ex = min(uv.x, 1.0 - uv.x) * asp;
  float ey = min(uv.y, 1.0 - uv.y);
  float reach = 0.42 + 0.3 * n1(vec2(step(0.5, uv.x) * 0.5 + step(0.5, uv.y) * 0.25, t * 0.003), 1);
  float corner = 1.0 - smoothstep(0.0, reach, length(vec2(ex, ey) * vec2(1.0, 1.2)));
  float brkY = smoothstep(0.46, 0.68, n1(vec2(uv.y * 1.1 + step(0.5, uv.x) * 0.37, t * 0.006), 0) * 0.7 + f2 * 0.3);
  float brkX = smoothstep(0.45, 0.72, n1(vec2(uv.x * asp * 0.35, 0.61 + t * 0.004), 1));
  float sides = (1.0 - smoothstep(0.0, 0.2, ex)) * brkY;
  float bottom = (1.0 - smoothstep(0.0, 0.2, uv.y)) * brkX * 0.85;
  float edgeW = max(corner, max(sides, bottom));
  float restField = (f * 0.6 + f2 * 0.4 - 0.5) * 0.9 + edgeW * 0.8;
  float rest = smoothstep(0.5, 0.74, restField) * uRest;
  float wash = smoothstep(0.35, 0.8, f) * 0.09 * (0.5 + 0.5 * edgeW);
  vec2 ps = vec2(p.x * 0.55 - uFlow, p.y * 1.45 + p.x * 0.22);
  float s = n1(ps * 0.55 + (q - 0.5) * 0.55, 2) * 0.66 + n1(ps * 1.6 + (q - 0.5) * 0.4, 0) * 0.34;
  float en = clamp(uEnergy, 0.0, 1.2);
  float thr = 0.86 - 0.5 * en;
  float sweep = smoothstep(thr, thr + 0.13, s + edgeW * 0.12) * smoothstep(0.0, 0.08, en);
  vec2 md = p - uMouse.xy;
  float bloom = exp(-dot(md, md) / 0.010) * uMouse.z * (0.55 + 0.9 * f2);
  float introInk = 1.0 - smoothstep(uIntro * 1.25 - 0.32, uIntro * 1.25 - 0.08, uv.y + (f - 0.5) * 0.45 + (f2 - 0.5) * 0.15);
  introInk *= step(0.001, uIntro);
  float d = max(max(rest, sweep * 0.92), introInk * 0.95);
  d = max(d, wash);
  d += bloom * 0.45;
  d = clamp(d, 0.0, 1.0);
  float rip = clamp(rings * 0.4 + drops * 0.6, 0.0, 1.0);
  float tone = smoothstep(0.32, 0.78, q.x + (f2 - 0.5) * 0.3);
  gl_FragColor = vec4(d, tone, prot, rip);
}`;

/* 2) 流墨:低分辨率 ping-pong,半拉格朗日平流 + 旋度噪声速度场 + 湿度扩散
   R=墨量 GB=速度(0.5 偏移编码) A=湿度 */
export const FLUID_FRAG = /* glsl */ `
uniform sampler2D uPrev, uNoise;
uniform vec2 uTexel;
uniform float uDt, uTime, uAsp;
uniform vec4 uSp[${MAX_SPLATS}];   // xy=uv, z=半径(屏高比例), w=墨量
uniform vec4 uSv[${MAX_SPLATS}];   // xy=速度(屏高/秒), z=湿度
uniform int uSpN;
varying vec2 vUv;
const float VM = 0.8;
vec4 S(vec2 uv){ return texture2D(uPrev, uv); }
void main(){
  vec2 uv = vUv;
  vec4 c = S(uv);
  vec2 vel = (c.gb - 0.5) * 2.0 * VM;
  vec2 back = uv - vel * uDt * vec2(1.0 / uAsp, 1.0);
  vec4 a = S(back);
  vec4 nb = S(back + vec2(uTexel.x, 0.0)) + S(back - vec2(uTexel.x, 0.0)) + S(back + vec2(0.0, uTexel.y)) + S(back - vec2(0.0, uTexel.y));
  float d = a.r;
  float w = a.a;
  vec2 v = (a.gb - 0.5) * 2.0 * VM;
  // 湿处墨向四周渗开(扩散);干了就停住
  d = mix(d, nb.r * 0.25, clamp(0.35 * w + 0.04, 0.0, 0.5));
  w = mix(w, nb.a * 0.25, 0.18);
  // 旋度噪声:纸面上缓慢的水流
  vec2 p = vec2(uv.x * uAsp, uv.y) * 1.3 + vec2(uTime * 0.012, -uTime * 0.008);
  float e = 0.02;
  float nx1 = texture2D(uNoise, p + vec2(e, 0.0)).r, nx0 = texture2D(uNoise, p - vec2(e, 0.0)).r;
  float ny1 = texture2D(uNoise, p + vec2(0.0, e)).r, ny0 = texture2D(uNoise, p - vec2(0.0, e)).r;
  v += vec2(ny1 - ny0, -(nx1 - nx0)) / (2.0 * e) * 0.05 * uDt * (0.3 + w);
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= uSpN) break;
    vec4 sp = uSp[i];
    vec2 dd = (uv - sp.xy) * vec2(uAsp, 1.0);
    float g = exp(-dot(dd, dd) / (sp.z * sp.z));
    d += g * sp.w;
    v += g * uSv[i].xy;
    w = max(w, g * uSv[i].z);
  }
  v *= exp(-1.8 * uDt);
  if (length(v) < 0.004) v = vec2(0.0);
  d = max(0.0, d * exp(-(0.12 + 0.5 * (1.0 - w)) * uDt) - 0.0025);
  w = max(0.0, w * exp(-0.5 * uDt) - 0.002);
  // 贴边衰减,避免墨卡在画布边缘
  vec2 eb = min(uv, 1.0 - uv);
  d *= smoothstep(0.0, 0.02, min(eb.x, eb.y));
  gl_FragColor = vec4(clamp(d, 0.0, 1.0), clamp(v / VM * 0.5 + 0.5, 0.0, 1.0), clamp(w, 0.0, 1.0));
}`;

/* 3) 合成(正片叠底):墨 + 流墨干湿边 + 飞白 + 纸纤维 + 纸面光照 + 暗角 */
export const COMP_FRAG = /* glsl */ `
uniform sampler2D uInk, uNoise, uFluid;
uniform vec2 uRes, uFTexel;
uniform float uDpr, uFlow, uTime, uCap, uDry, uFluidOn, uLight;
varying vec2 vUv;
void main(){
  vec4 k = texture2D(uInk, vUv);
  float soft = k.r;
  float asp = uRes.x / uRes.y;
  vec2 fc = gl_FragCoord.xy / uDpr;
  float fib = texture2D(uNoise, fc / 140.0).a * 0.6 + texture2D(uNoise, fc / 46.0).a * 0.4;
  float sharp = smoothstep(0.22, 0.52, soft + (fib - 0.5) * 0.32);
  float d = mix(soft * 0.55, sharp, smoothstep(0.08, 0.3, soft));
  float st = texture2D(uNoise, vec2(vUv.x * asp * 0.5 - uFlow * 0.22, vUv.y * 5.0 + vUv.x * 0.6)).a;
  float st2 = texture2D(uNoise, vec2(vUv.x * asp * 1.4 - uFlow * 0.3, vUv.y * 16.0 + vUv.x * 1.5)).a;
  float fb = smoothstep(0.32, 0.6, st * 0.55 + st2 * 0.45);
  float edge = smoothstep(0.1, 0.45, soft) * (1.0 - smoothstep(0.55, 0.95, soft));
  d *= mix(1.0, 0.2 + 0.8 * fb, edge * uDry);
  d *= mix(1.0, uCap, k.b);
  d = max(d, k.a * mix(1.0, 0.3, k.b));
  vec3 indigo = vec3(0.10, 0.155, 0.30);
  vec3 jiao   = vec3(0.055, 0.065, 0.085);
  vec3 grey   = vec3(0.50, 0.55, 0.60);
  vec3 inkCol = mix(indigo, jiao, k.g);
  inkCol = mix(grey, inkCol, smoothstep(0.08, 0.55, d));
  vec3 m = mix(vec3(1.0), inkCol, d);

  // 流墨:纤维扰动的软边 + 干湿边(墨在边缘堆积)+ 湿润处的微弱反光
  if (uFluidOn > 0.5) {
    vec2 fo = vec2((fib - 0.5) * 2.0) * uFTexel;
    vec4 F = texture2D(uFluid, vUv + fo);
    float fbl = (texture2D(uFluid, vUv + vec2(uFTexel.x * 2.5, 0.0)).r + texture2D(uFluid, vUv - vec2(uFTexel.x * 2.5, 0.0)).r
               + texture2D(uFluid, vUv + vec2(0.0, uFTexel.y * 2.5)).r + texture2D(uFluid, vUv - vec2(0.0, uFTexel.y * 2.5)).r) * 0.25;
    float fd = F.r;
    float body = smoothstep(0.03, 0.55, fd + (fib - 0.5) * 0.16);
    float rim = clamp((fd - fbl) * 5.0, 0.0, 1.0) * smoothstep(0.02, 0.12, fd);
    float fi = clamp(body * 0.62 + rim * 0.45, 0.0, 0.92);
    fi *= mix(1.0, 0.32, k.b);
    float sheen = F.a * smoothstep(0.25, 0.7, fd) * smoothstep(0.55, 0.85, texture2D(uNoise, fc / 60.0 + uTime * 0.01).g);
    vec3 fCol = mix(vec3(0.16, 0.2, 0.3), jiao, smoothstep(0.2, 0.8, fd));
    vec3 fm = mix(vec3(1.0), fCol, fi);
    fm = mix(fm, vec3(1.0), sheen * 0.35);   // 湿墨高光:墨面略提亮
    m *= fm;
  }

  // 纸纹:细纤维 + 大块斑驳 + 伪法线浮雕
  float g1 = texture2D(uNoise, fc / 180.0).a;
  float g2 = texture2D(uNoise, fc / 900.0 + 0.3).b;
  float gx = texture2D(uNoise, (fc + vec2(1.5, 0.0)) / 70.0).a - texture2D(uNoise, (fc - vec2(1.5, 0.0)) / 70.0).a;
  float gy = texture2D(uNoise, (fc + vec2(0.0, 1.5)) / 70.0).a - texture2D(uNoise, (fc - vec2(0.0, 1.5)) / 70.0).a;
  float relief = dot(vec2(gx, gy), normalize(vec2(-0.6, 0.8)));
  float tk = 1.0 - k.b * 0.5;
  m *= 1.0 - ((g1 - 0.5) * 0.045 + (g2 - 0.5) * 0.03 + relief * 0.05) * tk;
  // 宣纸整体光照:左上透光,右下与四角略暗
  vec2 c = (vUv - vec2(0.32, 0.78)) * vec2(asp, 1.0);
  float light = 1.0 - 0.045 * smoothstep(0.2, 1.4, length(c)) * (1.0 - k.b * 0.7);
  vec2 vq = (vUv - 0.5) * vec2(asp, 1.0) / max(asp, 1.0);
  float vig = 1.0 - 0.09 * smoothstep(0.32, 0.78, length(vq)) * (1.0 - k.b * 0.8);
  m *= mix(1.0, light * vig, uLight);
  gl_FragColor = vec4(m, 1.0);
}`;

/* 4) 远山:平面上按噪声画山脊;水线以下是带波纹的倒影 */
export const RANGE_VERT = /* glsl */ `
varying vec2 vUv; varying float vH, vDist;
void main(){
  vUv = uv; vH = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const RANGE_FRAG = /* glsl */ `
${COMMON}
uniform float uSeed, uAlpha, uRefl, uTime, uWidth, uRise, uTone;
varying vec2 vUv; varying float vH, vDist;
float ridgeAt(float x, float u){
  float a = texture2D(uNoise, vec2(x * 0.18, uSeed * 0.37)).b;
  float b = texture2D(uNoise, vec2(x * 0.7, uSeed * 0.71 + 0.2)).r;
  float c = texture2D(uNoise, vec2(x * 2.6, uSeed * 0.13 + 0.6)).g;
  float rg = 1.0 - abs(b * 2.0 - 1.0);
  float r = 0.1 + 0.62 * a * a + 0.22 * rg * rg + 0.06 * c;
  r *= smoothstep(0.0, 0.22, u) * smoothstep(1.0, 0.78, u);
  return min(r, 0.93) * uRise;
}
void main(){
  float hh = abs(vH);
  bool refl = vH < 0.0;
  float u = vUv.x;
  float x = u * uWidth * 0.07 + uSeed * 3.0;
  if (refl) {
    if (uRefl < 0.01) discard;
    x += sin(hh * 120.0 + uTime * 1.3) * 0.01 + (texture2D(uNoise, vec2(u * 6.0, hh * 4.0 - uTime * 0.03)).r - 0.5) * 0.06;
    hh *= 1.08;
  }
  float r = ridgeAt(x, u);
  float aa = fwidth(hh) * 1.5 + 0.003;
  float inside = smoothstep(r + aa, r - aa, hh);
  if (inside <= 0.0) discard;
  float rel = hh / max(r, 0.04);
  float body = 0.32 + 0.68 * exp(-(1.0 - rel) * 3.2);
  float cun = texture2D(uNoise, vec2(x * 2.3, hh * 2.4)).a;
  float cloud = texture2D(uNoise, vec2(x * 0.5 + uTime * 0.004, hh * 1.3 + uSeed)).r;
  float mist = smoothstep(0.02 + cloud * 0.25, 0.42 + cloud * 0.22, rel);
  float slope = ridgeAt(x + 0.03, u) - ridgeAt(x - 0.03, u);
  float shade = clamp(0.5 - slope * 7.0, 0.0, 1.0);
  float dens = inside * body * mist * (0.68 + 0.55 * cun) * mix(1.12, 0.78, shade);
  if (refl) {
    float br = smoothstep(0.35, 0.6, texture2D(uNoise, vec2(u * 3.0, hh * 18.0)).a);
    dens *= uRefl * 0.34 * (1.0 - smoothstep(0.0, 0.45, hh)) * (0.55 + 0.45 * br);
  }
  float f = fogF(vDist);
  vec3 near = mix(vec3(0.12, 0.15, 0.22), vec3(0.2, 0.24, 0.32), uTone);
  vec3 col = mix(near, uMist, smoothstep(0.0, 1.0, f));
  float a = dens * uAlpha * (1.0 - f * 0.8) * (1.0 - protect() * 0.96);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

/* 5) 云海 / 薄雾:平面上翻卷的云头,白云即「留白」,边缘淡墨勾线 */
export const CLOUD_FRAG = /* glsl */ `
${COMMON}
uniform float uSeed, uAlpha, uTime, uWidth;
varying vec2 vUv; varying float vH, vDist;
void main(){
  float u = vUv.x, y = vUv.y;
  float x = u * uWidth * 0.05 + uSeed;
  float top = 0.5 + 0.28 * texture2D(uNoise, vec2(x * 0.35 + uTime * 0.003, uSeed)).b
                  + 0.16 * texture2D(uNoise, vec2(x * 1.3 - uTime * 0.005, uSeed + 0.3)).r;
  top *= smoothstep(0.0, 0.25, u) * smoothstep(1.0, 0.75, u);
  float edge = smoothstep(top, top - 0.16, y);
  if (edge <= 0.0) discard;
  float body = texture2D(uNoise, vec2(x * 0.7 + uTime * 0.008, y * 0.8 - uTime * 0.004)).g;
  float dens = edge * (0.6 + 0.4 * body) * smoothstep(0.0, 0.4, y);
  float line = exp(-pow((y - top + 0.035) / 0.016, 2.0)) * smoothstep(0.1, 0.3, top);
  line *= 1.0 - protect() * 0.92; // 勾云的淡墨线在文字区淡出(白云本身只会提高对比度)
  float f = fogF(vDist);
  vec3 col = mix(vec3(0.975, 0.972, 0.958), vec3(0.42, 0.47, 0.54), line * 0.55 * (1.0 - f));
  float a = max(dens * 0.92, line * 0.4) * uAlpha * (1.0 - f * 0.55);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

/* 6) 水面:横向水纹 + 点击涟漪(世界坐标,随透视自然压扁) */
export const WATER_VERT = /* glsl */ `
varying vec3 vW; varying float vDist;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const WATER_FRAG = /* glsl */ `
${COMMON}
uniform vec4 uWR[${MAX_RIPPLES}];
uniform float uTime, uAlpha;
varying vec3 vW; varying float vDist;
void main(){
  vec2 p = vW.xz;
  float l1 = texture2D(uNoise, vec2(p.x * 0.025 + uTime * 0.002, p.y * 0.32)).a;
  float l2 = texture2D(uNoise, vec2(p.x * 0.07 - uTime * 0.004, p.y * 0.9 + uTime * 0.01)).r;
  float streak = smoothstep(0.6, 0.82, l1 * 0.7 + l2 * 0.3);
  float ring = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 R = uWR[i];
    if (R.w <= 0.0) continue;
    float age = R.z;
    float dd = length(p - R.xy);
    float rad = 0.15 + age * 1.5;
    float fade = exp(-age * 0.75) * R.w;
    float a1 = (dd - rad) / 0.07, a2 = (dd - rad * 0.68) / 0.06, a3 = (dd - rad * 0.4) / 0.05;
    ring += (exp(-a1 * a1) + 0.65 * exp(-a2 * a2) + 0.4 * exp(-a3 * a3)) * fade;
  }
  float f = fogF(vDist);
  float nearFade = smoothstep(0.6, 3.0, vDist);
  float a = (0.045 + streak * 0.14 + min(ring, 1.0) * 0.55) * (1.0 - f * 0.9) * uAlpha * nearFade;
  a *= 1.0 - protect() * 0.95;
  if (a < 0.003) discard;
  vec3 col = mix(vec3(0.27, 0.34, 0.44), uMist, f * 0.7);
  gl_FragColor = vec4(col, a);
}`;

/* 7) 剪影:图集采样,墨边渗化,随深度淡入雾中;镜像时为波动的倒影 */
export const SIL_VERT = /* glsl */ `
varying vec2 vUv; varying float vDist;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const SIL_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uAtlas;
uniform vec4 uCell;
uniform float uAlpha, uReveal, uMirror, uTime, uSeed, uWl;
uniform vec3 uCol;
varying vec2 vUv; varying float vDist;
void main(){
  vec2 uv = vUv;
  if (uMirror > 0.5) {
    uv.x += sin(uv.y * 70.0 + uTime * 1.6) * 0.006 + (texture2D(uNoise, vec2(uv.y * 3.0 - uTime * 0.04, uSeed)).r - 0.5) * 0.02;
  }
  float raw = texture2D(uAtlas, uCell.xy + clamp(uv, 0.002, 0.998) * uCell.zw).a;
  float n = texture2D(uNoise, uv * vec2(uCell.z / uCell.w, 1.0) * 1.6 + uSeed).r;
  float n2 = texture2D(uNoise, uv * 5.0 + uSeed).a;
  // 墨渗进纸里:硬边与软晕混合,边缘被纤维打散
  float hard = smoothstep(0.32, 0.62, raw + (n2 - 0.5) * 0.3);
  float a = mix(raw * 0.55, hard, 0.62);
  // 显现:墨从根部按噪声晕开
  float grow = uReveal * 1.5 - (n * 0.5 + abs(uv.x - 0.5) * 0.3 + abs(uv.y - 0.5) * 0.2);
  a *= smoothstep(0.0, 0.4, grow) * smoothstep(0.0, 0.5, uReveal);
  a *= smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * smoothstep(0.0, 0.02, uv.y) * smoothstep(1.0, 0.98, uv.y);
  float f = fogF(vDist);
  vec3 col = mix(uCol, uMist, f);
  if (uMirror > 0.5) {
    // 倒影:贴水线最浓,往下断成横向水纹
    float lines = smoothstep(0.35, 0.65, texture2D(uNoise, vec2(uv.x * 1.5 + uTime * 0.01, uv.y * 26.0)).a);
    a *= 0.24 * smoothstep(uWl - 0.01, uWl + 0.04, uv.y) * (1.0 - smoothstep(uWl, uWl + 0.45, uv.y)) * lines;
  }
  a *= uAlpha * (1.0 - f * 0.85) * (1.0 - protect() * 0.95);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

/* 8) 立绘:墨渍状噪声遮罩羽化;pass 0 用宣纸色遮住身后景物,pass 1 正片叠底 */
export const ART_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const ART_FRAG = /* glsl */ `
uniform sampler2D uTex, uNoise, uInk;
uniform vec2 uBuf;
uniform float uReveal, uOpacity, uSeed, uLoaded, uTime, uPass;
uniform vec3 uPaper;
varying vec2 vUv;
void main(){
  vec2 c = (vUv - vec2(0.5, 0.56)) * vec2(1.0, ${ART_RATIO.toFixed(4)});
  float d = length(c * vec2(1.0, 0.82));
  float nA = texture2D(uNoise, vUv * 0.9 + uSeed + vec2(uTime * 0.004, 0.0)).b - 0.5;
  float nB = texture2D(uNoise, vUv * 3.2 + uSeed * 1.3).r - 0.5;
  float nC = texture2D(uNoise, vUv * 9.0 - uSeed).a - 0.5;
  float R = mix(-0.15, 0.55, uReveal);
  float e = d + nA * 0.34 + nB * 0.12 + nC * 0.05;
  float mask = 1.0 - smoothstep(R - 0.13, R + 0.03, e);
  mask *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  float prot = texture2D(uInk, gl_FragCoord.xy / uBuf).b;
  if (uPass < 0.5) {
    // 遮挡:把身后的山与雾「洗」回纸色(内核更实,边缘仍是羽化)
    float a = smoothstep(0.05, 0.85, mask) * 0.88 * uOpacity * uLoaded * (1.0 - prot * 0.96);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uPaper, a);
    return;
  }
  vec3 tex = texture2D(uTex, vUv).rgb;
  vec3 col = mix(vec3(1.0), tex, uLoaded);
  float rim = mask * (1.0 - mask) * 4.0;
  col *= 1.0 - rim * 0.07;
  float a = mask * uOpacity * (1.0 - prot * 0.96);
  gl_FragColor = vec4(mix(vec3(1.0), col, clamp(a, 0.0, 1.0)), 1.0);
}`;

/* 9) 红枫 / 花瓣:实例化方片 + 程序化 SDF 轮廓,景深按 CoC 虚化 */
export const LEAF_VERT = /* glsl */ `
attribute vec3 aCol;
attribute vec4 aMisc;   // x=种类(0 枫 1 瓣) y=CoC z=不透明度 w=随机
varying vec3 vCol; varying vec4 vMisc; varying vec2 vP; varying float vFace, vDist;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position * (1.0 + aMisc.y * 0.7), 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
  vFace = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  vCol = aCol; vMisc = aMisc; vP = position.xy * (1.0 + aMisc.y * 0.7);
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const LEAF_FRAG = /* glsl */ `
${COMMON}
varying vec3 vCol; varying vec4 vMisc; varying vec2 vP; varying float vFace, vDist;
void main(){
  vec2 p = vP;
  float coc = vMisc.y;
  float d;
  float vein = 0.0;
  if (vMisc.x < 0.5) {
    float th = atan(p.x, p.y);
    float r = 0.17 + 0.27 * pow(abs(cos(th * 2.5)), 2.0);
    r *= 1.0 - 0.5 * pow(max(0.0, -cos(th)), 2.0);
    d = length(p - vec2(0.0, -0.03)) - r;
    float stem = max(abs(p.x) - 0.012, abs(p.y + 0.33) - 0.1);
    d = min(d, stem);
    float a5 = mod(th + 0.6283, 1.2566) - 0.6283;
    vein = smoothstep(0.03, 0.0, abs(a5) * length(p)) * step(length(p), r * 0.9) * 0.25;
  } else {
    vec2 q = p + vec2(0.0, 0.06);
    d = (length(q * vec2(1.0 / 0.2, 1.0 / 0.38)) - 1.0) * 0.2;
    d = max(d, -(length(q - vec2(0.0, 0.4)) - 0.07));
    vein = smoothstep(0.02, 0.0, abs(q.x)) * 0.12;
  }
  float w = 0.01 + coc * 0.17;
  float a = smoothstep(w, -w, d);
  if (a <= 0.002) discard;
  vec3 col = vCol * (0.7 + 0.3 * vFace);
  col = mix(col, col * 0.62, vein);
  float f = fogF(vDist);
  col = mix(col, uMist, f * 0.8);
  a *= vMisc.z * mix(1.0, 0.42, coc) * (1.0 - f * 0.7) * (1.0 - protect() * 0.85);
  gl_FragColor = vec4(col, a);
}`;

/* 10) 雁群:翅膀在顶点着色器里扇动 */
export const BIRD_VERT = /* glsl */ `
attribute float aWing;
attribute float aPhase;
uniform float uTime;
varying float vDist;
void main(){
  vec3 p = position;
  float s = sin(uTime * 5.2 + aPhase);
  p.y += s * pow(abs(aWing), 1.3) * 0.55;
  p.z += abs(aWing) * 0.1 * s;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const BIRD_FRAG = /* glsl */ `
${COMMON}
uniform float uAlpha;
varying float vDist;
void main(){
  float f = fogF(vDist);
  float a = uAlpha * (1.0 - f * 0.75) * (1.0 - protect() * 0.85);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vec3(0.1, 0.12, 0.16), uMist, f), a);
}`;

/* 11) 萤光 */
export const FF_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uScale;
varying float vBlink, vDist;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.31 + aSeed * 6.28) * 0.6;
  p.y += sin(uTime * 0.47 + aSeed * 12.1) * 0.35;
  p.z += cos(uTime * 0.23 + aSeed * 3.7) * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  vBlink = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.9 + aSeed) + aSeed * 40.0), 3.0);
  gl_PointSize = uScale * (0.6 + aSeed * 0.6) / max(vDist, 0.5);
  gl_Position = projectionMatrix * mv;
}`;
export const FF_FRAG = /* glsl */ `
${COMMON}
uniform float uAlpha;
varying float vBlink, vDist;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float core = smoothstep(0.16, 0.05, r);
  float halo = smoothstep(0.5, 0.1, r) * 0.35;
  float f = fogF(vDist);
  float a = (core + halo) * vBlink * uAlpha * (1.0 - f * 0.8) * (1.0 - protect() * 0.85);
  if (a < 0.003) discard;
  vec3 col = mix(vec3(0.86, 0.62, 0.14), vec3(0.98, 0.86, 0.42), halo / max(core + halo, 1e-3));
  gl_FragColor = vec4(col, a);
}`;

/* 12) 月:烘云托月——月轮留白,四周淡墨晕 */
export const MOON_FRAG = /* glsl */ `
${COMMON}
uniform float uAlpha;
varying vec2 vUv; varying float vDist;
void main(){
  vec2 q = vUv - 0.5;
  float r = length(q) * 2.0;
  float n = texture2D(uNoise, vUv * 1.4).b;
  float ring = smoothstep(0.42, 0.47, r) * (1.0 - smoothstep(0.5, 1.0, r + (n - 0.5) * 0.25));
  float disc = 1.0 - smoothstep(0.43, 0.46, r);
  vec3 col = mix(vec3(0.5, 0.56, 0.64), vec3(0.99, 0.97, 0.9), disc);
  float a = (ring * 0.38 + disc * 0.6) * uAlpha * (1.0 - protect() * 0.9);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

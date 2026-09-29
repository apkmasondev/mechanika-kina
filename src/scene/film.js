import * as THREE from 'three';
import { FILM_FRAMES_IN_ATLAS } from './mechanism.js';

// ---------------------------------------------------------------------------------------
// Film path: chains of circles (sprockets, rollers, reel packs) joined by common tangents,
// plus three free loops (cubic Beziers) whose LENGTH is dictated by the mechanism:
//   upper loop  = KB + (D - G)      grows while the frame is at rest, collapses during pulldown
//   lower loop  = LL0 - (D - G)     the opposite
//   sound loop  = constant          (between two continuous sprockets)
// Film coordinate uf (metres) is attached to the material of the film, so texture,
// perforations and frames travel exactly as the physical strip does.
// ---------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
const STEP = 0.0025;

const C = (xy, r, s) => ({ x: xy[0], y: xy[1], r, s });

function tangent(A, B) {
  const Dx = B.x - A.x, Dy = B.y - A.y;
  const k = B.s * B.r - A.s * A.r;
  const t = Math.sqrt(Math.max(1e-12, Dx * Dx + Dy * Dy - k * k));
  const ang = Math.atan2(Dy, Dx) - Math.atan2(k, t);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  return { ax: A.x - A.s * A.r * nx, ay: A.y - A.s * A.r * ny, bx: B.x - B.s * B.r * nx, by: B.y - B.s * B.r * ny };
}

function arc(Cc, a0, a1, out) {
  let sw = a1 - a0;
  if (Cc.s > 0) { while (sw < -1e-9) sw += TAU; while (sw >= TAU) sw -= TAU; }
  else { while (sw > 1e-9) sw -= TAU; while (sw <= -TAU) sw += TAU; }
  const n = Math.max(1, Math.ceil(Math.abs(sw) * Cc.r / STEP));
  for (let i = 1; i <= n; i++) {
    const a = a0 + sw * i / n;
    out.push([Cc.x + Cc.r * Math.cos(a), Cc.y + Cc.r * Math.sin(a)]);
  }
}

// circles: array; startAngle on first (undefined -> start at the tangent point, no wrap)
// endAngle on last (undefined -> end at its entry point, no wrap)
function chain(circles, startAngle, endAngle) {
  const pts = [];
  const n = circles.length;
  const tans = [];
  for (let i = 0; i < n - 1; i++) tans.push(tangent(circles[i], circles[i + 1]));
  let aIn = startAngle;
  for (let i = 0; i < n; i++) {
    const c = circles[i];
    const aOut = i < n - 1 ? Math.atan2(tans[i].ay - c.y, tans[i].ax - c.x) : endAngle;
    if (i === 0 && aIn === undefined) {
      pts.push([tans[0].ax, tans[0].ay]);
    } else if (!(i === n - 1 && aOut === undefined)) {
      if (pts.length === 0) pts.push([c.x + c.r * Math.cos(aIn), c.y + c.r * Math.sin(aIn)]);
      if (c.r > 0) arc(c, aIn, aOut, pts);
    }
    if (i < n - 1) {
      pts.push([tans[i].bx, tans[i].by]);
      aIn = Math.atan2(tans[i].by - circles[i + 1].y, tans[i].bx - circles[i + 1].x);
    }
  }
  return pts;
}

class Loop {
  constructor(P0, d0, P3, d3, w1, w2) {
    Object.assign(this, { P0, d0, P3, d3, w1, w2 });
    this.lut = [];
    for (let i = 0; i <= 120; i++) {
      const k = 0.004 + i * 0.004;
      this.lut.push([k, this.length(k)]);
    }
  }
  ctrl(k) {
    const { P0, d0, P3, d3, w1, w2 } = this;
    return [P0, [P0[0] + d0[0] * k * w1, P0[1] + d0[1] * k * w1], [P3[0] - d3[0] * k * w2, P3[1] - d3[1] * k * w2], P3];
  }
  point(c, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, cc = 3 * u * t * t, d = t * t * t;
    return [a * c[0][0] + b * c[1][0] + cc * c[2][0] + d * c[3][0], a * c[0][1] + b * c[1][1] + cc * c[2][1] + d * c[3][1]];
  }
  length(k) {
    const c = this.ctrl(k);
    let L = 0, p = c[0];
    for (let i = 1; i <= 64; i++) { const q = this.point(c, i / 64); L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
    return L;
  }
  kFor(L) {
    const lut = this.lut;
    if (L <= lut[0][1]) return lut[0][0];
    for (let i = 1; i < lut.length; i++) {
      if (lut[i][1] >= L) {
        const [k0, l0] = lut[i - 1], [k1, l1] = lut[i];
        return k0 + (k1 - k0) * (L - l0) / (l1 - l0);
      }
    }
    return lut[lut.length - 1][0];
  }
  sample(L, out, n = 48) {
    const c = this.ctrl(this.kFor(L));
    for (let i = 1; i <= n; i++) out.push(this.point(c, i / n));
  }
}

function polyLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

export class FilmSystem {
  constructor(layout, atlas, mech) {
    this.L = layout;
    this.mech = mech;
    const f = layout.film;
    this.f = f;
    this.F = f.FRAME;
    const R16 = f.R16, R24 = f.R24;
    this.W = f.FILM_W;
    this.ZF = f.ZF;

    this.cFeedPack = C(f.feed_reel, mech.rFeed, -1);
    this.cValveUp = C(f.valve_up, f.valve_up_r, +1);
    this.cSprFeed = C(f.spr_feed, R24, -1);
    this.cSprInt = C(f.spr_int, R16, -1);
    this.cSprHold = C(f.spr_hold, R24, -1);
    this.cG1 = C(f.g1, f.g1_r, +1);
    this.cDrum = C(f.drum, f.drum_r, +1);
    this.cS1 = C(f.spr_s1, R24, -1);
    this.cS2 = C(f.spr_s2, R24, +1);
    this.cValveLo = C(f.valve_lo, f.valve_lo_r, +1);
    this.cTakePack = C(f.take_reel, mech.rTake, -1);

    // loops
    this.loopU = new Loop([f.spr_feed[0] - R24, f.spr_feed[1]], [0, 1], [0, f.gate_top], [0, -1], 1.0, 1.0);
    this.loopL = new Loop([f.spr_int[0], f.spr_int[1] - R16], [-1, 0], [f.spr_hold[0] - R24, f.spr_hold[1]], [0, 1], 0.55, 1.0);
    this.loopS = new Loop([f.spr_s1[0] + R24, f.spr_s1[1]], [0, -1], [f.spr_s2[0], f.spr_s2[1] + R24], [-1, 0], 1.3, 1.0);

    // fixed sections
    this.secB = [[0, f.gate_top], [f.spr_int[0] + R16, f.spr_int[1]]];
    arc(this.cSprInt, 0, -Math.PI / 2, this.secB);
    this.LB = polyLen(this.secB);
    this.secC = chain([this.cSprHold, this.cG1, this.cDrum, this.cS1], Math.PI, 0);
    const LSmin = this.loopS.length(0.02);
    this.LS = LSmin + 8 * f.PERF_PITCH;                // 8 perforations of slack (SH-1000 manual)
    this.secS = [];
    this.loopS.sample(this.LS, this.secS, 40);

    // registration: frame centred in the aperture at rest
    const aperS = f.gate_top - f.AY;
    const m = Math.round((0.207 + aperS - this.F / 2) / this.F);
    this.KB = m * this.F + this.F / 2 - aperS;
    this.LL0 = 0.19;
    this.KC = this.KB + this.LB + this.LL0;
    this.aperS = aperS;

    this.maxVerts = 2400;
    this.build(atlas);
  }

  build(atlas) {
    const g = new THREE.BufferGeometry();
    const n = this.maxVerts;
    this.pos = new Float32Array(n * 2 * 3);
    this.nrm = new Float32Array(n * 2 * 3);
    this.film = new Float32Array(n * 2 * 2);
    this.vel = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('film', new THREE.BufferAttribute(this.film, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('vel', new THREE.BufferAttribute(this.vel, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.set([a, c, b, b, c, d], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0.07), 1.2);
    this.geometry = g;

    this.uniforms = {
      uAtlas: { value: atlas },
      uCols: { value: 12 }, uRows: { value: 7 }, uFrames: { value: FILM_FRAMES_IN_ATLAS },
      uLight: { value: 0 },
      uAp: { value: new THREE.Vector3(0, this.f.AY, this.f.ZF) },
      uVis: { value: 0.3 },
      uHighlight: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0, clearcoat: 0.8,
      clearcoatRoughness: 0.12, side: THREE.DoubleSide, alphaToCoverage: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 film;\nattribute float vel;\nvarying vec2 vFilm;\nvarying float vVel;\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFilm = film; vVel = vel; vWP = (modelMatrix*vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uAtlas; uniform float uCols, uRows, uFrames, uLight, uVis, uHighlight, uTime; uniform vec3 uAp;
varying vec2 vFilm; varying float vVel; varying vec3 vWP;
float fh(float x){ return fract(sin(x*127.1)*43758.5453); }
float fnoise(float x){ float i=floor(x), f=fract(x); return mix(fh(i), fh(i+1.0), f*f*(3.0-2.0*f)); }
vec3 atlasAt(float fi, vec2 uv){
  float f = mod(fi, uFrames); float col = mod(f, uCols); float row = floor(f/uCols);
  vec2 cell = vec2(col, uRows-1.0-row);
  return texture2D(uAtlas, (cell + clamp(uv, 0.002, 0.998)) / vec2(uCols, uRows)).rgb;
}
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p)-b+r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }`)
        .replace('#include <map_fragment>', `
  float zmm = (vFilm.x - 0.5) * 34.975;
  float fr = vFilm.y;
  float fi = floor(fr);
  float ymm = fract(fr) * 19.0;
  float blurmm = clamp(vVel * 1000.0 / 60.0, 0.0, 30.0);          // travel during one display frame
  // --- perforations (KS, 4 per frame) ---
  float pm = mod(ymm, 4.75) - 2.375;
  vec2 pp = vec2(abs(zmm) - 14.49, pm);
  float aa = max(fwidth(zmm), 0.02);
  // Kodak Standard: 2.794 mm across the film, 1.981 mm along its travel.
  float dPerf = sdRound(pp, vec2(1.397, 0.9905 + blurmm * 0.5), 0.5);
  float hole = (1.0 - smoothstep(-aa, aa, dPerf)) * clamp(1.981 / (1.981 + blurmm), 0.0, 1.0);
  // --- picture (Academy frame, upside down in the gate, reversed left/right) ---
  vec2 iuv = vec2((10.26 - zmm) / 22.0, 1.0 - (ymm - 1.5) / 16.0);
  float inPic = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
  vec3 pic = atlasAt(fi, iuv);
  // --- variable-area optical soundtrack ---
  float t = (fi * 19.0 + ymm) * 0.9;
  float amp = 0.25 + 0.95 * fnoise(t * 0.6) * (0.4 + 0.6 * fnoise(t * 0.07 + 3.0));
  float track = step(abs(zmm - 11.27), amp) * step(zmm, 12.5) * step(10.0, zmm);
  float blurFade = clamp(1.0 - blurmm / 18.0, 0.25, 1.0);
  vec3 trans = pic * inPic * 1.0 + vec3(0.9, 0.88, 0.8) * track;           // transmittance
  trans = mix(vec3(dot(trans, vec3(0.33))), trans, blurFade);
  diffuseColor.rgb = vec3(0.012) + trans * uVis;
  diffuseColor.a = 1.0 - hole;
  float edgeGlow = uHighlight * (0.5 + 0.5 * sin(fr * 6.2831 * 0.25 - uTime * 3.0));
  `)
        .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.02) discard;')
        .replace('#include <emissivemap_fragment>', `
  // light through the frame sitting in the aperture
  vec2 ad = vec2(vWP.y - uAp.y, vWP.z - (uAp.z - 0.00074));
  float apMask = (1.0 - smoothstep(0.0072, 0.0082, abs(ad.x))) * (1.0 - smoothstep(0.0101, 0.0111, abs(ad.y)));
  float spill = exp(-dot(ad, ad) / (0.018 * 0.018)) * 0.25;
  totalEmissiveRadiance += trans * vec3(1.0, 0.93, 0.82) * uLight * (apMask * 6.0 + spill);
  totalEmissiveRadiance += vec3(0.95, 0.55, 0.2) * edgeGlow * 0.08 * (1.0 - hole);
  `);
    };
    mat.customProgramCacheKey = () => 'film-v1';
    this.material = mat;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'FILM';

    // flow overlay: chevrons glued to the film coordinate.  They glide on the sprockets and
    // jump frame by frame in the gate - the intermittent motion made visible.
    this.flowUniforms = { uOpacity: { value: 0 } };
    const flowMat = new THREE.ShaderMaterial({
      uniforms: this.flowUniforms,
      vertexShader: `attribute vec2 film; varying vec2 vF;
        void main(){ vF = film; vec3 p = position + normal * 0.0009; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uOpacity; varying vec2 vF;
        void main(){
          float x = abs(vF.x - 0.5) * 2.0;           // 0 centre .. 1 edge
          float y = fract(vF.y);                      // 0 downstream end of a frame .. 1 upstream
          float chev = y - 0.35 - x * 0.28;           // chevron pointing downstream
          float band = smoothstep(0.0, 0.03, chev) * (1.0 - smoothstep(0.1, 0.13, chev));
          float m = band * (1.0 - smoothstep(0.62, 0.7, x));
          if (m < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * m * uOpacity * 2.2, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false,
    });
    this.flow = new THREE.Mesh(g, flowMat);
    this.flow.frustumCulled = false;
    this.flow.renderOrder = 6;
    this.flow.visible = false;
    this.mesh.add(this.flow);
  }

  update() {
    const m = this.mech;
    const F = this.F;
    this.cFeedPack.r = m.rFeed;
    this.cTakePack.r = m.rTake;
    const D = m.D, G = m.G;
    const vC = m.vContinuous, vI = m.vIntermittent;

    // section A: pack -> valve rollers -> feed sprocket (exit at the left, heading up)
    const A = chain([this.cFeedPack, this.cValveUp, this.cSprFeed], undefined, Math.PI);
    const LA = polyLen(A);
    const LU = this.KB + (D - G);
    const U = [];
    this.loopU.sample(LU, U, 44);
    const LL = this.LL0 - (D - G);
    const Lw = [];
    this.loopL.sample(LL, Lw, 44);
    const Dsec = chain([this.cS2, this.cValveLo, this.cTakePack], Math.PI / 2, undefined);

    // assemble points + film coordinate + velocity
    const P = [], UF = [], VEL = [];
    const push = (pts, uf0, sign, v0, v1, skipFirst) => {
      let s = 0;
      const n = pts.length;
      let total = 0;
      for (let i = 1; i < n; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let i = 0; i < n; i++) {
        if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (skipFirst && i === 0) continue;
        P.push(pts[i]);
        UF.push(uf0 - s);
        VEL.push(v0 + (v1 - v0) * (total > 0 ? s / total : 0));
      }
    };
    push(A, D + LA, -1, vC, vC, false);                       // uf = D + (LA - s)
    push([[A[A.length - 1][0], A[A.length - 1][1]], ...U], D, -1, vC, vI, true);   // loop: D -> G-KB
    push(this.secB, G - this.KB, -1, vI, vI, true);
    const lastB = this.secB[this.secB.length - 1];
    push([lastB, ...Lw], G - this.KB - this.LB, -1, vI, vC, true);
    const ufC = D - this.KC;
    const C1 = this.secC;
    push(C1, ufC, -1, vC, vC, true);
    const LC = polyLen(C1);
    push([C1[C1.length - 1], ...this.secS], ufC - LC, -1, vC, vC, true);
    push(Dsec, ufC - LC - this.LS, -1, vC, vC, true);

    // write the ribbon
    if (P.length > this.maxVerts) throw new Error('Film path exceeds its geometry buffer');
    const n = P.length;
    const z0 = this.ZF - this.W / 2, z1 = this.ZF + this.W / 2;
    const pos = this.pos, nrm = this.nrm, film = this.film, vel = this.vel;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const q = P[Math.min(n - 1, i + 1)], o = P[Math.max(0, i - 1)];
      let tx = q[0] - o[0], ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const j = i * 6;
      pos[j] = p[0]; pos[j + 1] = p[1]; pos[j + 2] = z0;
      pos[j + 3] = p[0]; pos[j + 4] = p[1]; pos[j + 5] = z1;
      nrm[j] = nx; nrm[j + 1] = ny; nrm[j + 2] = 0; nrm[j + 3] = nx; nrm[j + 4] = ny; nrm[j + 5] = 0;
      const u = UF[i] / F;
      film[i * 4] = 0; film[i * 4 + 1] = u; film[i * 4 + 2] = 1; film[i * 4 + 3] = u;
      vel[i * 2] = VEL[i]; vel[i * 2 + 1] = VEL[i];
    }
    this.count = n;
    const g = this.geometry;
    g.setDrawRange(0, (n - 1) * 6);
    for (const attr of Object.values(g.attributes)) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 2 * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.points = P;
    this.lengths = { LA, LU, LL };
  }

  // film coordinate (frames) currently at the aperture centre
  get apertureFrames() { return (this.mech.G - this.KB - this.aperS) / this.F; }

  // Once shutter flashes are time-averaged, sample an exposed (stationary) frame too.
  // Sampling the moving strip with average brightness otherwise projects the dark pulldown.
  get projectionFrames() {
    const blend = this.mech.shutterEnabled ? THREE.MathUtils.smoothstep(this.mech.speed, 3.5, 9) : 0;
    return this.apertureFrames + (1 - this.mech.g) * blend;
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, NoiseEffect, ToneMappingEffect,
  ToneMappingMode, BlendFunction } from 'postprocessing';

import { Exhibit } from './scene/exhibit.js';
import { CameraRig } from './scene/camera.js';
import { buildEnvironment } from './scene/environment.js';
import { MODES, SHOTS } from './modes.js';
import { Panel } from './ui/panel.js';
import { Callouts } from './ui/callouts.js';
import { TimingCard, ScreenInset } from './ui/timing.js';
import { ProjectorAudio } from './audio.js';
import { Intro } from './intro.js';

const $ = (s) => document.querySelector(s);
const state = { mode: null, ready: false, started: false, uiShown: false };
const DEV = import.meta.env.DEV;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio = new ProjectorAudio();

function fatal(msg) {
  const el = $('#fatal');
  el.textContent = msg;
  el.hidden = false;
  state.failed = true;
  audio?.setEnabled(false);
  $('#intro')?.pause();
}


// ---------------------------------------------------------------------------------------
// Renderer & post
// ---------------------------------------------------------------------------------------
const canvas = $('#gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  fatal('Ta ekspozycja wymaga przeglądarki z obsługą WebGL 2 (aktualny Chrome, Edge, Firefox lub Safari) i włączonej akceleracji sprzętowej.');
  throw e;
}
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('Karta graficzna przerwała renderowanie (utrata kontekstu WebGL). Odśwież stronę, aby wrócić do ekspozycji.');
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.02, 60);

let exhibit, rig, composer, callouts, panel, timing, inset, bloom, noise, vignette;

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const progress = { glb: 0, atlas: 0 };
const setProgress = () => {
  const p = progress.glb * 0.85 + progress.atlas * 0.15;
  document.documentElement.style.setProperty('--load', p.toFixed(3));
};

async function load() {
  const layoutP = fetch('models/layout.json').then((r) => {
    if (!r.ok) throw new Error(`Layout: HTTP ${r.status}`);
    return r.json();
  });
  const atlasP = new Promise((res, rej) => new THREE.TextureLoader().load('media/film_atlas.jpg', (t) => { progress.atlas = 1; setProgress(); res(t); }, undefined, rej));
  const gltfP = new Promise((res, rej) => loader.load('models/exhibit.glb', res, (e) => { if (e.total) { progress.glb = e.loaded / e.total; setProgress(); } }, rej));
  const fontsP = Promise.all([
    document.fonts.load('400 40px "Marcellus SC"'), document.fonts.load('600 30px "Barlow Condensed"'),
    document.fonts.load('500 20px "Barlow Condensed"'), document.fonts.load('700 30px "Barlow Condensed"'),
    document.fonts.load('500 20px "IBM Plex Mono"'), document.fonts.load('600 20px "IBM Plex Mono"'),
    document.fonts.load('italic 30px "Cormorant Garamond"'),
  ]).catch(() => {});
  const [layout, atlas, gltf] = await Promise.all([layoutP, atlasP, gltfP, fontsP]);
  progress.glb = 1; setProgress();
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  atlas.generateMipmaps = true;

  exhibit = new Exhibit(renderer, layout, gltf, atlas);
  const env = buildEnvironment(renderer);
  exhibit.scene.environment = env;
  exhibit.scene.environmentIntensity = 0.55;
  exhibit.envIntensityBase = 0.55;

  rig = new CameraRig(camera, canvas, layout);
  rig.reducedMotion = reducedMotion;
  rig.enabled = false;
  rig.jumpTo(SHOTS.intro);

  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: Math.min(4, renderer.capabilities.maxSamples) });
  composer.addPass(new RenderPass(exhibit.scene, camera));
  bloom = new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
  vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
  noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.07;
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new EffectPass(camera, bloom, tone, vignette, noise));
  composer.setSize(window.innerWidth, window.innerHeight);

  // UI pieces
  callouts = new Callouts($('#callouts'), $('#callout-lines'), camera, groupOffset, focusOn);
  panel = new Panel($('#pulpit'), MODES, { mode: (id) => setMode(id, true), toggle: onToggle, speed: onSpeed });
  timing = new TimingCard($('#timing canvas'), exhibit.mech);
  inset = new ScreenInset($('#inset canvas'), atlas.image, exhibit.film, exhibit.mech);

  // warm up shaders so the transition does not stutter
  exhibit.mech.motorOn = true; exhibit.mech.lampOn = true;
  exhibit.update(0.016, camera.position);
  // compile in parallel (KHR_parallel_shader_compile) against the composer's input buffer,
  // so the program keys (colour space / tone mapping of an offscreen target) match what the
  // RenderPass will use; then one real render builds shadow and post programs.
  renderer.setRenderTarget(composer.inputBuffer);
  for (const cut of ['rear', null]) {
    exhibit.setCut(cut);
    await renderer.compileAsync(exhibit.scene, camera);
  }
  renderer.setRenderTarget(null);
  composer.render(0.016);
  state.ready = true;
  document.body.classList.add('ready');
  return layout;
}

function showUI() {
  document.body.classList.add('ui-on');
  state.uiShown = true;
  for (const id of ['pulpit', 'corner', 'callouts']) $('#' + id).inert = false;
}

function groupOffset(g) {
  const off = exhibit.L.groups[g];
  const k = exhibit.s.explode;
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const v = new THREE.Vector3();
  if (off) v.set(off[0] * e, off[1] * e, off[2] * e);
  // nested groups inherit their parent's offset
  if (g === 'GRP_gate' || g === 'GRP_intermittent' || g === 'GRP_shutter') {
    const p = exhibit.L.groups.GRP_head;
    v.add(new THREE.Vector3(p[0] * e, p[1] * e, p[2] * e));
  }
  return v;
}

function focusOn(lb, p) {
  audio.switchClick();
  if (lb.focus?.shot) { rig.idleDrift = false; rig.flyTo(SHOTS[lb.focus.shot], 2.2); return; }
  const dir = camera.position.clone().sub(p).normalize();
  const r = lb.focus?.r ?? 0.5;
  rig.flyTo({ pos: p.clone().addScaledVector(dir, r).toArray(), target: p.toArray(), fov: Math.min(camera.fov, 38), rMin: 0.15 }, 1.6);
}

// ---------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------
function setMode(id, fromUser) {
  const m = MODES.find((x) => x.id === id);
  if (!m || !exhibit) return;
  const same = state.mode === id;
  state.mode = id;
  if (fromUser) audio.switchClick();
  panel.setMode(id);
  const s = exhibit.s;
  s.dimT = m.dim; s.hazeT = m.haze; s.explodeT = m.explode; s.raysT = m.rays; s.coneT = m.cone; s.filmHiT = m.filmHi;
  exhibit.setDoors(m.doors);
  exhibit.setCut(m.cut);
  exhibit.mech.simulatedSlow = !!m.simulatedSlow;
  if (m.fps > 0) {
    exhibit.mech.targetFps = m.fps;
    panel.setSpeedValue(m.fps);
    if (!exhibit.mech.motorOn) { exhibit.mech.motorOn = true; panel.flip('motor', true, true); }
  } else {
    exhibit.mech.motorOn = false; panel.flip('motor', false, true);
  }
  if (m.lampOff) { exhibit.mech.lampOn = false; panel.flip('lamp', false, true); }
  else if (!exhibit.mech.lampOn) { exhibit.mech.lampOn = true; panel.flip('lamp', true, true); }
  if (!exhibit.mech.shutterEnabled) { exhibit.mech.shutterEnabled = true; panel.flip('shutter', true, true); }
  panel.flip('motor', exhibit.mech.motorOn, true);
  panel.flip('lamp', exhibit.mech.lampOn, true);
  panel.flip('shutter', exhibit.mech.shutterEnabled, true);
  rig.flyTo(SHOTS[m.shot], same ? 1.4 : 2.4);
  rig.idleDrift = id === 'work' && !reducedMotion;
  callouts.set(m.labels);
  $('#card-num').textContent = m.num;
  $('#card-title').textContent = m.title;
  $('#card-text').textContent = m.text;
  const card = $('#card');
  card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
  document.body.dataset.mode = id;
  $('#timing').classList.toggle('show', !!m.timing);
  $('#inset').classList.toggle('show', !!m.inset);
  $('#timing').setAttribute('aria-hidden', String(!m.timing));
  $('#inset').setAttribute('aria-hidden', String(!m.inset));
  if (m.timing) setTimeout(() => timing.resize(), 50);
}

function onToggle(k, v) {
  audio.switchClick();
  const mech = exhibit.mech;
  if (k === 'motor') mech.motorOn = v;
  if (k === 'lamp') mech.lampOn = v;
  if (k === 'shutter') mech.shutterEnabled = v;
}
function onSpeed(v) { audio.switchClick(); exhibit.mech.targetFps = v; }

// ---------------------------------------------------------------------------------------
// Intro -> exhibit
// ---------------------------------------------------------------------------------------
const intro = new Intro({
  video: $('#intro'), ticket: $('#ticket'), title: $('#title-overlay'), skip: $('#skip'),
  isReady: () => state.ready,
  onUserStart: () => { audio.init(); audio.resume(); },
  onHandover: () => {
    // the 3D scene takes over from the film's last shot: projector running, lamp on, heavy haze
    state.started = true;
    const mech = exhibit.mech;
    mech.motorOn = true; mech.lampOn = true; mech.speed = 24; mech.targetFps = 24;
    mech.douser = 1; mech.fireShutter = 1; exhibit.lamp = 1;
    exhibit.s.haze = exhibit.s.hazeT = 0.95;
    rig.jumpTo(SHOTS.intro);
    rig.flyTo({ ...SHOTS.intro, pos: [1.42, 1.07, 2.93] }, 2.6);  // continue the film's slow push-in
    audio.setLevel(1, 1.6);
  },
  onRevealed: () => {
    // settle into the exhibit
    exhibit.s.hazeT = 0.32;
    state.mode = null;
    setTimeout(() => {
      rig.enabled = true;
      setMode('work', false);
      rig.flyTo(SHOTS.hero, 4.2);
      panel.flip('motor', true, true); panel.flip('lamp', true, true); panel.flip('shutter', true, true);
    }, 300);
    setTimeout(showUI, reducedMotion ? 350 : 2600);
  },
});

// ---------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (!state.uiShown) return;
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const k = e.key.toLowerCase();
  // Space activates the focused native button; do not also toggle the motor.
  if (k === ' ' && e.target.closest('button, [role="button"]')) return;
  if (k >= '1' && k <= '6') setMode(MODES[+k - 1].id, true);
  else if (k === ' ') { e.preventDefault(); panel.flip('motor'); }
  else if (k === 'l') panel.flip('lamp');
  else if (k === 'm') panel.flip('shutter');
  else if (k === 'escape' || k === 'r') { const m = MODES.find((x) => x.id === state.mode); rig.flyTo(SHOTS[m.shot], 1.6); }
});
$('#sound').addEventListener('click', () => {
  audio.init(); audio.resume();
  audio.setEnabled(!audio.enabled);
  $('#sound').classList.toggle('off', !audio.enabled);
  $('#sound').setAttribute('aria-pressed', String(audio.enabled));
});
$('#labels').addEventListener('click', () => {
  callouts.visible = !callouts.visible;
  $('#labels').classList.toggle('off', !callouts.visible);
  $('#labels').setAttribute('aria-pressed', String(callouts.visible));
});
$('#screen-view').addEventListener('click', () => { audio.switchClick(); rig.idleDrift = false; rig.flyTo(SHOTS.port); });
$('#reset-view').addEventListener('click', () => {
  audio.switchClick();
  rig.idleDrift = state.mode === 'work' && !reducedMotion;
  rig.flyTo(SHOTS[MODES.find((m) => m.id === state.mode).shot]);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  else if (state.started) { audio.resume(); timer.reset(); }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  composer && composer.setSize(w, h);
  intro.layout();
});

// ---------------------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------------------
const timer = new THREE.Timer();
timer.connect(document);          // pauses the clock while the tab is hidden
// Adaptive quality also helps displays whose device pixel ratio is already 1.
const perf = { acc: 0, n: 0 };
function adaptQuality(dt) {
  if (!state.uiShown || dt <= 0 || document.hidden) return;
  perf.acc += dt; perf.n++;
  if (perf.n < 120) return;
  const avg = perf.acc / perf.n;
  if (DEV) canvas.dataset.performance = JSON.stringify({ fps: +(1 / avg).toFixed(1), pixelRatio: renderer.getPixelRatio(), viewport: [innerWidth, innerHeight], geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  perf.acc = 0; perf.n = 0;
  const ratio = renderer.getPixelRatio();
  if (avg > 1 / 40 && ratio > 0.65) {
    renderer.setPixelRatio(Math.max(0.65, ratio > 1 ? 1 : ratio * 0.8));
    composer.setSize(window.innerWidth, window.innerHeight);
  }
}
let uiElapsed = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  timer.update(ts);
  const elapsed = timer.getDelta();
  const dt = Math.min(0.1, elapsed);
  if (!state.ready || !state.started || state.failed || document.hidden) return;
  adaptQuality(elapsed);
  rig.update(dt);
  exhibit.update(dt, camera.position);
  audio.update(exhibit.mech);
  composer.render(dt);
  uiElapsed += dt;
  if (state.uiShown && uiElapsed >= 1 / 30) {
    uiElapsed %= 1 / 30;
    callouts.update(window.innerWidth, window.innerHeight);
    panel.update(exhibit.mech.speed, exhibit.mech.totalFrames);
    if (document.body.dataset.mode === 'slow') {
      timing.draw();
      inset.draw(exhibit.screenBrightness);
    }
  }
}
frame();

// development shortcut (dev server only): ?dev[&mode=slow][&jump] skips the film
const params = new URLSearchParams(location.search);
const loaded = load();
if (DEV && params.has('dev')) {
  loaded.then(() => {
    document.body.classList.add('playing', 'handover', 'revealed', 'placard-on', 'ui-on');
    state.started = true;
    const mech = exhibit.mech;
    mech.motorOn = true; mech.lampOn = true; mech.speed = 24; mech.douser = 1; mech.fireShutter = 1; exhibit.lamp = 1;
    rig.enabled = true;
    showUI();
    const mode = MODES.find((m) => m.id === params.get('mode')) || MODES[0];
    setMode(mode.id, false);
    if (params.has('jump')) rig.jumpTo(SHOTS[mode.shot]);
  }).catch(() => {}); // the shared loading error handler below reports failures
}
loaded.catch((err) => {
  console.error(err);
  fatal('Nie udało się wczytać ekspozycji (model lub tekstury). Sprawdź połączenie i odśwież stronę.');
});
// audit hook for tools/*.mjs (dev server only)
if (DEV) window.__exhibit = () => ({ exhibit, rig, camera, renderer, setMode, callouts });

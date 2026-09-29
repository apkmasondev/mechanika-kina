import * as THREE from 'three';
import { FILM_FRAMES_IN_ATLAS } from './mechanism.js';

// The auditorium screen shows exactly what sits in the aperture: film coordinate at the
// aperture -> picture (re-inverted by the lens), including the frame line sliding through
// when the shutter is disabled.  Brightness = lamp x douser x fire shutter x shutter.
export function makeScreenMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas }, uCols: { value: 12 }, uRows: { value: 7 }, uFrames: { value: FILM_FRAMES_IN_ATLAS },
      uAp: { value: 0.5 }, uBright: { value: 0 }, uGhost: { value: 0 }, uTime: { value: 0 }, uGain: { value: 2.2 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
uniform sampler2D uAtlas; uniform float uCols, uRows, uFrames, uAp, uBright, uGhost, uTime, uGain;
varying vec2 vUv;
vec3 atlasAt(float fi, vec2 uv){
  float f = mod(fi, uFrames); float col = mod(f, uCols); float row = floor(f/uCols);
  vec2 cell = vec2(col, uRows-1.0-row);
  return texture2D(uAtlas, (cell + clamp(uv, 0.002, 0.998)) / vec2(uCols, uRows)).rgb;
}
vec3 filmAt(float u, float sx){
  float fi = floor(u); float ymm = fract(u) * 19.0;
  vec2 iuv = vec2(0.5 + (sx - 0.5) * 20.96 / 22.0, 1.0 - (ymm - 1.5) / 16.0);
  float inPic = step(0.0, iuv.y) * step(iuv.y, 1.0);
  return atlasAt(fi, iuv) * inPic;
}
void main(){
  vec2 s = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * 1.04 + 0.5;   // glTF uv: v down
  float inside = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
  float u = uAp + (15.29 / 19.0) * (0.5 - s.y);
  vec3 col = filmAt(u, s.x);
  if (uGhost > 0.001) {
    vec3 g = vec3(0.0);
    for (int k = 1; k <= 6; k++) g += filmAt(u - float(k) / 7.0, s.x);
    col = mix(col, g / 6.0, 0.25 * uGhost);
  }
  vec2 d = s - 0.5;
  float vig = 1.0 - 0.55 * dot(d, d);
  float grain = 0.96 + 0.08 * fract(sin(dot(s * 913.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 c = col * uBright * vig * grain * uGain * inside;
  // faint lens flare halo just outside the picture
  float halo = (1.0 - inside) * exp(-max(max(abs(d.x) - 0.5, abs(d.y) - 0.5), 0.0) * 40.0) * 0.03 * uBright;
  gl_FragColor = vec4(c + vec3(halo), 1.0);
}`,
    toneMapped: false,
  });
}

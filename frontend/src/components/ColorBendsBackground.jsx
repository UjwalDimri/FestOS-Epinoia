import { useEffect, useRef } from 'react';

// Lightweight WebGL port of the ColorBends shader used by the UPES IET About page.
const fragmentShader = `
precision highp float;
#define MAX_COLORS 8
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  q += (uPointer - rp) * uMouseInfluence * 0.2;
  for (int j = 0; j < 5; j++) {
    if (j >= uIterations - 1) break;
    vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
    q += (rr - q) * 0.15;
  }
  vec2 s = q;
  vec3 col = vec3(0.0);
  float cover = 0.0;
  for (int i = 0; i < MAX_COLORS; ++i) {
    if (i >= uColorCount) break;
    s -= 0.01;
    vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
    float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
    float kBelow = clamp(uWarpStrength, 0.0, 1.0);
    float kMix = pow(kBelow, 0.3);
    float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
    vec2 warped = s + (r - s) * kBelow * gain;
    float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
    float m = mix(m0, m1, kMix);
    float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
    col += uColors[i] * w;
    cover = max(cover, w);
  }
  col = clamp(col * uIntensity, 0.0, 1.0);
  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col = clamp(col + (n - 0.5) * uNoise, 0.0, 1.0);
  }
  gl_FragColor = vec4(col * cover, cover);
}`;

const vertexShader = `
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
void main() { vUv = aUv; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const COLORS = ['#d946ef'];

export default function ColorBendsBackground({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return undefined;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return undefined;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1,
      -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    const uv = gl.getAttribLocation(program, 'aUv');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uniform = (name) => gl.getUniformLocation(program, name);
    const uniforms = {
      canvas: uniform('uCanvas'), time: uniform('uTime'), speed: uniform('uSpeed'), rot: uniform('uRot'),
      colorCount: uniform('uColorCount'), colors: uniform('uColors[0]'), scale: uniform('uScale'),
      frequency: uniform('uFrequency'), warp: uniform('uWarpStrength'), pointer: uniform('uPointer'),
      mouse: uniform('uMouseInfluence'), parallax: uniform('uParallax'), noise: uniform('uNoise'),
      iterations: uniform('uIterations'), intensity: uniform('uIntensity'), bandWidth: uniform('uBandWidth'),
    };
    const hex = COLORS[0].slice(1);
    gl.uniform3fv(uniforms.colors, new Float32Array([parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, ...new Array(21).fill(0)]));
    gl.uniform1i(uniforms.colorCount, 1);
    gl.uniform1f(uniforms.speed, 0.2);
    gl.uniform1f(uniforms.scale, 1);
    gl.uniform1f(uniforms.frequency, 1);
    gl.uniform1f(uniforms.warp, 1);
    gl.uniform1f(uniforms.mouse, 1);
    gl.uniform1f(uniforms.parallax, 0.5);
    gl.uniform1f(uniforms.noise, 0.15);
    gl.uniform1i(uniforms.iterations, 1);
    gl.uniform1f(uniforms.intensity, 1);
    gl.uniform1f(uniforms.bandWidth, 6);

    const pointer = [0, 0];
    const onPointer = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer[0] = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer[1] = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.canvas, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    gl.uniform2f(uniforms.rot, 0, 1); // About page uses 90° rotation.

    let frame = 0;
    const start = performance.now();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pointerCurrent = [0, 0];
    const render = (now) => {
      const elapsed = reduceMotion ? 0 : (now - start) / 1000;
      const ease = Math.min(1, 0.016 * 8);
      pointerCurrent = pointerCurrent.map((value, index) => value + (pointer[index] - value) * ease);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform2f(uniforms.pointer, pointerCurrent[0], pointerCurrent[1]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className={`color-bends-background ${className}`} aria-hidden="true" />;
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SphereGrid } from './analysis/analyze';
import type { Design } from './model';
import { boomLength } from './model';
import { hideTip, showTip } from './charts';

// 3D gain pattern with the antenna at the centre. Axes match the analysis
// (Lawson Fig. 1.1): boom along +x (forward), elements along z, and +y is up,
// so the picture is a horizontal Yagi. Radius ∝ gain in dB above a floor
// `range` dB below the peak; colour uses the same scale (sequential blue,
// dark = low, light = high, validated ramp from the dataviz palette).

const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5',
  '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'].map((h) => new THREE.Color(h));

export function rampColor(t: number, out = new THREE.Color()): THREE.Color {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  return out.copy(RAMP[i]!).lerp(RAMP[i + 1]!, x - i);
}
export const RAMP_CSS = `linear-gradient(to right, ${RAMP.map((c) => `#${c.getHexString()}`).join(', ')})`;

export interface Pattern3DOptions { range: number; seeThrough: boolean }

export class Pattern3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  private controls: OrbitControls;
  private surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  private antenna = new THREE.Group();
  private grid: SphereGrid | null = null;
  private peak = 0;
  private labels: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  private raycaster = new THREE.Raycaster();
  opts: Pattern3DOptions = { range: 30, seeThrough: true };

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.append(this.renderer.domElement);

    this.camera.position.set(2.6, 1.7, 2.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => this.render());

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 3, 4);
    this.camera.add(sun); // light follows the view so the shape always reads
    this.scene.add(this.camera);

    this.surface = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true,
    }));
    this.scene.add(this.surface, this.antenna);

    // axis cues: forward arrow and up arrow, with HTML labels
    const muted = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8d98b8');
    this.scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.25, muted, 0.06, 0.035));
    this.scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.9, muted, 0.06, 0.035));
    for (const [text, at] of [['forward', new THREE.Vector3(1.33, 0, 0)], ['up', new THREE.Vector3(0, 0.98, 0)]] as const) {
      const el = document.createElement('span');
      el.className = 'axis3d';
      el.textContent = text;
      host.append(el);
      this.labels.push({ el, at });
    }

    new ResizeObserver(() => this.resize()).observe(host);
    this.renderer.domElement.addEventListener('pointermove', (e) => this.hover(e));
    this.renderer.domElement.addEventListener('pointerleave', hideTip);
    this.resize();
  }

  setAntenna(d: Design): void {
    this.antenna.clear();
    const span = Math.max(boomLength(d), ...d.elements.map((e) => e.length));
    if (!(span > 0)) return;
    const s = 0.75 / span; // antenna's largest dimension → 0.75 of the unit pattern radius
    const xs = d.elements.map((e) => e.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const css = getComputedStyle(document.documentElement);
    const col = (v: string, fb: string) => new THREE.Color(css.getPropertyValue(v).trim() || fb);
    const rod = (len: number, r: number, color: THREE.Color) =>
      new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), new THREE.MeshLambertMaterial({ color }));
    const boom = rod(Math.max(boomLength(d) * s, 0.01), 0.008, col('--muted', '#8d98b8'));
    boom.rotation.z = Math.PI / 2; // cylinder axis y → x
    this.antenna.add(boom);
    for (const e of d.elements) {
      const color = e.role === 'driven' ? col('--accent', '#f5d76e') : e.role === 'reflector' ? col('--muted', '#8d98b8') : col('--target', '#5ec8ff');
      const m = rod(e.length * s, 0.006, color);
      m.rotation.x = Math.PI / 2; // cylinder axis y → z
      m.position.x = (e.x - mid) * s;
      this.antenna.add(m);
    }
    this.render();
  }

  setPattern(grid: SphereGrid): void {
    this.grid = grid;
    this.peak = Math.max(...grid.gainDbi);
    this.rebuild();
  }

  setOptions(o: Partial<Pattern3DOptions>): void {
    Object.assign(this.opts, o);
    this.rebuild();
  }

  get peakDbi(): number { return this.peak; }

  private rebuild(): void {
    const g = this.grid;
    if (!g) return;
    const { nTheta, nPhi, gainDbi } = g, cols = nPhi + 1;
    const floor = this.peak - this.opts.range;
    const pos = new Float32Array(gainDbi.length * 3), color = new Float32Array(gainDbi.length * 3);
    const c = new THREE.Color();
    for (let i = 0; i <= nTheta; i++) {
      const th = (i * Math.PI) / nTheta;
      for (let j = 0; j <= nPhi; j++) {
        const ph = (j * 2 * Math.PI) / nPhi, k = i * cols + j;
        const t = Math.max(0, gainDbi[k]! - floor) / this.opts.range;
        pos[3 * k] = t * Math.sin(th) * Math.cos(ph);
        pos[3 * k + 1] = t * Math.sin(th) * Math.sin(ph);
        pos[3 * k + 2] = t * Math.cos(th);
        rampColor(t, c);
        color[3 * k] = c.r; color[3 * k + 1] = c.g; color[3 * k + 2] = c.b;
      }
    }
    const geo = this.surface.geometry;
    if (geo.getAttribute('position')?.count !== gainDbi.length) {
      const idx: number[] = [];
      for (let i = 0; i < nTheta; i++) for (let j = 0; j < nPhi; j++) {
        const a = i * cols + j, b = a + cols;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      geo.setIndex(idx);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = this.surface.material;
    mat.opacity = this.opts.seeThrough ? 0.55 : 1;
    mat.depthWrite = !this.opts.seeThrough;
    mat.needsUpdate = true;
    this.render();
  }

  /** Gain (dBi) in a unit direction, nearest grid point. */
  private gainAt(u: THREE.Vector3): number {
    const g = this.grid!;
    const th = Math.acos(Math.min(Math.max(u.z, -1), 1));
    let ph = Math.atan2(u.y, u.x);
    if (ph < 0) ph += 2 * Math.PI;
    const i = Math.round((th / Math.PI) * g.nTheta), j = Math.round((ph / (2 * Math.PI)) * g.nPhi);
    return g.gainDbi[i * (g.nPhi + 1) + j]!;
  }

  private hover(e: PointerEvent): void {
    if (!this.grid || e.buttons) { hideTip(); return; }
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObject(this.surface)[0];
    if (!hit || hit.point.lengthSq() < 1e-6) { hideTip(); return; }
    const u = hit.point.clone().normalize();
    // horizontal Yagi: azimuth in the plane of the elements, elevation toward +y
    const az = (Math.atan2(u.z, u.x) * 180) / Math.PI, el = (Math.asin(u.y) * 180) / Math.PI;
    showTip(e, `Az ${az.toFixed(0)}° · El ${el.toFixed(0)}°`, [{ key: 'none', label: 'gain', value: `${this.gainAt(u).toFixed(1)} dBi` }]);
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const { el, at } of this.labels) {
      const p = at.clone().project(this.camera);
      el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
      el.hidden = p.z > 1;
    }
  }
}

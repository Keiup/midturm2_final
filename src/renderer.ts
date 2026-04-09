import type { Mesh } from "./objLoader";
import { Camera } from "./camera";
import { vec3, transformVec3, transformDir } from "./math";
import type { Vec3 } from "./math";
import { Arcball } from "./arcball";

//モデル設定
export type ModelConfig = {
  name: string;
  center: Vec3;
  scale: number;
  camZ: number;
};

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  teapot: {
    name: "teapot",
    center: [0.217, 1.575, 0],
    scale: 1 / 3.434,
    camZ: -3,
  },
  beacon: {
    name: "KAUST_Beacon",
    center: [125, 125, 125],
    scale: 1 / 125,
    camZ: -3,
  },
};

//シェーディングモード
export type ShadingMode = "gouraud" | "phong" | "wireframe" | "normal";

interface ScreenPt { x: number; y: number; z: number; }

//Gouraud用：頂点ごとのライティング計算
function computeLighting(N: Vec3, lightDir: Vec3, viewDir: Vec3): number {
  const ambient = 0.2;
  const diff = Math.max(0, vec3.dot(N, lightDir));
  const reflect = vec3.sub(vec3.scale(N, 2 * vec3.dot(N, lightDir)), lightDir);
  const spec = Math.pow(Math.max(0, vec3.dot(reflect, viewDir)), 32);
  return ambient + 0.7 * diff + 0.5 * spec;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  arcball: Arcball;

  fov: number = 60 * Math.PI / 180;
  shadingMode: ShadingMode = "phong";

  private imageData!: ImageData;
  private depthBuffer!: Float32Array;

  //法線バッファ（RGB = XYZ, 0〜255にエンコード）
  private normalBuffer!: Float32Array; // float XYZ * 3 per pixel

  private texture!: ImageData;
  hasTexture = false;

  modelConfig: ModelConfig = MODEL_CONFIGS.teapot;

  //ライト方向（カメラの少し上）
  private readonly lightDir: Vec3 = vec3.normalize([0.3, 0.8, 0.5]);
  private readonly viewDir: Vec3  = [0, 0, 1];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.camera = new Camera();
    this.arcball = new Arcball();

    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas());

    this.camera.position = [0, 0, 3];
    this.camera.yaw = -Math.PI / 2;

    //テクスチャ読み込み
    const img = new Image();
    img.src = "texture.png";
    img.onload = () => {
      const tmp = document.createElement("canvas");
      tmp.width = img.width;
      tmp.height = img.height;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(img, 0, 0);
      this.texture = tctx.getImageData(0, 0, img.width, img.height);
      this.hasTexture = true;
    };

    //ズーム（FOV変更）
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.fov += e.deltaY * 0.002;
      this.fov = Math.max(20 * Math.PI / 180, Math.min(100 * Math.PI / 180, this.fov));
    });

    this._registerMouseEvents();
  }

  //モデル切り替え
  setModel(cfg: ModelConfig) {
    this.modelConfig = cfg;
    this.camera.position = [0, 0, cfg.camZ];
  }

  //バッファ管理
  private _resizeCanvas() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const n = this.canvas.width * this.canvas.height;
    this.imageData    = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    this.depthBuffer  = new Float32Array(n);
    this.normalBuffer = new Float32Array(n * 3); //XYZ per pixel
  }

  private _clear() {
    const d = this.imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 30; d[i+1] = 30; d[i+2] = 30; d[i+3] = 255;
    }
    this.depthBuffer.fill(Infinity);
    this.normalBuffer.fill(0);
  }

  //ピクセル書き込み
  private _setPixel(x: number, y: number, z: number, r: number, g: number, b: number) {
    const W = this.canvas.width;
    if (x < 0 || y < 0 || x >= W || y >= this.canvas.height) return;
    const idx = y * W + x;
    if (z >= this.depthBuffer[idx]) return;
    this.depthBuffer[idx] = z;
    const i = idx * 4;
    this.imageData.data[i]   = Math.min(255, Math.max(0, r));
    this.imageData.data[i+1] = Math.min(255, Math.max(0, g));
    this.imageData.data[i+2] = Math.min(255, Math.max(0, b));
    this.imageData.data[i+3] = 255;
  }

  //法線バッファへの書き込み、必ず_setPixelの直後に呼ぶ
  //_setPixelを通過したピクセルのみdepthBuffer[idx]===zになるため再チェック
  private _setNormal(x: number, y: number, z: number, N: Vec3) {
    const W = this.canvas.width;
    if (x < 0 || y < 0 || x >= W || y >= this.canvas.height) return;
    const idx = y * W + x;
    //setPixelで書き込まれたzと一致するときだけ更新（浮動小数点一致を利用）
    if (this.depthBuffer[idx] !== z) return;
    const ni = idx * 3;
    this.normalBuffer[ni]   = N[0];
    this.normalBuffer[ni+1] = N[1];
    this.normalBuffer[ni+2] = N[2];
  }

  //投影
  private _project(v: Vec3): ScreenPt | null {
    if (v[2] >= -0.1) return null; //nearクリップ
    const f = (this.canvas.width / 2) / Math.tan(this.fov / 2);
    const invZ = 1 / (-v[2]); //カメラ空間はZ負方向
    return {
      x: this.canvas.width  / 2 + v[0] * f * invZ,
      y: this.canvas.height / 2 - v[1] * f * invZ,
      z: -v[2],
    };
  }

  //テクスチャ
  private _getUV(p: Vec3): [number, number] {
    const [x, y, z] = vec3.normalize(p);
    const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
    const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI;
    return [u, v];
  }

  private _sample(u: number, v: number): [number, number, number] {
    if (!this.hasTexture) return [255, 255, 255];
    const w = this.texture.width, h = this.texture.height;
    const tx = ((Math.floor(u * w) % w) + w) % w;
    const ty = ((Math.floor(v * h) % h) + h) % h;
    const i = (ty * w + tx) * 4;
    return [this.texture.data[i], this.texture.data[i+1], this.texture.data[i+2]];
  }

  //ワイヤーフレーム描画（Bresenham + Zバッファ）
  private _drawLine(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number
  ) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const steps = Math.max(dx, dy) || 1;
    let step = 0;
    while (true) {
      const t = step / steps;
      const z = z0 + (z1 - z0) * t; //Zを線形補間
      this._setPixel(x0, y0, z, 255, 255, 255);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 <  dx) { err += dx; y0 += sy; }
      step++;
    }
  }

  //ラスタライザ（Phong / Gouraud / Normal）
  private _rasterize(
    p0: ScreenPt, p1: ScreenPt, p2: ScreenPt,
    n0: Vec3,     n1: Vec3,     n2: Vec3,
    w0: Vec3,     w1: Vec3,     w2: Vec3, //ワールド空間（テクスチャUV用）
    i0: number,   i1: number,   i2: number //Gouraud用：頂点輝度
  ) {
    const W = this.canvas.width, H = this.canvas.height;
    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxX = Math.min(W-1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxY = Math.min(H-1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));

    const area = (p1.x-p0.x)*(p2.y-p0.y) - (p2.x-p0.x)*(p1.y-p0.y);
    if (Math.abs(area) < 0.5) return;
    const invA = 1 / area;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5, cy = y + 0.5;

        //重心座標（各biは対応する頂点piの重み）
        //b0: p0の重みはp1-p2辺から距離で計算
        //b1: p1の重みはp2-p0辺から距離で計算
        //b2: p2の重み = 1 - b0 - b1
        const b0 = ((p2.x-p1.x)*(cy-p1.y) - (p2.y-p1.y)*(cx-p1.x)) * invA;
        const b1 = ((p0.x-p2.x)*(cy-p2.y) - (p0.y-p2.y)*(cx-p2.x)) * invA;
        const b2 = 1 - b0 - b1;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue;

        //深度補間
        const z = b0*p0.z + b1*p1.z + b2*p2.z;

        //法線補間
        const N = vec3.normalize([
          b0*n0[0] + b1*n1[0] + b2*n2[0],
          b0*n0[1] + b1*n1[1] + b2*n2[1],
          b0*n0[2] + b1*n1[2] + b2*n2[2],
        ] as Vec3);

        let intensity: number;

        if (this.shadingMode === "gouraud") {
          //Gouraud：頂点で計算した輝度を補間（各biと対応する頂点輝度を正しく対応させる）
          intensity = b0*i0 + b1*i1 + b2*i2;
        } else {
          //Phong：フラグメントごとにライティング計算
          intensity = computeLighting(N, this.lightDir, this.viewDir);
        }

        let r: number, g: number, b_: number;

        if (this.shadingMode === "normal") {
          //ノーマルビジュアライズ（デバッグ用）
          r = (N[0] * 0.5 + 0.5) * 255;
          g = (N[1] * 0.5 + 0.5) * 255;
          b_ = (N[2] * 0.5 + 0.5) * 255;
        } else if (this.hasTexture) {
          const P: Vec3 = [
            b0*w0[0] + b1*w1[0] + b2*w2[0],
            b0*w0[1] + b1*w1[1] + b2*w2[1],
            b0*w0[2] + b1*w1[2] + b2*w2[2],
          ];
          [r, g, b_] = this._sample(...this._getUV(P));
          r = r * intensity; g = g * intensity; b_ = b_ * intensity;
        } else {
          r = 180 * intensity; g = 200 * intensity; b_ = 255 * intensity;
        }

        this._setPixel(x, y, z, r, g, b_);

        //法線バッファへの書き込み（_setPixelの後＝深度テスト通過後に書き込む）
        this._setNormal(x, y, z, N);
      }
    }
  }

  //メイン描画
  drawMesh(mesh: Mesh) {
    this._clear();

    const view = this.camera.getViewMatrix();
    const rot  = this.arcball.getRotationMatrix();
    const cfg  = this.modelConfig;

    const isWire   = this.shadingMode === "wireframe";
    const isGouraud = this.shadingMode === "gouraud";

    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const f = mesh.faces[fi];

      const pts:  (ScreenPt | null)[] = [];
      const camVerts: import("./math").Vec3[] = [];
      const rotNorms: Vec3[] = [];
      const rotVerts: Vec3[] = [];

      for (let i = 0; i < 3; i++) {
        const v = mesh.vertices[f[i]];
        const n = mesh.vertexNormals[f[i]];

        //モデルをローカル正規化（中心を原点に、スケール1程度に）
        const local: Vec3 = [
          (v[0] - cfg.center[0]) * cfg.scale,
          (v[1] - cfg.center[1]) * cfg.scale,
          (v[2] - cfg.center[2]) * cfg.scale,
        ];

        //Arcball回転
        const rv: Vec3 = [
          rot[0]*local[0] + rot[4]*local[1] + rot[8]*local[2],
          rot[1]*local[0] + rot[5]*local[1] + rot[9]*local[2],
          rot[2]*local[0] + rot[6]*local[1] + rot[10]*local[2],
        ];
        const rn: Vec3 = vec3.normalize([
          rot[0]*n[0] + rot[4]*n[1] + rot[8]*n[2],
          rot[1]*n[0] + rot[5]*n[1] + rot[9]*n[2],
          rot[2]*n[0] + rot[6]*n[1] + rot[10]*n[2],
        ]);

        rotVerts.push(rv);
        rotNorms.push(rn);

        //カメラ空間
        const cv = transformVec3(view, rv);
        camVerts.push(cv);
        pts.push(this._project(cv));
      }

      //nearクリッピング（Sutherland-Hodgman簡易版）
      //3頂点のうち1つでもz >= -0.1なら三角形をクリップ
      const allBehind = camVerts.every(v => v[2] >= -0.1);
      if (allBehind) continue;

      const someBehind = camVerts.some(v => v[2] >= -0.1);
      if (someBehind) {
        //クリッピング：nearプレーンで切断し新しい頂点を生成
        type CV = { cam: Vec3; rn: Vec3; rv: Vec3 };
        const NEAR = 0.1;
        const clipVerts: CV[] = camVerts.map((cam, i) => ({
          cam, rn: rotNorms[i], rv: rotVerts[i]
        }));

        const inside = (v: CV) => v.cam[2] < -NEAR;
        const lerpCV = (a: CV, b: CV, t: number): CV => ({
          cam: [
            a.cam[0] + (b.cam[0]-a.cam[0])*t,
            a.cam[1] + (b.cam[1]-a.cam[1])*t,
            a.cam[2] + (b.cam[2]-a.cam[2])*t,
          ],
          rn: vec3.normalize([
            a.rn[0] + (b.rn[0]-a.rn[0])*t,
            a.rn[1] + (b.rn[1]-a.rn[1])*t,
            a.rn[2] + (b.rn[2]-a.rn[2])*t,
          ]),
          rv: [
            a.rv[0] + (b.rv[0]-a.rv[0])*t,
            a.rv[1] + (b.rv[1]-a.rv[1])*t,
            a.rv[2] + (b.rv[2]-a.rv[2])*t,
          ],
        });

        //Sutherland-Hodgman でnearプレーン
        let poly = clipVerts;
        const output: CV[] = [];
        for (let i = 0; i < poly.length; i++) {
          const cur  = poly[i];
          const next = poly[(i+1) % poly.length];
          const ci = inside(cur), ni = inside(next);
          if (ci) output.push(cur);
          if (ci !== ni) {
            const t = (cur.cam[2] + NEAR) / (cur.cam[2] - next.cam[2]);
            output.push(lerpCV(cur, next, t));
          }
        }
        if (output.length < 3) continue;

        //ファントライアングル分割
        for (let i = 1; i < output.length - 1; i++) {
          const tri = [output[0], output[i], output[i+1]];
          const sp = tri.map(v => this._project(v.cam));
          if (sp.some(p => p === null)) continue;
          const [s0, s1, s2] = sp as ScreenPt[];
          const area = (s1.x-s0.x)*(s2.y-s0.y) - (s1.y-s0.y)*(s2.x-s0.x);
          if (area >= 0) continue; //裏面カリング
          if (isWire) {
            this._drawLine(s0.x, s0.y, s0.z, s1.x, s1.y, s1.z);
            this._drawLine(s1.x, s1.y, s1.z, s2.x, s2.y, s2.z);
            this._drawLine(s2.x, s2.y, s2.z, s0.x, s0.y, s0.z);
          } else {
            const i0g = isGouraud ? computeLighting(tri[0].rn, this.lightDir, this.viewDir) : 0;
            const i1g = isGouraud ? computeLighting(tri[1].rn, this.lightDir, this.viewDir) : 0;
            const i2g = isGouraud ? computeLighting(tri[2].rn, this.lightDir, this.viewDir) : 0;
            this._rasterize(s0, s1, s2, tri[0].rn, tri[1].rn, tri[2].rn,
              tri[0].rv, tri[1].rv, tri[2].rv, i0g, i1g, i2g);
          }
        }
        continue;
      }

      if (pts.some(p => p === null)) continue;
      const [p0, p1, p2] = pts as ScreenPt[];

      //裏面カリング
      const area = (p1.x-p0.x)*(p2.y-p0.y) - (p1.y-p0.y)*(p2.x-p0.x);
      if (area >= 0) continue;

      if (isWire) {
        //ワイヤーフレーム（Z補間あり）
        this._drawLine(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        this._drawLine(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        this._drawLine(p2.x, p2.y, p2.z, p0.x, p0.y, p0.z);
      } else {
        //Gouraud：頂点で輝度計算
        const ig0 = isGouraud ? computeLighting(rotNorms[0], this.lightDir, this.viewDir) : 0;
        const ig1 = isGouraud ? computeLighting(rotNorms[1], this.lightDir, this.viewDir) : 0;
        const ig2 = isGouraud ? computeLighting(rotNorms[2], this.lightDir, this.viewDir) : 0;

        this._rasterize(
          p0, p1, p2,
          rotNorms[0], rotNorms[1], rotNorms[2],
          rotVerts[0], rotVerts[1], rotVerts[2],
          ig0, ig1, ig2
        );
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  //法線バッファをImageDataとして取得（デバッグ・表示用）
  getNormalBufferImageData(): ImageData {
    const W = this.canvas.width, H = this.canvas.height;
    const out = new ImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      out.data[i*4]   = Math.floor((this.normalBuffer[i*3]   * 0.5 + 0.5) * 255);
      out.data[i*4+1] = Math.floor((this.normalBuffer[i*3+1] * 0.5 + 0.5) * 255);
      out.data[i*4+2] = Math.floor((this.normalBuffer[i*3+2] * 0.5 + 0.5) * 255);
      out.data[i*4+3] = 255;
    }
    return out;
  }

  //マウスイベント
  private _registerMouseEvents() {
    const c = this.canvas;

    c.addEventListener("mousedown", e => {
      const r = c.getBoundingClientRect();
      this.arcball.onMouseDown(e.clientX - r.left, e.clientY - r.top, c.width, c.height);
    });
    c.addEventListener("mousemove", e => {
      const r = c.getBoundingClientRect();
      this.arcball.onMouseMove(e.clientX - r.left, e.clientY - r.top);
    });
    c.addEventListener("mouseup",  () => this.arcball.onMouseUp());
    window.addEventListener("mouseup", () => this.arcball.onMouseUp());

    //タッチ操作
    c.addEventListener("touchstart", e => {
      e.preventDefault();
      const t = e.touches[0];
      const r = c.getBoundingClientRect();
      this.arcball.onMouseDown(t.clientX - r.left, t.clientY - r.top, c.width, c.height);
    }, { passive: false });
    c.addEventListener("touchmove", e => {
      e.preventDefault();
      const t = e.touches[0];
      const r = c.getBoundingClientRect();
      this.arcball.onMouseMove(t.clientX - r.left, t.clientY - r.top);
    }, { passive: false });
    c.addEventListener("touchend", () => this.arcball.onMouseUp());
  }
}
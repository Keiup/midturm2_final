import { loadOBJ } from "./objLoader";
import { Renderer, MODEL_CONFIGS } from "./renderer";
import type { ShadingMode } from "./renderer";

async function main() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const renderer = new Renderer(canvas);

  

  //UI要素
  const modelSelect   = document.getElementById("modelSelect")   as HTMLSelectElement;
  const shadingSelect = document.getElementById("shadingSelect") as HTMLSelectElement;
  const normalBtn     = document.getElementById("normalBtn")     as HTMLButtonElement;
  const fpsEl         = document.getElementById("fps")           as HTMLSpanElement;

  //OBJ読み込み
  let currentFile = "teapot.obj";

  async function loadModel(filename: string) {
    //const res  = await fetch('/'+filename);
    //const res = await fetch(new URL(filename, import.meta.url).href);
    const res = await fetch(import.meta.env.BASE_URL + filename);
    fetch(import.meta.env.BASE_URL + filename)
    const text = await res.text();
    return loadOBJ(text);
  }

  let mesh = await loadModel(currentFile);
  console.log("mesh loaded:", mesh.vertices.length, "vertices,", mesh.faces.length, "faces");

  //モデル切り替え
  modelSelect.addEventListener("change", async () => {
    const name = modelSelect.value as keyof typeof MODEL_CONFIGS;
    currentFile = name + ".obj";
    renderer.setModel(MODEL_CONFIGS[name]);
    mesh = await loadModel(currentFile);
    console.log("switched to", name, mesh.vertices.length, "v,", mesh.faces.length, "f");
  });

  //シェーディングモード切り替え
  shadingSelect.addEventListener("change", () => {
    renderer.shadingMode = shadingSelect.value as ShadingMode;
  });

  //法線バッファ表示
  let showNormal = false;
  const offscreenCtx = document.createElement("canvas").getContext("2d")!;
  normalBtn.addEventListener("click", () => {
    showNormal = !showNormal;
    normalBtn.textContent = showNormal ? "通常表示" : "法線バッファ表示";
  });

  //キーボード
  const keys = new Set<string>();
  window.addEventListener("keydown", e => {
    keys.add(e.key);
    //ショートカット
    if (e.key === "1") shadingSelect.value = "gouraud",   renderer.shadingMode = "gouraud";
    if (e.key === "2") shadingSelect.value = "phong",     renderer.shadingMode = "phong";
    if (e.key === "3") shadingSelect.value = "wireframe", renderer.shadingMode = "wireframe";
    if (e.key === "4") shadingSelect.value = "normal",    renderer.shadingMode = "normal";
    if (e.key === "n") { showNormal = !showNormal; normalBtn.textContent = showNormal ? "通常表示" : "法線バッファ表示"; }
  });
  window.addEventListener("keyup", e => keys.delete(e.key));

  //メインループ
  let last = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  function loop(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    renderer.camera.update(keys, dt);
    renderer.drawMesh(mesh);

    //法線バッファ表示
    if (showNormal) {
      const nbuf = renderer.getNormalBufferImageData();
      offscreenCtx.canvas.width  = canvas.width;
      offscreenCtx.canvas.height = canvas.height;
      offscreenCtx.putImageData(nbuf, 0, 0);
      renderer["ctx"].drawImage(offscreenCtx.canvas, 0, 0);
    }

    //FPS表示
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsEl.textContent = (frameCount / fpsTimer).toFixed(1);
      frameCount = 0; fpsTimer = 0;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
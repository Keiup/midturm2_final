import type { Vec3 } from "./math";
import { vec3 } from "./math";

export interface Mesh {
  vertices: Vec3[];
  faces: number[][];       //各面3頂点のインデックス
  faceNormals: Vec3[];     //面ごとの法線
  vertexNormals: Vec3[];   //頂点ごとの法線、面法線の加重平均
}

export function loadOBJ(text: string): Mesh {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];

  for (let line of text.split("\n")) {
    line = line.trim();
    if (line === "" || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);

    if (parts[0] === "v") {
      vertices.push([
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      ]);
    }

    if (parts[0] === "f") {
      //"f v1/vt1/vn1 v2/vt2/vn2 ..."  頂点インデックスのみ取得
      const indices = parts.slice(1).map(p => parseInt(p.split("/")[0]) - 1);

      // ポリゴンをファントライアングル化（クワッド・N角形対応）
      for (let i = 1; i < indices.length - 1; i++) {
        faces.push([indices[0], indices[i], indices[i + 1]]);
      }
    }
  }

  //面法線、角度加重なし・単純クロス積
  const faceNormals: Vec3[] = [];
  for (const f of faces) {
    const v0 = vertices[f[0]];
    const v1 = vertices[f[1]];
    const v2 = vertices[f[2]];
    const n = vec3.normalize(vec3.cross(vec3.sub(v1, v0), vec3.sub(v2, v0)));
    faceNormals.push(n);
  }

  //頂点法線、面法線の加算平均を正規化
  const vertexNormals: Vec3[] = vertices.map(() => [0, 0, 0] as Vec3);
  for (let i = 0; i < faces.length; i++) {
    const n = faceNormals[i];
    for (const idx of faces[i]) {
      vertexNormals[idx] = vec3.add(vertexNormals[idx], n);
    }
  }
  for (let i = 0; i < vertexNormals.length; i++) {
    vertexNormals[i] = vec3.normalize(vertexNormals[i]);
  }

  return { vertices, faces, faceNormals, vertexNormals };
}
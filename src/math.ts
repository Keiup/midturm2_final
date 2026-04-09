//型定義
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = number[]; // 長さ16、列優先

//Vec3ユーティリティ
export const vec3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
  scale: (v: Vec3, s: number): Vec3 => [v[0]*s, v[1]*s, v[2]*s],
  dot: (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ],
  length: (v: Vec3): number => Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]),
  normalize: (v: Vec3): Vec3 => {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if (len < 1e-10) return [0, 0, 1];
    return [v[0]/len, v[1]/len, v[2]/len];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0]-a[0])*t,
    a[1] + (b[1]-a[1])*t,
    a[2] + (b[2]-a[2])*t,
  ],
};

//Mat4
export const mat4 = {
  identity(): Mat4 {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  },

  //列優先　C=A*B
  multiply(a: Mat4, b: Mat4): Mat4 {
    const out: Mat4 = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k*4+row] * b[col*4+k];
        out[col*4+row] = sum;
      }
    }
    return out;
  },

  lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const z = vec3.normalize(vec3.sub(eye, target));
    const x = vec3.normalize(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -vec3.dot(x, eye), -vec3.dot(y, eye), -vec3.dot(z, eye), 1,
    ];
  },
};

//変換関数
export function transformVec3(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0]*v[0] + m[4]*v[1] + m[8]*v[2]  + m[12],
    m[1]*v[0] + m[5]*v[1] + m[9]*v[2]  + m[13],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14],
  ];
}

//同次座標変換、Wを返す
export function transformVec4(m: Mat4, v: Vec3): Vec4 {
  return [
    m[0]*v[0] + m[4]*v[1] + m[8]*v[2]  + m[12],
    m[1]*v[0] + m[5]*v[1] + m[9]*v[2]  + m[13],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14],
    m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15],
  ];
}

//方向ベクトル変換、法線用、平行移動なし
export function transformDir(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0]*v[0] + m[4]*v[1] + m[8]*v[2],
    m[1]*v[0] + m[5]*v[1] + m[9]*v[2],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2],
  ];
}
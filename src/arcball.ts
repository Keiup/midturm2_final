import { vec3 } from "./math";
import type { Vec3 } from "./math";

export type Quat = [number, number, number, number]; //[x, y, z, w]

export const quat = {
  identity(): Quat {
    return [0, 0, 0, 1];
  },

  multiply(a: Quat, b: Quat): Quat {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
      aw*bx + ax*bw + ay*bz - az*by,
      aw*by - ax*bz + ay*bw + az*bx,
      aw*bz + ax*by - ay*bx + az*bw,
      aw*bw - ax*bx - ay*by - az*bz,
    ];
  },

  normalize(q: Quat): Quat {
    const len = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3]);
    if (len < 1e-10) return [0, 0, 0, 1];
    return [q[0]/len, q[1]/len, q[2]/len, q[3]/len];
  },

  //クォータニオン 4x4回転行列,列優先
  toMat4(q: Quat): number[] {
    const [x, y, z, w] = q;
    return [
      1-2*(y*y+z*z),  2*(x*y+w*z),    2*(x*z-w*y),    0,
      2*(x*y-w*z),    1-2*(x*x+z*z),  2*(y*z+w*x),    0,
      2*(x*z+w*y),    2*(y*z-w*x),    1-2*(x*x+y*y),  0,
      0,              0,              0,              1,
    ];
  },
};

//スクリーン座標  Arcball球面上の3D点
function screenToArcball(x: number, y: number, width: number, height: number): Vec3 {
  const nx = (2*x - width)  / Math.min(width, height);
  const ny = (height - 2*y) / Math.min(width, height);
  const r2 = nx*nx + ny*ny;
  if (r2 <= 1.0) {
    return [nx, ny, Math.sqrt(1 - r2)];
  } else {
    //球の外側,双曲面近似
    return vec3.normalize([nx, ny, 0]);
  }
}

//2ベクトル間の回転クォータニオンを生成
function quatFromVecs(from: Vec3, to: Vec3): Quat {
  const d = Math.min(1, Math.max(-1, vec3.dot(from, to)));
  const angle = Math.acos(d);
  if (angle < 1e-6) return quat.identity();
  const axis = vec3.normalize(vec3.cross(from, to));
  const s = Math.sin(angle / 2);
  return [axis[0]*s, axis[1]*s, axis[2]*s, Math.cos(angle/2)];
}

export class Arcball {
  private isDragging = false;
  private prevVec: Vec3 = [0, 0, 1]; //インクリメンタル更新用,直前フレームの球面点
  currentQuat: Quat = quat.identity();

  private width = 800;
  private height = 600;

  onMouseDown(x: number, y: number, width: number, height: number) {
    this.isDragging = true;
    this.width = width;
    this.height = height;
    this.prevVec = screenToArcball(x, y, width, height);
  }

  onMouseMove(x: number, y: number) {
    if (!this.isDragging) return;

    const curVec = screenToArcball(x, y, this.width, this.height);

    //インクリメンタル更新,前フレームから今フレームの差分のみ回転に加算
    const delta = quatFromVecs(this.prevVec, curVec);
    this.currentQuat = quat.normalize(quat.multiply(delta, this.currentQuat));
    this.prevVec = curVec;
  }

  onMouseUp() {
    this.isDragging = false;
  }

  getRotationMatrix(): number[] {
    return quat.toMat4(this.currentQuat);
  }
}
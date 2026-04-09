import type { Mat4, Vec3 } from "./math";
import { mat4, vec3 } from "./math";

export class Camera {
  position: Vec3 = [0, 0, 5.0];
  yaw   = -Math.PI / 2;
  pitch = 0;

  moveSpeed  = 3.5;
  turnSpeed  = 1.9;

  private clampPitch() {
    const lim = Math.PI/2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  getForward(): Vec3 {
    const cp = Math.cos(this.pitch);
    return vec3.normalize([
      Math.cos(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.sin(this.yaw) * cp,
    ]);
  }

  getViewMatrix(): Mat4 {
    const f = this.getForward();
    return mat4.lookAt(this.position, vec3.add(this.position, f), [0, 1, 0]);
  }

  update(keys: Set<string>, dt: number) {
    if (keys.has("ArrowLeft"))  this.yaw   -= this.turnSpeed * dt;
    if (keys.has("ArrowRight")) this.yaw   += this.turnSpeed * dt;
    if (keys.has("ArrowUp"))    this.pitch += this.turnSpeed * dt;
    if (keys.has("ArrowDown"))  this.pitch -= this.turnSpeed * dt;
    this.clampPitch();

    const forward = this.getForward();
    const right   = vec3.normalize(vec3.cross([0, 1, 0], forward));
    const up: Vec3 = [0, 1, 0];
    const step = this.moveSpeed * dt;

    if (keys.has("w")) this.position = vec3.add(this.position, vec3.scale(forward,  step));
    if (keys.has("s")) this.position = vec3.add(this.position, vec3.scale(forward, -step));
    if (keys.has("a")) this.position = vec3.add(this.position, vec3.scale(right,    step));
    if (keys.has("d")) this.position = vec3.add(this.position, vec3.scale(right,   -step));
    if (keys.has("q")) this.position = vec3.add(this.position, vec3.scale(up,       step));
    if (keys.has("e")) this.position = vec3.add(this.position, vec3.scale(up,      -step));
  }
}
import { Vector3, Quaternion, Matrix4, MathUtils } from 'three/webgpu';

export const FLOOR_Y = .4;
export const SPAWN = new Vector3(-.82, .08, 3.48);
export const MIN_SCALE = .1;
export const MAX_SCALE = 1;
const UP = new Vector3(0, 1, 0);

export function sessionOptions(mode, nativeGPU = false) {
  const options = mode === 'immersive-vr'
    ? { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'] }
    : { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor', 'plane-detection', 'mesh-detection', 'anchors', 'hand-tracking', 'layers'] };
  if (nativeGPU) options.requiredFeatures.push('webgpu');
  return options;
}

export function deadzone(value, zone = .16) {
  return Math.abs(value) <= zone ? 0 : Math.sign(value) * (Math.abs(value) - zone) / (1 - zone);
}

export function stick(gamepad) {
  const a = gamepad?.axes || [];
  // xr-standard reserves axes 0/1 for the touchpad and 2/3 for a thumbstick.
  return a.length >= 4 ? [deadzone(a[2]), deadzone(a[3])] : [deadzone(a[0] || 0), deadzone(a[1] || 0)];
}

export function snapshotGrab(left, right, world) {
  const mid = left.clone().add(right).multiplyScalar(.5);
  const separation = right.clone().sub(left);
  if (separation.length() < .065) return null;
  return {
    midpoint: mid, distance: separation.length(), yaw: Math.atan2(separation.z, separation.x),
    position: world.position.clone(), rotation: world.quaternion.clone(), scale: world.scale.x,
  };
}

export function solveGrab(snapshot, left, right) {
  const midpoint = left.clone().add(right).multiplyScalar(.5);
  const separation = right.clone().sub(left);
  const scale = MathUtils.clamp(snapshot.scale * separation.length() / snapshot.distance, MIN_SCALE, MAX_SCALE);
  // In Three.js, a positive Y rotation maps +X toward -Z.
  const yaw = snapshot.yaw - Math.atan2(separation.z, separation.x);
  const delta = new Quaternion().setFromAxisAngle(UP, yaw);
  const position = snapshot.position.clone().sub(snapshot.midpoint).multiplyScalar(scale / snapshot.scale).applyQuaternion(delta).add(midpoint);
  return { position, rotation: delta.multiply(snapshot.rotation), scale };
}

export function rigTranslationForHead(head, destination) {
  return new Vector3(destination.x - head.x, 0, destination.z - head.z);
}

export function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

export function poseMatrix(pose) { return new Matrix4().fromArray(pose.transform.matrix); }

export function floorAlignedPosition(surface, scale, walkIn = false, floorY = 0) {
  // Tabletop rests its plinth bottom on the hit surface; 1:1 aligns the courtyard floor.
  return new Vector3(surface.x, walkIn ? floorY - FLOOR_Y * scale : surface.y + .365 * scale, surface.z);
}

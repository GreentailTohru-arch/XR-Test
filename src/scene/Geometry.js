import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function random(seed = 17) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

// Static details share a draw call per material, including every individual roof tile.
export class GeometryBatch {
  constructor(parent) { this.parent = parent; this.buckets = new Map(); this.xrBuckets = new Map(); }
  add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const list = this.buckets.get(material) || []; list.push(g); this.buckets.set(material, list);
    // Retain a parallel low-detail batch without changing desktop geometry.
    const low=geometry.userData.xrGeometry;
    if(low){
      const simple=low.index?low.toNonIndexed():low.clone();
      simple.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
      if(!simple.attributes.uv)simple.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(simple.attributes.position.count*2),2));
      const parts=this.xrBuckets.get(material)||[];parts.push(simple);this.xrBuckets.set(material,parts);
    }else {const parts=this.xrBuckets.get(material)||[];parts.push(g.clone());this.xrBuckets.set(material,parts);}
    return this;
  }
  box(w, h, d, material, x, y, z, rotation = [0, 0, 0], radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
    this.add(geometry, material, [x, y, z], rotation); geometry.dispose();
  }
  cylinder(r1, r2, height, material, x, y, z, rotation = [0, 0, 0], segments = 12) {
    const g = new THREE.CylinderGeometry(r1, r2, height, segments); this.add(g, material, [x, y, z], rotation); g.dispose();
  }
  sphere(radius, material, x, y, z, scale = [1, 1, 1]) {
    const g = new THREE.SphereGeometry(radius, 12, 8),low=new THREE.SphereGeometry(radius,6,4);g.userData.xrGeometry=low;this.add(g, material, [x, y, z], [0, 0, 0], scale);g.dispose();low.dispose();
  }
  beam(a, b, radius, material, segments = 8) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    const g = new THREE.CylinderGeometry(radius * 0.8, radius, delta.length(), segments);
    const e = new THREE.Euler().setFromQuaternion(q);
    this.add(g, material, start.add(end).multiplyScalar(0.5).toArray(), [e.x, e.y, e.z]); g.dispose();
  }
  lathe(points, material, x, y, z, scale = 1) {
    const g = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), 24);
    const low=new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),12);g.userData.xrGeometry=low;
    this.add(g, material, [x, y, z], [0, 0, 0], [scale, scale, scale]); g.dispose();low.dispose();
  }
  flush(name = 'Architectural details') {
    const group = new THREE.Group(); group.name = name;
    for (const [material, geometries] of this.buckets) {
      const g = mergeGeometries(geometries, false); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material); mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
      const parts=this.xrBuckets.get(material);mesh.userData.xrGeometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());
      group.add(mesh); geometries.forEach(part => part.dispose());
    }
    this.buckets.clear();this.xrBuckets.clear(); this.parent.add(group); return group;
  }
}

export function leafGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, -.05,.012,.12, 0,.024,.28, .05,.012,.12, 0,.036,.12], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([.5,0, 0,.45, .5,1, 1,.45, .5,.45], 2));
  g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]); g.computeVertexNormals(); return g;
}

export function irregularStone(seed = 0, detail = 2) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  // Weld shared vertices before recomputing normals: wet limestone should not look faceted.
  base.deleteAttribute('normal');
  const g = mergeVertices(base, 0.0001), p = g.attributes.position;
  base.dispose();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.14 * Math.sin(x * 7 + z * 5) * Math.cos(y * 9) + 0.09 * Math.sin(z * 11 + y * 4 + seed);
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  if(detail===2){const low=irregularStone(seed,1);g.userData.xrGeometry=low;g.addEventListener('dispose',()=>low.dispose());}
  return g;
}

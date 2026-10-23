import { Vector3 } from 'three/webgpu';
import { segmentDistance } from './XRMath.js';

const rect = (x, z, a, b, c, d) => x >= a && x <= b && z >= c && z <= d;

/** Traversal geometry is independent of render meshes, so wet transparent surfaces
 * and invisible pond water cannot accidentally become valid teleport targets. */
export class NavigationSurface {
  constructor(doors = []) { this.doors = doors; this.radius = .19; }

  height(x, z) {
    if (rect(x, z, -4.55, 4.25, -4.68, -1.43)) return .788;
    if (rect(x, z, -4.72, -2.14, -1.42, 1.02)) return .6;
    if (rect(x, z, -1.73, 1.44, -1.44, -.72)) return z < -1.28 ? .67 : .57;
    if (rect(x, z, -3.98, -2.93, 1.01, 1.39)) return .5;
    return .48;
  }

  blocked(x, z, radius = this.radius) {
    if (Math.abs(x) > 4.86 - radius || z > 4.86 - radius || z < -4.68 + radius) return true;
    // Pond, Taihu stones, tree, tea table and the main study desk.
    if (((x - 2) / (2.2 + radius)) ** 2 + ((z - 2.25) / (1.56 + radius)) ** 2 < 1) return true;
    for (const [cx, cz, r] of [[3.78,1.02,.48], [3.2,3.76,.35], [-4.16,2.07,.36], [-2.63,3.62,.16]]) {
      if (Math.hypot(x-cx,z-cz) < r+radius) return true;
    }
    for (const [a,b,c,d] of [[-1.94,-.11,-3.12,-2.16], [1.7,3.83,-4.16,-3.29], [-4.26,-2.82,-4.7,-4.17], [2.77,4.25,-4.7,-4.17], [-.88,.97,-4.7,-4.12], [-4.13,-2.55,-3.32,-2.98]]) {
      if(rect(x,z,a-radius,b+radius,c-radius,d+radius))return true;
    }
    // Main facade: only the central doorway is traversable.
    if(Math.abs(z+1.46)<.085+radius && (x < -1.30+radius || x > 1.08-radius))return true;
    // The moon gate is a real opening, with a body-width allowance through its center.
    if(Math.abs(z-1.12)<.11+radius && x>-4.89-radius && x<-2.01+radius && (x < -4.02+radius || x > -2.88-radius))return true;
    if(Math.abs(x+4.82)<.08+radius && z<1.25)return true;
    if(Math.abs(x-4.38)<.08+radius && z<-1.33)return true;
    for (const door of this.doors) {
      const a=door.group.rotation.y,sign=door.sign,px=door.group.position.x,pz=door.group.position.z;
      if(segmentDistance(x,z,px,pz,px+sign*Math.cos(a)*.64,pz-sign*Math.sin(a)*.64)<radius+.045)return true;
    }
    return false;
  }

  teleportable(x,z) {
    if(this.blocked(x,z,.23))return false;
    return rect(x,z,-1.6,1.3,-.75,1.28) || rect(x,z,-2.08,.12,1.2,4.8)
      || rect(x,z,-4.6,-2.12,-1.1,2.1) || rect(x,z,-4.5,4.2,-4.65,-1.3)
      || rect(x,z,1.15,3.55,-.48,.06);
  }

  move(position, displacement) {
    // Small substeps prevent tunnelling through narrow walls and doors at low frame rates.
    const out=position.clone(),steps=Math.max(1,Math.ceil(displacement.length()/.045));
    const dx=displacement.x/steps,dz=displacement.z/steps;
    for(let i=0;i<steps;i++) {
      const can=(x,z)=>!this.blocked(x,z)&&Math.abs(this.height(x,z)-this.height(out.x,out.z))<.29;
      if(can(out.x+dx,out.z+dz)){out.x+=dx;out.z+=dz;}
      else {if(can(out.x+dx,out.z))out.x+=dx;if(can(out.x,out.z+dz))out.z+=dz;}
    }
    out.y=this.height(out.x,out.z);return out;
  }

  traceArc(origin,direction) {
    const points=[origin.clone()],velocity=direction.clone().multiplyScalar(5.2);
    velocity.y+=1.5;let previous=origin.clone();
    for(let i=1;i<=48;i++) {
      const t=i*.035,p=origin.clone().addScaledVector(velocity,t);p.y-=4.9*t*t;
      const y=this.height(p.x,p.z);
      if(p.y<=y&&previous.y>=y){
        const f=(previous.y-y)/(previous.y-p.y||1);p.lerpVectors(previous,p,f);p.y=this.height(p.x,p.z);points.push(p);
        return {points,target:this.teleportable(p.x,p.z)?p:null};
      }
      if(i>2&&this.blocked(p.x,p.z,.02)&&p.y<2.8&&p.y>y+.15)return {points,target:null};
      points.push(p);previous=p;
    }
    return {points,target:null};
  }
}

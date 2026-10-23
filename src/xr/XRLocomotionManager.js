import * as THREE from 'three/webgpu';
import { stick, SPAWN, rigTranslationForHead } from './XRMath.js';

export class XRLocomotionManager {
  constructor(scene,world,rig,camera,navigation) {
    Object.assign(this,{scene,world,rig,camera,navigation});this.turnMode='snap';this.snapReady=true;this.teleportHeld=false;this.fadeTime=0;this.pendingTeleport=null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(49*3),3));
    this.arc=new THREE.Line(geometry,new THREE.LineBasicNodeMaterial({color:0xd5ad70,transparent:true,opacity:.72,depthWrite:false}));this.arc.frustumCulled=false;this.arc.visible=false;world.add(this.arc);
    this.reticle=new THREE.Mesh(new THREE.RingGeometry(.17,.195,48),new THREE.MeshBasicNodeMaterial({color:0xe6bd7a,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));this.reticle.rotation.x=-Math.PI/2;this.reticle.visible=false;world.add(this.reticle);
    this.fade=new THREE.Mesh(new THREE.SphereGeometry(.3,16,12),new THREE.MeshBasicNodeMaterial({color:0x06090a,side:THREE.BackSide,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false,fog:false}));this.fade.renderOrder=10000;scene.add(this.fade);this.fade.visible=false;
  }
  headToLocal(head) {return this.world.worldToLocal(head.clone());}
  teleport(local,head) {
    if(this.pendingTeleport)return;
    this.pendingTeleport=local.clone();this.fadeTime=.24;
  }
  placeHead(local,head) {
    const destination=this.world.localToWorld(local.clone());
    this.rig.position.add(rigTranslationForHead(head,destination));
    this.rig.position.y=destination.y;this.rig.updateMatrixWorld(true);
  }
  snap(angle,head) {
    const relative=head.clone().sub(this.rig.position).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
    this.rig.rotation.y+=angle;this.rig.position.x=head.x-relative.x;this.rig.position.z=head.z-relative.z;this.rig.updateMatrixWorld(true);
  }
  update(dt,inputs,head,headRotation,{physicalFade=true,followGround=true}={}) {
    this.fade.position.copy(head);
    if(this.fadeTime>0){
      const before=this.fadeTime;this.fadeTime=Math.max(0,this.fadeTime-dt);
      if(before>.12&&this.fadeTime<=.12&&this.pendingTeleport){const previous=this.rig.position.clone();this.placeHead(this.pendingTeleport,head);this.fade.position.add(this.rig.position.clone().sub(previous));this.pendingTeleport=null;}
      this.fade.visible=true;this.fade.material.opacity=1-Math.abs(this.fadeTime-.12)/.12;this.arc.visible=this.reticle.visible=false;return;
    }
    this.fade.visible=false;
    const left=inputs.find(s=>s.source.handedness==='left'),right=inputs.find(s=>s.source.handedness==='right');
    const [lx,ly]=stick(left?.source.gamepad),[rx,ry]=stick(right?.source.gamepad);
    // Axes use the same convention on both left- and right-handed input sources.
    if(lx||ly){
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(headRotation);forward.y=0;forward.normalize();
      const side=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
      const step=forward.multiplyScalar(-ly).addScaledVector(side,lx).clampLength(0,1).multiplyScalar(1.35*dt);
      const local=this.headToLocal(head);local.y=this.navigation.height(local.x,local.z);
      const localStep=step.clone().transformDirection(new THREE.Matrix4().copy(this.world.matrixWorld).invert()).multiplyScalar(step.length());
      const next=this.navigation.move(local,localStep),worldNext=this.world.localToWorld(next.clone());
      this.rig.position.add(rigTranslationForHead(head,worldNext));
      this.rig.position.y=THREE.MathUtils.damp(this.rig.position.y,worldNext.y,16,dt);
      this.rig.updateMatrixWorld(true);
    }
    if(Math.abs(rx)<.25)this.snapReady=true;
    if(Math.abs(rx)>.6&&!this.teleportHeld){
      if(this.turnMode==='smooth')this.snap(-rx*1.2*dt,head);
      else if(this.snapReady){this.snap(-Math.sign(rx)*Math.PI/6,head);this.snapReady=false;}
    }
    const teleport=!!right&&(ry<-.55||right.source.gamepad?.buttons[3]?.pressed===true);
    if(teleport){
      const origin=this.world.worldToLocal(right.rayOrigin.clone()),direction=right.rayDirection.clone().transformDirection(new THREE.Matrix4().copy(this.world.matrixWorld).invert());
      const hit=this.navigation.traceArc(origin,direction),position=this.arc.geometry.attributes.position;
      for(let i=0;i<hit.points.length;i++)position.setXYZ(i,...hit.points[i].toArray());
      position.needsUpdate=true;this.arc.geometry.setDrawRange(0,hit.points.length);this.arc.visible=true;
      this.arc.material.color.setHex(hit.target?0xd9b67b:0x776d5d);this.reticle.visible=!!hit.target;
      if(hit.target){this.reticle.position.copy(hit.target);this.reticle.position.y+=.012;}
      this.target=hit.target;this.teleportHeld=true;
    }else{
      if(right&&this.teleportHeld&&this.target)this.teleport(this.target,head);
      this.teleportHeld=false;this.target=null;this.arc.visible=this.reticle.visible=false;
    }
    // Do not falsify tracked physical motion; a soft fade marks solid geometry.
    const p=this.headToLocal(head);
    const blocked=this.navigation.blocked(p.x,p.z,.06);
    if(physicalFade&&blocked){this.fade.visible=true;this.fade.material.opacity=.55;}
    if(followGround&&!blocked){
      const ground=this.world.localToWorld(new THREE.Vector3(p.x,this.navigation.height(p.x,p.z),p.z));
      this.rig.position.y=THREE.MathUtils.damp(this.rig.position.y,ground.y,16,dt);this.rig.updateMatrixWorld(true);
    }
  }
  home(head) {this.teleport(new THREE.Vector3(SPAWN.x,this.navigation.height(SPAWN.x,SPAWN.z),SPAWN.z),head);}
  dispose(){for(const o of [this.arc,this.reticle,this.fade]){o.removeFromParent();o.geometry.dispose();o.material.dispose();}}
}

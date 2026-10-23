import * as THREE from 'three/webgpu';
import { snapshotGrab, solveGrab, floorAlignedPosition, FLOOR_Y } from './XRMath.js';

export class MRPlacementManager {
  constructor(scene,world,{hasFloor=true,onStatus=()=>{}}={}) {
    Object.assign(this,{scene,world,onStatus});this.hasFloor=hasFloor;this.floorY=hasFloor?0:null;this.placed=false;this.epoch=0;this.anchor=null;this.anchorOffset=null;this.grab=null;this.surfaceMap=new Map();this.hit=null;
    this.room=new THREE.Group();this.room.name='Device-detected real surfaces';scene.add(this.room);
    this.reticle=new THREE.Group();this.reticle.name='MR placement ring';scene.add(this.reticle);this.reticle.visible=false;
    const gold=new THREE.MeshBasicNodeMaterial({color:0xd6b477,side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false});
    for(const r of [.12,.16]){const mesh=new THREE.Mesh(new THREE.RingGeometry(r,r+.004,64),gold);mesh.rotation.x=-Math.PI/2;this.reticle.add(mesh);}
    for(let i=0;i<4;i++){
      const mark=new THREE.Group();mark.rotation.y=i*Math.PI/2;
      for(const [x,z,w,d]of [[.183,0,.045,.004],[.205,.014,.004,.032],[.194,.028,.025,.004]]){
        const bar=new THREE.Mesh(new THREE.BoxGeometry(w,.003,d),gold);bar.position.set(x,0,z);mark.add(bar);
      }this.reticle.add(mark);
    }
    this.scanMaterial=new THREE.MeshBasicNodeMaterial({color:0xc3ab7a,side:THREE.DoubleSide,transparent:true,opacity:.035,depthWrite:false});
    this.occlusionMaterial=new THREE.MeshBasicNodeMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide});
    this.scanLineMaterial=new THREE.LineBasicNodeMaterial({color:0xc4aa76,transparent:true,opacity:.22,depthWrite:false});
    this.raycaster=new THREE.Raycaster();this.anchorState='none';
  }
  async start(session,referenceSpace) {
    this.session=session;this.referenceSpace=referenceSpace;this.world.visible=false;
    const viewer=await session.requestReferenceSpace('viewer');
    this.hitSource=await session.requestHitTestSource({space:viewer});
    this.onStatus('缓慢环顾桌面或地面，出现圆环后扳机 / 捏合放置');
  }
  update(frame,inputs,head) {
    this.updateSurfaces(frame);
    const results=this.hitSource?frame.getHitTestResults(this.hitSource):[];
    this.hit=null;
    for(const result of results){
      const pose=result.getPose(this.referenceSpace);if(!pose)continue;
      const matrix=new THREE.Matrix4().fromArray(pose.transform.matrix),normal=new THREE.Vector3(0,1,0).transformDirection(matrix);
      if(normal.y<.85)continue;
      this.hit={result,matrix,position:new THREE.Vector3().setFromMatrixPosition(matrix)};break;
    }
    // Actual detected geometry is a fallback if a valid hit-test ray is momentarily absent.
    if(!this.hit&&inputs.length){
      const aim=inputs.find(s=>s.source.handedness==='right')||inputs[0];
      this.raycaster.set(aim.rayOrigin,aim.rayDirection);
      const hit=this.raycaster.intersectObjects([...this.surfaceMap.values()].filter(e=>e.group.visible).map(e=>e.mesh),false).find(h=>h.face&&Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y)>.85);
      if(hit)this.hit={position:hit.point.clone(),matrix:new THREE.Matrix4().makeTranslation(...hit.point.toArray()),result:null};
    }
    if(this.floorY===null&&this.hit&&head.y-this.hit.position.y>1.25)this.floorY=this.hit.position.y;
    this.reticle.visible=!this.placed&&!!this.hit;
    if(this.reticle.visible){this.reticle.position.copy(this.hit.position);this.reticle.position.y+=.004;this.reticle.rotation.y=Math.atan2(head.x-this.hit.position.x,head.z-this.hit.position.z);}
    if(!this.placed){
      const trigger=inputs.find(s=>s.activated);
      if(trigger){trigger.activated=false;if(this.hit)this.place(frame,head);}
      return false;
    }
    if(this.pendingMiniature){
      this.pendingMiniature=false;this.releaseAnchor();this.world.scale.setScalar(.1);
      this.world.position.copy(floorAlignedPosition(this.hit?.position||this.placementSurface,.1));this.world.updateMatrixWorld(true);this.createAnchor(frame);
    }
    const hands=inputs.filter(s=>s.grabbing&&s.source.handedness!=='none');
    const left=hands.find(s=>s.source.handedness==='left'),right=hands.find(s=>s.source.handedness==='right');
    if(left&&right){
      if(!this.grab){this.grab=snapshotGrab(left.position,right.position,this.world);if(this.grab)this.releaseAnchor();}
      if(this.grab){
        const next=solveGrab(this.grab,left.position,right.position);
        if(this.floorY===null&&next.scale>.78){next.scale=.78;this.onStatus('请面向地面完成地板校准，再放大为步入空间');}
        const blend=THREE.MathUtils.smoothstep(next.scale,.72,1);
        if(this.floorY!==null)next.position.y=THREE.MathUtils.lerp(next.position.y,this.floorY-FLOOR_Y*next.scale,blend);
        this.world.position.lerp(next.position,.35);this.world.quaternion.slerp(next.rotation,.35);this.world.scale.lerp(new THREE.Vector3().setScalar(next.scale),.35);
        this.world.updateMatrixWorld(true);inputs.forEach(s=>{s.activated=false;});
        return true;
      }
    }else if(this.grab){
      this.grab=null;
      // Lock the true 1:1 endpoint, without accumulating floating point scale drift.
      if(this.world.scale.x>.985&&this.floorY!==null){this.world.scale.setScalar(1);this.world.position.y=this.floorY-FLOOR_Y;}
      this.reanchor(frame);inputs.forEach(s=>{s.activated=false;});
      this.onStatus(this.world.scale.x>.95?'已对齐地面 · 1:1 步入空间':'双手侧键 / 双手捏合，可移动、旋转与缩放');
    }
    this.trackAnchor(frame);
    return false;
  }
  place(frame,head) {
    const hit=this.hit;this.placementSurface=hit.position.clone();this.world.scale.setScalar(.1);this.world.position.copy(floorAlignedPosition(hit.position,.1));
    this.world.rotation.set(0,Math.atan2(head.x-hit.position.x,head.z-hit.position.z),0);this.world.visible=true;this.world.updateMatrixWorld(true);this.placed=true;this.reticle.visible=false;
    for(const {mesh,outline}of this.surfaceMap.values()){mesh.material=this.occlusionMaterial;outline.visible=false;}
    this.onStatus('双手侧键 / 双手捏合，可移动、旋转与缩放');
    this.createAnchor(frame,hit.result);
  }
  createAnchor(frame,hitResult=null) {
    if(!this.session?.enabledFeatures?.includes('anchors')){this.anchorState='reference-space';return;}
    const version=++this.epoch;let promise;
    try{
      if(hitResult?.createAnchor)promise=hitResult.createAnchor();
      else if(frame.createAnchor){const p=this.world.position,q=this.world.quaternion;promise=frame.createAnchor(new XRRigidTransform({x:p.x,y:p.y,z:p.z},{x:q.x,y:q.y,z:q.z,w:q.w}),this.referenceSpace);}
    }catch{this.anchorState='reference-space';return;}
    if(!promise){this.anchorState='reference-space';return;}
    this.anchorState='pending';
    promise.then(anchor=>{if(version!==this.epoch||!this.placed){anchor.delete();return;}this.anchor=anchor;this.anchorOffset=null;this.anchorState='tracked';}).catch(()=>{if(version===this.epoch)this.anchorState='reference-space';});
  }
  reanchor(frame){this.releaseAnchor();this.world.updateMatrixWorld(true);this.createAnchor(frame);}
  trackAnchor(frame) {
    if(!this.anchor)return;
    const pose=frame.getPose(this.anchor.anchorSpace,this.referenceSpace);
    if(!pose){this.anchorState='temporarily-untracked';return;}
    const matrix=new THREE.Matrix4().fromArray(pose.transform.matrix);
    if(!this.anchorOffset){this.world.updateMatrixWorld(true);this.anchorOffset=matrix.clone().invert().multiply(this.world.matrixWorld);}
    matrix.multiply(this.anchorOffset).decompose(this.world.position,this.world.quaternion,this.world.scale);this.world.updateMatrixWorld(true);this.anchorState='tracked';
  }
  releaseAnchor(){this.epoch++;this.anchor?.delete();this.anchor=null;this.anchorOffset=null;this.anchorState='reference-space';}
  reset(){this.releaseAnchor();this.grab=null;this.placed=false;this.world.visible=false;for(const {mesh,outline}of this.surfaceMap.values()){mesh.material=this.scanMaterial;outline.visible=true;}this.onStatus('重新指向桌面或地面，扳机 / 捏合放置');}

  updateSurfaces(frame) {
    const detected=[...(frame.detectedPlanes||[]),...(frame.detectedMeshes||[])],present=new Set(detected);
    for(const [source,entry]of this.surfaceMap)if(!present.has(source)){entry.mesh.geometry.dispose();entry.outline.geometry.dispose();entry.group.removeFromParent();this.surfaceMap.delete(source);}
    // Geometry stays on the device and is never uploaded or persisted.
    for(const source of detected){
      let entry=this.surfaceMap.get(source);
      if(!entry||entry.changed!==source.lastChangedTime){
        if(entry){entry.mesh.geometry.dispose();entry.outline.geometry.dispose();entry.group.removeFromParent();}
        const geometry=new THREE.BufferGeometry();
        if(source.vertices){geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.vertices.slice(),3));geometry.setIndex(new THREE.BufferAttribute(source.indices.slice(),1));}
        else{
          const p=Array.from(source.polygon||[]);if(p.length<3)continue;
          geometry.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(v=>[v.x,v.y,v.z]),3));
          geometry.setIndex(THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,v.z)),[]).flat());
        }
        geometry.computeVertexNormals();const group=new THREE.Group();group.matrixAutoUpdate=false;this.room.add(group);
        const mesh=new THREE.Mesh(geometry,this.placed?this.occlusionMaterial:this.scanMaterial);mesh.renderOrder=-10;group.add(mesh);
        const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),this.scanLineMaterial);outline.visible=!this.placed;group.add(outline);
        entry={group,mesh,outline,changed:source.lastChangedTime};this.surfaceMap.set(source,entry);
      }
      const pose=frame.getPose(source.planeSpace||source.meshSpace,this.referenceSpace);entry.group.visible=!!pose;
      if(pose){entry.group.matrix.fromArray(pose.transform.matrix);entry.group.updateMatrixWorld(true);if(source.semanticLabel==='floor')this.floorY=entry.group.matrix.elements[13];}
    }
  }
  dispose(){this.releaseAnchor();this.hitSource?.cancel();this.hitSource=null;for(const e of this.surfaceMap.values()){e.mesh.geometry.dispose();e.outline.geometry.dispose();}this.surfaceMap.clear();this.room.removeFromParent();this.reticle.traverse(o=>o.geometry?.dispose());this.reticle.children[0].material.dispose();this.reticle.removeFromParent();this.scanMaterial.dispose();this.scanLineMaterial.dispose();this.occlusionMaterial.dispose();}
}

import * as THREE from 'three/webgpu';

const JOINTS = ['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
  'index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip',
  'middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip',
  'ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip',
  'pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
const NEG_Z = new THREE.Vector3(0,0,-1);

export class XRInputSystem {
  constructor(scene,rig) {
    this.scene=scene;this.rig=rig;this.states=new Map();this.listeners=[];
    this.materials={
      wood:new THREE.MeshPhysicalNodeMaterial({color:0x292c28,roughness:.56,clearcoat:.25}),
      gold:new THREE.MeshPhysicalNodeMaterial({color:0xc7a56b,metalness:.35,roughness:.4,emissive:0x8a5825,emissiveIntensity:.35}),
      hand:new THREE.MeshPhysicalNodeMaterial({color:0x889d8e,roughness:.55,transparent:true,opacity:.7}),
      ray:new THREE.LineBasicNodeMaterial({color:0xe0b77d,transparent:true,opacity:.24,depthWrite:false}),
    };
    this.sphere=new THREE.SphereGeometry(1,8,6);
  }
  bind(session) {
    this.session=session;
    const listen=(type,fn)=>{session.addEventListener(type,fn);this.listeners.push([type,fn]);};
    listen('selectstart',e=>{const s=this.ensure(e.inputSource);s.selectDown=true;s.activated=true;});
    listen('selectend',e=>{const s=this.ensure(e.inputSource);s.selectDown=false;});
    listen('squeezestart',e=>{this.ensure(e.inputSource).squeeze=true;});
    listen('squeezeend',e=>{this.ensure(e.inputSource).squeeze=false;});
    listen('inputsourceschange',e=>{for(const source of e.removed)this.remove(source);for(const source of e.added)this.ensure(source);});
    for(const source of session.inputSources)this.ensure(source);
  }
  ensure(source) {
    if(this.states.has(source))return this.states.get(source);
    const group=new THREE.Group();this.rig.add(group);
    const grip=new THREE.Group();group.add(grip);
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.021,.025,.105,12),this.materials.wood);handle.rotation.x=Math.PI*.22;grip.add(handle);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.03,.003,6,20),this.materials.gold);ring.position.set(0,.044,-.016);grip.add(ring);
    const hand=new THREE.InstancedMesh(this.sphere,this.materials.hand,JOINTS.length);hand.frustumCulled=false;this.rig.add(hand);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),this.materials.ray);this.scene.add(line);
    const tip=new THREE.Mesh(new THREE.SphereGeometry(.005,8,6),this.materials.gold);this.scene.add(tip);
    const state={source,group,grip,hand,line,tip,tracked:false,position:new THREE.Vector3(),rotation:new THREE.Quaternion(),rayOrigin:new THREE.Vector3(),rayDirection:new THREE.Vector3(0,0,-1),poke:new THREE.Vector3(),selectDown:false,activated:false,squeeze:false,pinch:false,grabbing:false,pokeLatched:new Set(),lastActivate:0};
    this.states.set(source,state);return state;
  }
  update(frame,referenceSpace) {
    this.rig.updateMatrixWorld(true);
    for(const source of this.session.inputSources) {
      const s=this.ensure(source),pose=frame.getPose(source.targetRaySpace,referenceSpace);
      s.tracked=!!pose;s.line.visible=s.tip.visible=s.group.visible=!!pose;s.hand.visible=!!pose&&!!source.hand;s.grip.visible=!source.hand;
      if(!pose){s.activated=false;s.selectDown=false;s.pinch=false;s.grabbing=false;s.squeeze=false;s.pokeLatched.clear();continue;}
      const matrix=new THREE.Matrix4().fromArray(pose.transform.matrix);
      s.rayOrigin.setFromMatrixPosition(matrix).applyMatrix4(this.rig.matrixWorld);
      s.rayDirection.copy(NEG_Z).transformDirection(matrix).transformDirection(this.rig.matrixWorld);
      const gripPose=source.gripSpace?frame.getPose(source.gripSpace,referenceSpace):pose;
      if(gripPose){new THREE.Matrix4().fromArray(gripPose.transform.matrix).decompose(s.group.position,s.group.quaternion,s.group.scale);}
      s.group.updateMatrixWorld(true);s.group.getWorldPosition(s.position);s.group.getWorldQuaternion(s.rotation);
      s.poke.copy(s.rayOrigin).addScaledVector(s.rayDirection,.055);
      s.grabbing=s.squeeze||(source.gamepad?.buttons[1]?.pressed??false);
      if(source.hand)this.updateHand(s,frame,referenceSpace);
      this.aim(s,2.1,false);
    }
    return [...this.states.values()].filter(s=>s.tracked);
  }
  updateHand(s,frame,referenceSpace) {
    const poses=new Map(),dummy=new THREE.Object3D();
    for(let i=0;i<JOINTS.length;i++){
      const name=JOINTS[i],space=s.source.hand.get(name),pose=space&&frame.getJointPose(space,referenceSpace);
      if(pose){dummy.position.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);dummy.quaternion.set(pose.transform.orientation.x,pose.transform.orientation.y,pose.transform.orientation.z,pose.transform.orientation.w);dummy.scale.setScalar(Math.min(pose.radius||.007,.012));poses.set(name,dummy.position.clone());}
      else {dummy.position.set(0,-100,0);dummy.scale.setScalar(0);}
      dummy.updateMatrix();s.hand.setMatrixAt(i,dummy.matrix);
    }
    s.hand.instanceMatrix.needsUpdate=true;
    const index=poses.get('index-finger-tip'),thumb=poses.get('thumb-tip');
    if(index)s.poke.copy(index).applyMatrix4(this.rig.matrixWorld);
    if(index&&thumb){
      const distance=index.distanceTo(thumb),pinched=s.pinch?distance<.035:distance<.023;
      if(pinched&&!s.pinch){s.activated=true;s.selectDown=true;}
      if(!pinched&&s.pinch)s.selectDown=false;
      s.pinch=pinched;s.grabbing=pinched;
      s.position.copy(index).add(thumb).multiplyScalar(.5).applyMatrix4(this.rig.matrixWorld);
    }else{s.pinch=false;s.grabbing=false;s.selectDown=false;s.activated=false;}
  }
  aim(s,length,hovered) {
    const p=s.line.geometry.attributes.position;p.setXYZ(0,...s.rayOrigin.toArray());
    const end=s.rayOrigin.clone().addScaledVector(s.rayDirection,length);p.setXYZ(1,...end.toArray());p.needsUpdate=true;s.line.geometry.computeBoundingSphere();
    s.tip.position.copy(end);s.tip.visible=hovered;s.line.material.opacity=hovered?.48:.2;
  }
  consume(s) {s.activated=false;}
  feedback(s,strength=.22) {try{s?.source?.gamepad?.hapticActuators?.[0]?.pulse(strength,25)?.catch(()=>{});}catch{/* Haptics are optional. */}}
  remove(source) {
    const s=this.states.get(source);if(!s)return;
    s.group.traverse(o=>o.geometry?.dispose());s.group.removeFromParent();s.hand.removeFromParent();s.line.geometry.dispose();s.line.removeFromParent();s.tip.geometry.dispose();s.tip.removeFromParent();this.states.delete(source);
  }
  dispose() {for(const [type,fn]of this.listeners)this.session?.removeEventListener(type,fn);this.listeners=[];for(const source of [...this.states.keys()])this.remove(source);this.sphere.dispose();Object.values(this.materials).forEach(m=>m.dispose());}
}

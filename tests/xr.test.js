import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, PerspectiveCamera, Vector3, Quaternion, Matrix4 } from 'three/webgpu';
import { sessionOptions, snapshotGrab, solveGrab, floorAlignedPosition, stick, SPAWN } from '../src/xr/XRMath.js';
import { NavigationSurface } from '../src/xr/NavigationSurface.js';
import { XRLocomotionManager } from '../src/xr/XRLocomotionManager.js';
import { XRInputSystem } from '../src/xr/XRInputSystem.js';
import { MRPlacementManager } from '../src/xr/MRPlacementManager.js';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
const nearVector=(a,b)=>{near(a.x,b.x);near(a.y,b.y);near(a.z,b.z);};

test('optional room/hand capabilities do not prevent baseline VR or hit-test MR',()=>{
  const vr=sessionOptions('immersive-vr'),mr=sessionOptions('immersive-ar');
  assert.deepEqual(vr.requiredFeatures,['local-floor']);assert.deepEqual(mr.requiredFeatures,['hit-test']);
  for(const f of ['plane-detection','mesh-detection','anchors','hand-tracking','local-floor'])assert.ok(mr.optionalFeatures.includes(f));
  assert.ok(sessionOptions('immersive-vr',true).requiredFeatures.includes('webgpu'));
});
test('stick drift is suppressed and xr-standard thumbstick axes are selected',()=>{
  assert.deepEqual(stick({axes:[1,1,.08,-.12]}),[0,0]);assert.deepEqual(stick({axes:[.7,.7,0,-1]}),[0,-1]);
  assert.deepEqual(stick(undefined),[0,0]);
});
test('two-hand translation retains the object offset from the midpoint',()=>{
  const world=new Group();world.position.set(1,.5,-2);world.scale.setScalar(.1);
  const left=new Vector3(-.2,1,0),right=new Vector3(.2,1,0),shift=new Vector3(.4,.2,-.8);
  const next=solveGrab(snapshotGrab(left,right,world),left.clone().add(shift),right.clone().add(shift));
  nearVector(next.position,world.position.clone().add(shift));near(next.scale,.1);
});
test('two-hand yaw rotates around the grab midpoint without an object jump',()=>{
  const world=new Group();world.position.set(1,1,0);world.scale.setScalar(.5);
  const snap=snapshotGrab(new Vector3(-.5,1,0),new Vector3(.5,1,0),world);
  const next=solveGrab(snap,new Vector3(0,1,.5),new Vector3(0,1,-.5));
  nearVector(next.position,new Vector3(0,1,-1));nearVector(new Vector3(1,0,0).applyQuaternion(next.rotation),new Vector3(0,0,-1));
});
test('hand scaling clamps to the tabletop and true-scale endpoints',()=>{
  const world=new Group();world.scale.setScalar(.2);
  const snap=snapshotGrab(new Vector3(-.1,1,0),new Vector3(.1,1,0),world);
  near(solveGrab(snap,new Vector3(-2,1,0),new Vector3(2,1,0)).scale,1);
  near(solveGrab(snap,new Vector3(-.01,1,0),new Vector3(.01,1,0)).scale,.1);
  assert.equal(snapshotGrab(new Vector3(),new Vector3(.01,0,0),world),null);
});
test('MR tabletop rests its plinth on the hit surface; walk-in aligns its floor',()=>{
  const surface=new Vector3(1,.74,-2);
  near(floorAlignedPosition(surface,.1).y-.365*.1,.74);
  near(floorAlignedPosition(surface,1,true,0).y+.4,0);
});
test('spawn and the central stair route remain traversable into the room',()=>{
  const nav=new NavigationSurface(),start=new Vector3(SPAWN.x,.48,SPAWN.z);
  assert.equal(nav.blocked(start.x,start.z),false);
  const end=nav.move(start,new Vector3(0,0,-5.25));
  near(end.z,-1.77);near(end.y,.788);
});
test('large low-FPS movement cannot tunnel through the facade',()=>{
  const nav=new NavigationSurface(),end=nav.move(new Vector3(2,.48,-.5),new Vector3(0,0,-3));
  assert.ok(end.z>-1.3);assert.equal(nav.blocked(end.x,end.z),false);
});
test('the moon gate is open through its center, with solid wall on either side',()=>{
  const nav=new NavigationSurface();assert.equal(nav.blocked(-3.45,1.12),false);
  assert.equal(nav.blocked(-2.45,1.12),true);assert.equal(nav.blocked(-4.3,1.12),true);
  const end=nav.move(new Vector3(-3.45,.48,1.9),new Vector3(0,0,-1.4));near(end.z,.5);near(end.y,.6);
});
test('pond, furniture, out-of-bounds positions and grass are rejected as teleport targets',()=>{
  const nav=new NavigationSurface();for(const [x,z]of [[2,2.25],[-1,-2.7],[2.5,-3.7],[6,0],[4,4.6]])assert.equal(nav.teleportable(x,z),false,`${x},${z}`);
  assert.equal(nav.teleportable(SPAWN.x,SPAWN.z),true);
});
test('parabolic landing is on a walkable surface, never on the pond',()=>{
  const nav=new NavigationSurface();const valid=nav.traceArc(new Vector3(-.82,2.05,3.48),new Vector3(0,-.7,-.7).normalize());
  assert.ok(valid.target);assert.ok(nav.teleportable(valid.target.x,valid.target.z));
  near(valid.target.y,nav.height(valid.target.x,valid.target.z));
  const invalid=nav.traceArc(new Vector3(2,2.05,2.25),new Vector3(0,-1,0));assert.equal(invalid.target,null);
});
test('snap turning rotates about the tracked head even away from the rig origin',()=>{
  const scene=new Scene(),world=new Group(),rig=new Group(),camera=new PerspectiveCamera();scene.add(world,rig);rig.position.set(2,.1,-1);
  const head=new Vector3(2.45,1.76,-.67),local=head.clone().sub(rig.position);
  const locomotion=new XRLocomotionManager(scene,world,rig,camera,new NavigationSurface());locomotion.snap(Math.PI/6,head);
  nearVector(local.applyQuaternion(rig.quaternion).add(rig.position),head);locomotion.dispose();
});
test('teleport fade follows the head on the relocation frame',()=>{
  const scene=new Scene(),world=new Group(),rig=new Group();scene.add(world,rig);world.position.y=-.4;scene.updateMatrixWorld(true);
  const head=new Vector3(-.82,1.73,3.48),locomotion=new XRLocomotionManager(scene,world,rig,new PerspectiveCamera(),new NavigationSurface());
  locomotion.teleport(new Vector3(0,.57,-1),head);locomotion.update(.1,[],head,new Quaternion());locomotion.update(.03,[],head,new Quaternion());
  near(locomotion.fade.position.x,0);near(locomotion.fade.position.z,-1);assert.ok(locomotion.fade.material.opacity>.85);locomotion.dispose();
});
test('controller loss cancels a held teleport instead of teleporting unexpectedly',()=>{
  const scene=new Scene(),world=new Group(),rig=new Group();scene.add(world,rig);
  const locomotion=new XRLocomotionManager(scene,world,rig,new PerspectiveCamera(),new NavigationSurface());
  locomotion.teleportHeld=true;locomotion.target=new Vector3(0,.48,0);locomotion.update(.016,[],new Vector3(-.82,1.65,3.48),new Quaternion());
  assert.equal(locomotion.pendingTeleport,null);assert.equal(locomotion.teleportHeld,false);locomotion.dispose();
});
test('physical VR walking raises the rig onto the interior floor without replacing tracked eye height',()=>{
  const scene=new Scene(),world=new Group(),rig=new Group();scene.add(world,rig);world.position.y=-.4;scene.updateMatrixWorld(true);
  const locomotion=new XRLocomotionManager(scene,world,rig,new PerspectiveCamera(),new NavigationSurface());
  for(let i=0;i<40;i++)locomotion.update(.016,[],new Vector3(0,1.9+rig.position.y,-1.8),new Quaternion());
  near(rig.position.y,.388,.001);locomotion.dispose();
});
test('MR passthrough is not dimmed when the user stands outside the virtual courtyard',()=>{
  const scene=new Scene(),world=new Group(),rig=new Group();scene.add(world,rig);world.position.z=-8;scene.updateMatrixWorld(true);
  const locomotion=new XRLocomotionManager(scene,world,rig,new PerspectiveCamera(),new NavigationSurface());
  locomotion.update(.016,[],new Vector3(0,1.65,0),new Quaternion(),{physicalFade:false,followGround:false});
  assert.equal(locomotion.fade.visible,false);near(rig.position.y,0);locomotion.dispose();
});
test('lost input tracking clears pinch and queued activations',()=>{
  const scene=new Scene(),rig=new Group();scene.add(rig);const input=new XRInputSystem(scene,rig),source={targetRaySpace:{},handedness:'left'};
  input.session={inputSources:[source]};const s=input.ensure(source);s.activated=s.pinch=s.grabbing=true;s.pokeLatched.add('old');
  assert.equal(input.update({getPose:()=>null},{}).length,0);assert.equal(s.activated,false);assert.equal(s.grabbing,false);assert.equal(s.pokeLatched.size,0);input.dispose();
});
test('MR anchors track pose updates while preserving the model-to-anchor offset',()=>{
  const scene=new Scene(),world=new Group();scene.add(world);const mr=new MRPlacementManager(scene,world);mr.placed=true;
  world.position.set(1,.8,-2);world.scale.setScalar(.1);world.updateMatrixWorld(true);mr.anchor={anchorSpace:{},delete(){}};
  let anchorMatrix=new Matrix4().makeTranslation(1,.75,-2);const frame={getPose:()=>({transform:{matrix:anchorMatrix.toArray()}})};
  mr.trackAnchor(frame);anchorMatrix=new Matrix4().makeTranslation(1.3,.75,-1.8);mr.trackAnchor(frame);
  nearVector(world.position,new Vector3(1.3,.8,-1.8));near(world.scale.x,.1);mr.dispose();
});
test('late anchor promises are deleted after placement reset',async()=>{
  const scene=new Scene(),world=new Group();scene.add(world);const mr=new MRPlacementManager(scene,world);mr.placed=true;mr.session={enabledFeatures:['anchors']};
  let resolve,deleted=false;mr.createAnchor({}, {createAnchor:()=>new Promise(r=>{resolve=r;})});mr.reset();resolve({delete(){deleted=true;}});await Promise.resolve();
  assert.equal(deleted,true);assert.equal(mr.anchor,null);mr.dispose();
});
test('missing anchors degrade to reference-space placement without preventing placement',()=>{
  const scene=new Scene(),world=new Group();scene.add(world);const mr=new MRPlacementManager(scene,world);mr.session={enabledFeatures:[]};
  mr.hit={position:new Vector3(0,.7,-1),result:null};mr.place({},new Vector3(0,1.65,0));assert.equal(mr.placed,true);assert.equal(world.visible,true);near(world.scale.x,.1);assert.equal(mr.anchorState,'reference-space');mr.dispose();
});
test('detected geometry is reused until changed and removed when no longer tracked',()=>{
  const scene=new Scene(),world=new Group();scene.add(world);const mr=new MRPlacementManager(scene,world);mr.referenceSpace={};
  const plane={planeSpace:{},lastChangedTime:1,semanticLabel:'floor',polygon:[{x:-1,y:0,z:-1},{x:1,y:0,z:-1},{x:1,y:0,z:1},{x:-1,y:0,z:1}]};
  const frame={detectedPlanes:new Set([plane]),getPose:()=>({transform:{matrix:new Matrix4().toArray()}})};mr.updateSurfaces(frame);
  const geometry=mr.surfaceMap.get(plane).mesh.geometry;mr.updateSurfaces(frame);assert.equal(mr.surfaceMap.get(plane).mesh.geometry,geometry);near(mr.floorY,0);
  frame.detectedPlanes.clear();mr.updateSurfaces(frame);assert.equal(mr.surfaceMap.size,0);mr.dispose();
});

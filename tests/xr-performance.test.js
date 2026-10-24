import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, FogExp2, DirectionalLight, PointLight, HemisphereLight, Vector3, MeshStandardNodeMaterial, EventDispatcher } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { GeometryBatch, irregularStone } from '../src/scene/Geometry.js';
import { WeatherSystem } from '../src/scene/WeatherSystem.js';
import { XRQualityPolicy, isInsideHall, preferredRefreshRate } from '../src/xr/XRQualityPolicy.js';
import { XRPerformanceManager } from '../src/xr/XRPerformanceManager.js';

function runFrames(policy,seconds,ms,cpu=1,start=0){let now=start;while(now<start+seconds*1000){now+=ms;policy.sample(now,cpu);}return now;}

test('sustained missed deadlines lower quality; recovery has hysteresis',()=>{
  const p=new XRQualityPolicy(90);
  let time=runFrames(p,9,1000/45,8);assert.equal(p.level,0);
  time=runFrames(p,6,1000/90,1,time);assert.equal(p.level,0,'a brief recovery must not oscillate');
  time=runFrames(p,6,1000/90,1,time);assert.equal(p.level,1);
  runFrames(p,11,1000/90,1,time);assert.equal(p.level,2);
});

test('normal 72 and 90 Hz cadence stays at full quality, startup and lost tracking are excluded',()=>{
  for(const hz of [72,90]){const p=new XRQualityPolicy(hz);let time=runFrames(p,10,1000/hz,1);p.sample(time+3000,1);assert.equal(p.level,2);runFrames(p,3,1000/hz,1,time+3000);assert.equal(p.level,2);}
  const p=new XRQualityPolicy(90);runFrames(p,1.5,100,90);assert.equal(p.level,2);
});

test('refresh selection respects supported rates and indoor culling respects the hall volume',()=>{
  assert.equal(preferredRefreshRate({supportedFrameRates:new Float32Array([72,90,120])}),90);
  assert.equal(preferredRefreshRate({supportedFrameRates:[72]}),72);
  assert.equal(preferredRefreshRate({frameRate:80}),80);
  assert.equal(isInsideHall({x:0,y:2.4,z:-2.2}),true);
  for(const point of [{x:0,y:2,z:1},{x:-5,y:2,z:-2},{x:0,y:4,z:-2}])assert.equal(isInsideHall(point),false);
});

test('XR pottery and rock geometry reduce segments while preserving desktop geometry',()=>{
  const parent=new Group(),batch=new GeometryBatch(parent),mat=new MeshStandardNodeMaterial();
  batch.lathe([[.1,0],[.2,.1],[.1,.3]],mat,1,2,3);
  const mesh=batch.flush().children[0];
  assert.equal(mesh.userData.xrGeometry.attributes.position.count*2,mesh.geometry.attributes.position.count);
  const stone=irregularStone(5),low=stone.userData.xrGeometry;
  assert.ok(low.attributes.position.count<stone.attributes.position.count*.6);
  assert.equal(stone.parameters.detail,2);assert.equal(low.parameters.detail,1);
  mesh.geometry.dispose();mesh.userData.xrGeometry.dispose();stone.dispose();mat.dispose();
});

function fixture(mode='vr'){
  const scene=new Scene(),world=new Group();scene.add(world);
  const fog=new FogExp2(0xffffff,.01);scene.fog=fog;
  const doors=[{group:new Group()}];world.add(doors[0].group);
  const lights=[new HemisphereLight(),new DirectionalLight(),new DirectionalLight(),...Array.from({length:5},()=>new PointLight())];
  lights[1].castShadow=true;
  const lightState=lights.map((light,i)=>({light,original:{userData:{xrCore:i>=3&&i<=5}}}));
  const calls={enable:0,disable:0,garden:0,ui:[],weather:[]};
  const app={scene,world,elapsed:1,architecture:{doors},garden:{update:()=>calls.garden++},weather:{setXRActive:v=>calls.weather.push(v),updateXR:()=>{}}};
  const xr={mode,lightState,session:{frameRate:72},ui:{setPerformanceMode:v=>calls.ui.push(v)}};
  const p=new XRPerformanceManager(app,xr);
  p.optimizer={enable:()=>calls.enable++,disable:()=>calls.disable++,atlas:{clock:{value:0}}};p.halos={visible:false};p.haloScale={value:1};
  const events=new EventDispatcher(),hardware=[];
  events.setFramebufferScaleFactor=v=>hardware.push(['scale',v]);events.setFoveation=v=>hardware.push(['foveation',v]);
  const renderer={xr:events,setPixelRatio:v=>hardware.push(['pixels',v]),info:{render:{drawCalls:42}}};
  p.bind(renderer);return {p,app,xr,calls,events,hardware,fog};
}

test('XR events apply hardware settings before entry and restore fog/effects exactly once',()=>{
  const {p,app,calls,events,hardware,fog,xr}=fixture();
  assert.deepEqual(hardware,[['pixels',1],['scale',1],['foveation',0]]);
  events.dispatchEvent({type:'sessionstart'});events.dispatchEvent({type:'sessionstart'});
  assert.deepEqual(hardware.at(-1),['foveation',0]);
  assert.equal(calls.enable,1);assert.equal(app.scene.fog.density,.045);
  assert.equal(xr.lightState.filter(d=>d.light.isDirectionalLight&&d.light.visible).length,1);
  assert.equal(xr.lightState.filter(d=>d.light.isPointLight&&d.light.visible).length,3);
  assert.equal(xr.lightState[1].light.shadow.autoUpdate,false);assert.equal(xr.lightState[1].light.shadow.mapSize.x,1024);
  events.dispatchEvent({type:'sessionend'});p.unbind();
  assert.equal(calls.disable,1);assert.equal(app.scene.fog,fog);assert.deepEqual(calls.ui,[true,false]);assert.deepEqual(calls.weather,[true,false]);
});

test('sustained slow VR frames reduce effects without blurring either eye; MR keeps its adaptive budget',()=>{
  for(const mode of ['vr','mr']){
    const {p,events,hardware}=fixture(mode);events.dispatchEvent({type:'sessionstart'});
    const requested=[[],[]],pose={views:requested.map(values=>({requestViewportScale:scale=>values.push(scale)}))};
    p.lastCPU=20;
    for(let time=30;time<12000;time+=30)p.beforeFrame(time,pose,new Vector3(0,2,2));
    assert.equal(p.policy.level,0,'effect detail should still adapt to sustained missed deadlines');
    assert.equal(p.policy.profile.rain,300);assert.equal(p.policy.profile.animationHz,15);
    for(const values of requested){
      if(mode==='vr')assert.deepEqual([...new Set(values)],[1]);
      else assert.deepEqual([...new Set(values)],[1,.85,.7]);
    }
    const d=p.diagnostics();
    assert.equal(d.viewportScale,mode==='vr'?1:.7);
    assert.equal(d.framebufferScale,mode==='vr'?1:.8);
    assert.equal(d.foveation,mode==='vr'?0:1);
    assert.equal(d.samples,mode==='vr'?4:0);
    assert.equal(hardware.filter(([setting])=>setting==='scale').length,1,'never resize the framebuffer inside a session');
    p.unbind();
  }
});

test('static XR frames do not refresh shadows, moving doors refresh once after settling',()=>{
  const {p,app,events,xr}=fixture();events.dispatchEvent({type:'sessionstart'});
  const shadow=xr.lightState[1].light.shadow;shadow.needsUpdate=false;
  const head=new Vector3(0,1.7,2),pose={views:[]};
  p.beforeFrame(1000,pose,head);p.beforeFrame(2000,pose,head);assert.equal(shadow.needsUpdate,false);
  app.architecture.doors[0].group.rotation.y=.5;p.beforeFrame(2100,pose,head);assert.equal(shadow.needsUpdate,false);
  p.beforeFrame(2200,pose,head);assert.equal(shadow.needsUpdate,false);
  p.beforeFrame(2300,pose,head);assert.equal(shadow.needsUpdate,true);assert.equal(p.shadowRefreshes,1);
  shadow.needsUpdate=false;p.beforeFrame(2600,pose,head);assert.equal(shadow.needsUpdate,false);
  p.unbind();
});

test('indoor XR pauses koi updates, optional viewport APIs may fail without ending a session',()=>{
  const {p,events,calls}=fixture();events.dispatchEvent({type:'sessionstart'});
  p.beforeFrame(1000,{views:[{requestViewportScale:()=>{throw new Error('unsupported');}}]},new Vector3(0,2,-2));
  assert.equal(p.inside,true);assert.equal(calls.garden,0);assert.equal(p.viewportScaling,false);
  p.beforeFrame(2000,{views:[]},new Vector3(0,2,2));assert.equal(calls.garden,1);p.unbind();
});

test('local rain has a bounded cylinder, follows the head and restores desktop rain on exit',()=>{
  const weather=new WeatherSystem(new Group(),{clock:uniform(0)},{eaves:[],lights:[],lanterns:[]});
  const origin=weather.localRain.geometry.attributes.rainOrigin;
  assert.equal(origin.count,380);for(let i=0;i<origin.count;i++)assert.ok(Math.hypot(origin.getX(i),origin.getZ(i))<4);
  weather.setXRActive(true);weather.updateXR(new Vector3(2,2,3),{rain:300});
  assert.equal(weather.rainOrigin.value.x,2);assert.equal(weather.rainOrigin.value.z,3);assert.ok(Math.abs(weather.rainOrigin.value.y-.35)<1e-6);
  assert.equal(weather.localRain.geometry.instanceCount,300);assert.equal(weather.desktopRain.visible,false);
  weather.updateXR(new Vector3(),{inside:true});assert.equal(weather.localRain.visible,false);assert.equal(weather.eaveDrips.visible,false);
  weather.setXRActive(false);assert.equal(weather.desktopRain.visible,true);assert.equal(weather.localRain.visible,false);assert.equal(weather.eaveDrips.visible,true);weather.dispose();
});

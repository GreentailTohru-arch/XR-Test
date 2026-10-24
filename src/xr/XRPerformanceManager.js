import * as THREE from 'three/webgpu';
import { attribute, positionLocal, modelViewMatrix, cameraProjectionMatrix, vec3, vec4, uv, smoothstep, uniform } from 'three/tsl';
import { XRSceneOptimizer } from './XRSceneOptimizer.js';
import { XRQualityPolicy, isInsideHall, preferredRefreshRate } from './XRQualityPolicy.js';

export class XRPerformanceManager {
  constructor(app,xr){
    this.app=app;this.xr=xr;this.policy=new XRQualityPolicy();this.localHead=new THREE.Vector3();
    this.lastTransform=new THREE.Matrix4();this.active=false;this.drawCalls=0;this.maxDrawCalls=0;
    this.onStart=()=>this.activate();this.onEnd=()=>this.deactivate();
  }
  bind(renderer){
    this.unbind();this.renderer=renderer;
    // Three.js allocates XR layers during setSession: this must happen BEFORE it.
    renderer.setPixelRatio(1);renderer.xr.setFramebufferScaleFactor(.8);renderer.xr.setFoveation(1);
    renderer.xr.addEventListener('sessionstart',this.onStart);renderer.xr.addEventListener('sessionend',this.onEnd);
    this.optimizer??=new XRSceneOptimizer(this.app);
    this.createHalos();
  }
  createHalos(){
    if(this.halos)return;
    const points=[];
    for(const {pivot}of this.app.architecture.lanterns){const p=pivot.position.clone();p.y-=.38;points.push([...p.toArray(),.7]);}
    points.push([2.13,2.01,-3.82,.55],[-2.1,1.23,1.24,.5]);
    const quad=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();
    g.index=quad.index;g.attributes={...quad.attributes};g.instanceCount=points.length;
    g.setAttribute('haloOrigin',new THREE.InstancedBufferAttribute(Float32Array.from(points.flatMap(p=>p.slice(0,3))),3));
    g.setAttribute('haloSize',new THREE.InstancedBufferAttribute(Float32Array.from(points.map(p=>p[3])),1));
    this.haloScale=uniform(1);
    const material=new THREE.MeshBasicNodeMaterial({color:0xffbc67,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide,forceSinglePass:true});
    const view=modelViewMatrix.mul(vec4(attribute('haloOrigin','vec3'),1)).xyz;
    const offset=positionLocal.xy.mul(attribute('haloSize','float')).mul(this.haloScale);
    material.vertexNode=cameraProjectionMatrix.mul(vec4(view.add(vec3(offset,0)),1));
    material.opacityNode=smoothstep(.5,0,uv().sub(.5).length()).pow(2).mul(.24);
    this.halos=new THREE.Mesh(g,material);this.halos.name='XR instanced warm lamp halos';this.halos.frustumCulled=false;this.halos.visible=false;this.halos.renderOrder=3;this.app.world.add(this.halos);
  }
  activate(){
    if(this.active)return;this.active=true;
    // Apply again after the projection/base layer exists (r186 caches the value
    // before allocation but does not set fixedFoveation on the new layer).
    this.renderer.xr.setFoveation(1);
    const scene=this.app.scene;
    this.saved={fog:scene.fog,fogNode:scene.fogNode};scene.fogNode=null;scene.fog=new THREE.FogExp2(0x0c131c,.045);
    this.optimizer.enable();this.halos.visible=true;this.app.weather.setXRActive(true);this.xr.ui.setPerformanceMode(true);
    let moon=false,points=0;
    this.shadowLights=[];
    for(const data of this.xr.lightState||[]){
      const light=data.light;
      if(light.isDirectionalLight){light.visible=!moon;moon=true;}
      else if(light.isPointLight){light.visible=!!data.original.userData.xrCore&&points<3;if(light.visible)points++;}
      if(light.shadow){light.shadow.mapSize.set(1024,1024);light.shadow.autoUpdate=false;light.shadow.needsUpdate=light.visible&&light.castShadow;if(light.visible&&light.castShadow)this.shadowLights.push(light);}
    }
    this.policy.reset(preferredRefreshRate(this.xr.session));
    const session=this.xr.session;
    if(session?.updateTargetFrameRate&&Array.from(session.supportedFrameRates||[]).includes(this.policy.targetHz)){
      try{Promise.resolve(session.updateTargetFrameRate(this.policy.targetHz)).catch(()=>{if(this.active&&this.xr.session===session)this.policy.targetHz=session.frameRate||72;});}
      catch{this.policy.targetHz=session.frameRate||72;}
    }
    this.drawCalls=0;this.maxDrawCalls=0;this.shadowRefreshes=0;this.lastAnimation=-Infinity;
    this.lastTransform.copy(this.app.world.matrixWorld);this.lastDoorAngles=this.app.architecture.doors.map(d=>d.group.rotation.y);
    this.shadowDirty=false;this.shadowChangedAt=0;this.viewportScaling=null;this.lastCPU=0;
  }
  beforeFrame(now,pose,head){
    if(!this.active)return;
    const session=this.xr.session;
    if(session?.frameRate)this.policy.targetHz=session.frameRate;
    this.policy.sample(now,this.lastCPU);
    const profile=this.policy.profile;
    // Viewport scaling is the optional in-session mechanism; never reallocate the
    // framebuffer with setFramebufferScaleFactor while the session is presenting.
    for(const view of pose.views||[]){
      if(view.requestViewportScale){try{view.requestViewportScale(profile.viewport);this.viewportScaling=true;}catch{this.viewportScaling=false;}}
    }
    this.localHead.copy(head);this.app.world.worldToLocal(this.localHead);
    this.inside=this.app.world.scale.x>.9&&isInsideHall(this.localHead);
    this.app.weather.updateXR(this.localHead,{inside:this.inside,rain:profile.rain,miniature:this.app.world.scale.x<.9});
    if(!this.inside){
      this.optimizer.atlas.clock.value=this.app.elapsed;
      if(now-this.lastAnimation>=1000/profile.animationHz){this.app.garden.update(this.app.elapsed);this.lastAnimation=now;}
    }
    this.haloScale.value=this.app.world.scale.x;
    // Refresh a frozen map once after a door, placement or MR navigation settles.
    const transform=this.app.world.matrixWorld,doors=this.app.architecture.doors;
    const moved=transform.elements.some((n,i)=>Math.abs(n-this.lastTransform.elements[i])>1e-5)||doors.some((d,i)=>Math.abs(d.group.rotation.y-this.lastDoorAngles[i])>.001);
    if(moved){this.shadowDirty=true;this.shadowChangedAt=now;this.lastTransform.copy(transform);this.lastDoorAngles=doors.map(d=>d.group.rotation.y);}
    if(this.shadowDirty&&now-this.shadowChangedAt>160){this.shadowLights.forEach(l=>l.shadow.needsUpdate=true);this.shadowDirty=false;this.shadowRefreshes++;}
  }
  afterFrame(cpuMs){
    if(!this.active)return;this.lastCPU=cpuMs;
    this.drawCalls=this.renderer.info.render.drawCalls;this.maxDrawCalls=Math.max(this.maxDrawCalls,this.drawCalls);
  }
  deactivate(){
    if(!this.active)return;this.active=false;
    this.optimizer.disable();this.halos.visible=false;this.app.weather.setXRActive(false);this.xr.ui.setPerformanceMode(false);
    this.app.scene.fog=this.saved.fog;this.app.scene.fogNode=this.saved.fogNode;this.saved=null;
    this.inside=false;
  }
  unbind(){
    this.deactivate();
    this.renderer?.xr.removeEventListener('sessionstart',this.onStart);this.renderer?.xr.removeEventListener('sessionend',this.onEnd);this.renderer=null;
  }
  diagnostics(){return {active:this.active,tier:this.policy.profile.name,targetHz:this.policy.targetHz,frameP90Ms:Math.round(this.policy.p90*10)/10,cpuMs:Math.round((this.lastCPU||0)*10)/10,framebufferScale:.8,foveation:1,viewportScale:this.policy.profile.viewport,viewportScaling:this.viewportScaling,rain:this.active?(this.inside?0:this.policy.profile.rain):null,inside:!!this.inside,drawCalls:this.drawCalls,maxDrawCalls:this.maxDrawCalls,shadowRefreshes:this.shadowRefreshes||0,...this.optimizer?.stats};}
  dispose(){this.unbind();this.optimizer?.dispose();this.halos?.geometry.dispose();this.halos?.material.dispose();this.halos?.removeFromParent();}
}

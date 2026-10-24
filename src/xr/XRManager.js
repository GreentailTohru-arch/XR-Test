import * as THREE from 'three/webgpu';
import { sessionOptions, SPAWN, FLOOR_Y } from './XRMath.js';
import { NavigationSurface } from './NavigationSurface.js';
import { XRInputSystem } from './XRInputSystem.js';
import { XRLocomotionManager } from './XRLocomotionManager.js';
import { MRPlacementManager } from './MRPlacementManager.js';
import { SpatialUI } from './SpatialUI.js';
import { XRPerformanceManager } from './XRPerformanceManager.js';
import { syncXRViewports } from './XRViewports.js';

const LABELS={vr:'进入 VR 沉浸漫游',mr:'进入 MR 混合现实'};

export class XRManager {
  constructor(app){
    this.app=app;this.scene=app.scene;this.world=app.world;this.mode=null;this.state='idle';this.epoch=0;this.support={vr:null,mr:null};this.frames=0;
    this.navigation=new NavigationSurface(app.architecture.doors);
    this.ui=new SpatialUI(this.scene,this.world,app.architecture.doors,{
      exit:()=>this.exit(),home:()=>this.mode==='mr'?this.placement?.reset():this.locomotion?.home(this.head),
      turn:()=>this.secondaryControl(),feedback:s=>this.inputs?.feedback(s),aim:(s,p)=>this.inputs?.aim(s,s.rayOrigin.distanceTo(p),true),
    });
    this.performance=new XRPerformanceManager(app,this);
    this.head=new THREE.Vector3();this.headRotation=new THREE.Quaternion();this.createEntry();
    this.onDeviceChange=()=>this.detectSupport();navigator.xr?.addEventListener('devicechange',this.onDeviceChange);this.detectSupport();
    const query=new URLSearchParams(location.search);
    if(query.get('xr-preview')==='vr')this.startPreview(query.get('exhibit')||'eaves');
  }
  createEntry(){
    const nav=document.createElement('nav');nav.className='xr-entry';nav.setAttribute('aria-label','沉浸式体验');this.entry=nav;this.buttons={};
    for(const mode of ['vr','mr']){
      const button=document.createElement('button');button.type='button';button.className='xr-entry-button';button.dataset.mode=mode;
      const icon=mode==='vr'?'<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M8 11h2m4 0h2m-7 7 3-4 3 4"/>':'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z M4 7.5l8 5 8-5 M12 12.5V21"/>';
      button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${LABELS[mode]}</span>`;
      button.addEventListener('click',()=>this.enter(mode));nav.appendChild(button);this.buttons[mode]=button;
    }
    const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');status.setAttribute('aria-live','polite');nav.appendChild(status);this.status=status;this.app.host.appendChild(nav);
  }
  async detectSupport(){
    for(const mode of ['vr','mr']){
      try{this.support[mode]=!!navigator.xr&&isSecureContext&&await navigator.xr.isSessionSupported(mode==='vr'?'immersive-vr':'immersive-ar');}catch{this.support[mode]=false;}
      if(this.disposed)return;
      this.buttons[mode].dataset.supported=String(this.support[mode]);
      this.buttons[mode].title=this.support[mode]?LABELS[mode]:!isSecureContext?'请通过 HTTPS 或头显本机 localhost 打开':'请使用支持此模式的头显浏览器打开';
    }
  }
  notify(mode,message){
    this.status.textContent=message;const span=this.buttons[mode].querySelector('span');span.textContent=message;
    clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>{for(const m of ['vr','mr'])this.buttons[m].querySelector('span').textContent=LABELS[m];},5500);
  }
  async enter(mode){
    if(this.state!=='idle'||this.preview)return;
    if(!navigator.xr||!isSecureContext){this.notify(mode,isSecureContext?'请在支持 XR 的头显中打开':'请使用 HTTPS 安全连接');return;}
    if(this.support[mode]===false){this.notify(mode,mode==='vr'?'请连接支持 VR 的头显':'请使用支持 MR 的头显');return;}
    this.state='requesting';this.setBusy(true);this.ui.warmAudio();const epoch=++this.epoch;
    const nativeGPU=!!globalThis.XRGPUBinding&&!!navigator.gpu&&!this.compatibility;
    let session;
    try{
      // requestSession is called in the button's user gesture, before any awaits.
      session=await navigator.xr.requestSession(mode==='vr'?'immersive-vr':'immersive-ar',sessionOptions(mode==='vr'?'immersive-vr':'immersive-ar',nativeGPU));
      if(epoch!==this.epoch||this.disposed){await session.end();return;}
      this.session=session;this.mode=mode;this.state='starting';let ended=false;
      this.onSessionEnd=()=>{ended=true;queueMicrotask(()=>{if(this.session===session)this.restore();});};
      session.addEventListener('end',this.onSessionEnd,{once:true});
      this.saveScene();
      const renderer=new THREE.WebGPURenderer({alpha:true,antialias:false,forceWebGL:!nativeGPU,powerPreference:'high-performance'});this.renderer=renderer;
      renderer.setSize(this.app.host.clientWidth,this.app.host.clientHeight);renderer.setPixelRatio(1);
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.domElement.className='xr-canvas';renderer.domElement.setAttribute('aria-label',mode==='vr'?'VR 头显画面':'MR 头显画面');
      await renderer.init();if(ended||epoch!==this.epoch){renderer.dispose();return;}
      this.performance.bind(renderer);
      const pmrem=new THREE.PMREMGenerator(renderer);this.envTarget=pmrem.fromEquirectangular(this.app.environment);pmrem.dispose();
      this.scene.environment=this.envTarget.texture;
      this.rig=new THREE.Group();this.rig.name='Tracked XR origin';this.scene.add(this.rig);
      this.camera=new THREE.PerspectiveCamera(70,1,.035,70);this.rig.add(this.camera);
      this.inputs=new XRInputSystem(this.scene,this.rig);this.inputs.bind(session);
      this.locomotion=new XRLocomotionManager(this.scene,this.world,this.rig,this.camera,this.navigation);
      let referenceSpace,type='local-floor',hasFloor=true;
      try{referenceSpace=await session.requestReferenceSpace('local-floor');}
      catch{type='local';hasFloor=false;referenceSpace=await session.requestReferenceSpace('local');}
      if(ended||epoch!==this.epoch)return;
      // A local-only MR device gets an estimated floor, never an invented tracked eye height.
      if(!hasFloor)referenceSpace=referenceSpace.getOffsetReferenceSpace(new XRRigidTransform({y:-1.65}));
      this.referenceSpace=referenceSpace;this.hasFloor=hasFloor;
      this.configureScene(mode);this.headInitialized=false;this.previous=0;this.frames=0;
      this.onReferenceReset=()=>{this.headInitialized=false;this.locomotion.pendingTeleport=null;this.locomotion.teleportHeld=false;};
      referenceSpace.addEventListener?.('reset',this.onReferenceReset);
      if(mode==='mr'){
        this.placement=new MRPlacementManager(this.scene,this.world,{hasFloor,onStatus:text=>this.ui.setStatus(text)});
        await this.placement.start(session,referenceSpace);if(ended||epoch!==this.epoch)return;
      }
      renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType(type);
      await renderer.setAnimationLoop((now,frame)=>this.animate(now,frame));
      await renderer.xr.setSession(session);if(ended||epoch!==this.epoch){renderer.setAnimationLoop(null);renderer.dispose();return;}
      renderer.xr.setReferenceSpace(referenceSpace);
      this.app.host.appendChild(renderer.domElement);this.entry.hidden=true;this.app.renderer.domElement.style.visibility='hidden';
      this.state='presenting';this.setBusy(false);
      console.info(`Courtyard XR started: ${mode}; ${renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2'}; features=${Array.from(session.enabledFeatures||[]).join(',')}`);
    }catch(error){
      if(epoch!==this.epoch)return;
      console.error('Courtyard XR entry failed:',error);
      if(nativeGPU&&error.name==='NotSupportedError')this.compatibility=true;
      if(session){try{await session.end();}catch{/* The runtime may already have ended the session. */}}
      if(epoch===this.epoch)this.restore();
      this.notify(mode,error.name==='NotAllowedError'?'未开启头显权限，可再次进入':nativeGPU&&error.name==='NotSupportedError'?'请再次点击，使用兼容模式':'暂时无法进入，请检查头显支持');
    }
  }
  setBusy(value){for(const button of Object.values(this.buttons)){button.disabled=value;button.setAttribute('aria-busy',String(value));}}
  saveScene(){
    const scene=this.scene;this.saved={background:scene.background,backgroundNode:scene.backgroundNode,fog:scene.fog,fogNode:scene.fogNode,environment:scene.environment,floor:this.app.floor.visible};
    // r186 caches analytic light/shadow nodes globally by Light identity. Give the
    // XR renderer its own lights, so disposal cannot invalidate desktop shadows.
    const originals=[];this.world.traverse(o=>{if(o.isLight)originals.push(o);});
    this.lightState=originals.map(original=>{
      const light=original.clone();light.name=`XR ${original.name||original.type}`;
      if(original.target)light.target=original.target;
      const data={light,original,visible:original.visible,intensity:original.intensity,distance:original.distance};
      if(light.shadow){const c=light.shadow.camera;data.shadow={camera:{left:c.left,right:c.right,top:c.top,bottom:c.bottom,near:c.near,far:c.far},normalBias:light.shadow.normalBias};light.shadow.map=null;light.shadow.mapSize.set(1024,1024);light.shadow.needsUpdate=true;}
      original.visible=false;original.parent.add(light);return data;
    });
  }
  configureScene(mode){
    this.world.position.set(0,mode==='vr'?-FLOOR_Y:0,0);this.world.quaternion.identity();this.world.scale.setScalar(1);this.world.visible=mode==='vr';this.world.updateMatrixWorld(true);
    this.app.floor.visible=false;this.scene.backgroundNode=null;this.scene.background=mode==='mr'?null:new THREE.Color(0x101b22);
    this.scene.fogNode=null;this.scene.fog=new THREE.FogExp2(0x0c131c,.045);this.renderer?.setClearColor(0x000000,mode==='mr'?0:1);this.ui.setMode(mode);this.updateWorld();
  }
  updateWorld(){
    this.world.updateMatrixWorld(true);this.app.materials.worldInverse.value.copy(this.world.matrixWorld).invert();
    const scale=this.world.scale.x;
    for(const data of this.lightState||[]){
      const light=data.light;
      if(light.isPointLight){const moving=this.app.architecture.lights.find(e=>e.light===data.original);const base=moving?data.original.intensity:data.intensity;light.intensity=base*scale*scale;light.distance=data.distance*scale;}
      if(data.shadow&&scale!==this.shadowScale){const c=light.shadow.camera,s=data.shadow.camera;for(const key of ['left','right','top','bottom','near','far'])if(s[key]!==undefined)c[key]=s[key]*scale;c.updateProjectionMatrix();light.shadow.normalBias=data.shadow.normalBias*scale;}
    }
    this.shadowScale=scale;
  }
  trackedHead(pose){
    const p=pose.transform.position,q=pose.transform.orientation;
    this.rig.updateMatrixWorld(true);this.head.set(p.x,p.y,p.z).applyMatrix4(this.rig.matrixWorld);
    this.headRotation.set(q.x,q.y,q.z,q.w).premultiply(this.rig.quaternion);
  }
  initializeHead(pose){
    if(this.mode==='vr'){
      const q=pose.transform.orientation,look=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
      this.rig.rotation.y=Math.atan2(look.x,-look.z);
      const p=pose.transform.position,offset=new THREE.Vector3(p.x,0,p.z).applyQuaternion(this.rig.quaternion);
      this.rig.position.set(SPAWN.x-offset.x,this.navigation.height(SPAWN.x,SPAWN.z)-FLOOR_Y,SPAWN.z-offset.z);
    }
    this.trackedHead(pose);if(this.mode==='mr')this.ui.positionStatus(this.head,this.headRotation);this.headInitialized=true;
  }
  animate(now,frame){
    if(this.state!=='presenting'||!frame||this.disposed)return;
    try{
      const cpuStart=performance.now();
      const pose=frame.getViewerPose(this.referenceSpace);if(!pose){this.previous=0;return;}
      syncXRViewports(this.renderer,pose);
      const dt=Math.min(this.previous?(now-this.previous)/1000:1/72,.05);this.previous=now;
      if(!this.headInitialized)this.initializeHead(pose);this.trackedHead(pose);
      let inputs=this.inputs.update(frame,this.referenceSpace);let manipulating=false;
      if(this.mode==='mr'){
        manipulating=this.placement.update(frame,inputs,this.head);
        if(this.placement.placed){this.ui.status.visible=!!this.placement.grab;}
        else if(!this.ui.status.visible)this.ui.positionStatus(this.head,this.headRotation);
        if(this.placement.placed&&this.world.scale.x>.95&&!manipulating)this.updateMRNavigation(dt,inputs,frame);
      }else {this.locomotion.update(dt,inputs,this.head,this.headRotation);this.trackedHead(pose);inputs=this.inputs.update(frame,this.referenceSpace);}
      if(!this.app.reducedMotion)this.app.elapsed+=dt;
      this.ui.animateDoors(dt);this.updateWorld();this.performance.beforeFrame(now,pose,this.head);
      this.ui.update(dt,this.head,this.headRotation,inputs,{placed:this.mode==='vr'||this.placement.placed,manipulating});
      inputs.forEach(s=>this.inputs.consume(s));this.renderer.render(this.scene,this.camera);this.frames++;this.performance.afterFrame(performance.now()-cpuStart);
    }catch(error){console.error('Courtyard XR frame failed:',error);this.exit();}
  }
  updateMRNavigation(dt,inputs,frame){
    this.locomotion.update(dt,inputs,this.head,this.headRotation,{physicalFade:false,followGround:false});this.rig.updateMatrixWorld(true);
    const changed=this.rig.position.lengthSq()>1e-10||Math.abs(this.rig.quaternion.w)<.999999;
    if(changed){
      // In passthrough, the viewer must remain physically tracked. Apply artificial
      // travel to the virtual courtyard instead, and re-anchor after movement ends.
      if(!this.mrNavigation){this.placement.releaseAnchor();this.mrNavigation=true;}
      const transform=this.rig.matrixWorld.clone().invert().multiply(this.world.matrixWorld);transform.decompose(this.world.position,this.world.quaternion,this.world.scale);
      this.rig.position.set(0,0,0);this.rig.quaternion.identity();this.rig.updateMatrixWorld(true);this.world.updateMatrixWorld(true);this.locomotion.fade.position.copy(this.head);
    }else if(this.mrNavigation){this.mrNavigation=false;this.placement.reanchor(frame);}
  }
  secondaryControl(){
    if(this.mode==='mr'){if(this.placement?.placed)this.placement.pendingMiniature=true;}
    else if(this.locomotion){this.locomotion.turnMode=this.locomotion.turnMode==='snap'?'smooth':'snap';const item=this.ui.controls[1];
      const canvas=item.cap.children[0].material.map.image,x=canvas.getContext('2d');x.clearRect(0,0,canvas.width,canvas.height);x.fillStyle='#e4cf98';x.textAlign='center';x.textBaseline='middle';x.font=`500 ${Math.round(canvas.height*.48)}px "Microsoft YaHei", sans-serif`;x.fillText(this.locomotion.turnMode==='snap'?'瞬转':'平转',canvas.width/2,canvas.height/2);item.cap.children[0].material.map.needsUpdate=true;
    }
  }
  async exit(){if(this.preview){location.assign(location.pathname);return;}if(this.state==='ending'||this.state==='idle')return;this.state='ending';try{await this.session?.end();}catch{this.restore();}}
  restore(){
    ++this.epoch;const renderer=this.renderer;this.renderer=null;renderer?.setAnimationLoop(null);
    this.performance.unbind();
    this.referenceSpace?.removeEventListener?.('reset',this.onReferenceReset);this.session?.removeEventListener('end',this.onSessionEnd);
    this.inputs?.dispose();this.inputs=null;this.placement?.dispose();this.placement=null;this.locomotion?.dispose();this.locomotion=null;this.rig?.removeFromParent();this.rig=null;
    this.world.position.set(0,0,0);this.world.quaternion.identity();this.world.scale.setScalar(1);this.world.visible=true;this.world.updateMatrixWorld(true);this.app.materials.worldInverse.value.identity();
    this.ui.setMode(null);this.ui.status.visible=false;this.app.renderer.domElement.style.visibility='';this.entry.hidden=false;this.setBusy(false);
    for(const data of this.lightState||[]){data.original.visible=data.visible;data.original.intensity=data.intensity;data.light.removeFromParent();data.light.dispose();}
    this.lightState=[];this.shadowScale=null;
    if(this.saved){Object.assign(this.scene,{background:this.saved.background,backgroundNode:this.saved.backgroundNode,fog:this.saved.fog,fogNode:this.saved.fogNode,environment:this.saved.environment});this.app.floor.visible=this.saved.floor;this.saved=null;}
    this.envTarget?.dispose();this.envTarget=null;renderer?.domElement.remove();renderer?.dispose();
    for(const door of this.app.architecture.doors){door.targetAngle=door.restAngle;door.group.rotation.y=door.restAngle;door.open=true;}
    this.session=null;this.mode=null;this.state='idle';this.app.previous=0;
  }
  startPreview(id){
    // Explicit developer route for desktop visual QA. It does not claim an XR session.
    this.preview=true;this.mode='vr';this.saveScene();this.configureScene('vr');this.world.position.y=0;this.updateWorld();
    const item=this.ui.items.find(i=>i.data?.id===id)||this.ui.items[0],p=item.node.position;
    this.app.controls.minPolarAngle=0;this.app.controls.maxPolarAngle=Math.PI;this.app.controls.minDistance=.4;this.app.controls.maxDistance=20;
    this.app.camera.fov=65;this.app.camera.near=.03;this.app.camera.updateProjectionMatrix();
    this.app.camera.position.set(p.x,p.y+.62,p.z+2);this.app.controls.target.set(p.x,p.y+.5,p.z);this.app.controls.update();
    item.awake=1;this.previewItem=item;
    this.onPreviewPointer=e=>{
      if(e.button!==0)return;const r=this.app.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.app.camera);
      const hit=this.ui.pick(ray.ray.origin,ray.ray.direction);if(hit){this.ui.warmAudio();this.ui.activate(hit.item);}
    };
    this.app.renderer.domElement.addEventListener('pointerup',this.onPreviewPointer);
    const manager=this;
    window.__xrPreview=Object.freeze({
      get kind(){return 'desktop-spatial-qa';},get exhibit(){return manager.previewItem.data.id;},
      get open(){return manager.previewItem.open;},get buttons(){return manager.ui.items.filter(i=>i.data).map(i=>({id:i.data.id,open:i.open}));},
    });
    console.info('Desktop spatial preview; no XR device/session is simulated.');
  }
  updatePreview(dt){
    this.app.camera.getWorldPosition(this.head);this.app.camera.getWorldQuaternion(this.headRotation);this.ui.update(dt,this.head,this.headRotation,[],{gaze:false});this.ui.animateDoors(dt);this.updateWorld();
  }
  diagnostics(){return {state:this.state,mode:this.mode,preview:!!this.preview,support:{...this.support},backend:this.renderer?(this.renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2'):null,features:Array.from(this.session?.enabledFeatures||[]),frames:this.frames,scale:this.world.scale.x,placed:this.placement?.placed??false,anchor:this.placement?.anchorState??null,surfaces:this.placement?.surfaceMap.size??0,turn:this.locomotion?.turnMode??'snap',performance:this.performance.diagnostics()};}
  dispose(){this.disposed=true;clearTimeout(this.noticeTimer);navigator.xr?.removeEventListener('devicechange',this.onDeviceChange);this.app.renderer.domElement.removeEventListener('pointerup',this.onPreviewPointer);this.session?.end().catch(()=>{});this.restore();this.performance.dispose();this.ui.dispose();this.entry.remove();}
}

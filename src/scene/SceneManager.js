import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pass, mrt, output, normalView, roughness, metalness, emissive, vec2, vec4, mix, float, screenUV, color } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { TSLMaterials } from './TSLMaterials.js';
import { ArchitectureBuilder } from './ArchitectureBuilder.js';
import { GardenBuilder } from './GardenBuilder.js';
import { WeatherSystem } from './WeatherSystem.js';
import { makeEnvironment } from './Textures.js';
import { XRManager } from '../xr/XRManager.js';

export class SceneManager {
  constructor(host) {
    this.host=host;this.scene=new THREE.Scene();this.active=true;this.disposed=false;this.elapsed=0;this.previous=0;this.frameCount=0;
    this.compact=matchMedia('(max-width: 760px)').matches;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onResize=()=>this.resize();this.onVisibility=()=>{this.active=!document.hidden;this.previous=0;};
  }
  async init() {
    const query=new URLSearchParams(location.search);
    // GTAO samples depth with textureGather, which requires a single-sample target.
    // FXAA at the end of the pipeline handles edges without multisampled depth.
    this.renderer=new THREE.WebGPURenderer({antialias:false,alpha:false,forceWebGL:query.get('renderer')==='webgl',powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.compact?1.35:1.7));
    this.renderer.setSize(this.host.clientWidth,this.host.clientHeight);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.45;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label','可交互的江南雨夜庭院');this.renderer.domElement.tabIndex=0;
    this.host.appendChild(this.renderer.domElement);
    await this.renderer.init();
    this.camera=new THREE.PerspectiveCamera(31,this.host.clientWidth/this.host.clientHeight,.1,400);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.055;this.controls.minPolarAngle=Math.PI/6;this.controls.maxPolarAngle=Math.PI/2.4;
    this.controls.minDistance=8;this.controls.maxDistance=72;this.controls.maxTargetRadius=4.8;this.controls.cursor.set(0,1,0);
    this.controls.enablePan=true;this.controls.screenSpacePanning=true;this.controls.rotateSpeed=.52;this.controls.zoomSpeed=.65;this.controls.panSpeed=.6;
    this.resetView();
    this.onDoubleClick=()=>this.resetView();this.renderer.domElement.addEventListener('dblclick',this.onDoubleClick);
    this.onKey=e=>{if(e.key==='Home'||e.key==='0'){this.resetView();e.preventDefault();}if(e.key.toLowerCase()==='f'){document.fullscreenElement?document.exitFullscreen?.():this.host.requestFullscreen?.();}};
    this.renderer.domElement.addEventListener('keydown',this.onKey);
    this.scene.backgroundNode=mix(color(0x10191e),color(0x25333a),screenUV.y.mul(.75).add(.12));
    this.environment=makeEnvironment();
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.envTarget=pmrem.fromEquirectangular(this.environment);this.scene.environment=this.envTarget.texture;this.scene.environmentIntensity=.68;pmrem.dispose();
    this.world=new THREE.Group();this.world.name='Jiangnan courtyard · metres';this.scene.add(this.world);
    this.lighting();
    // The studio floor catches the base's soft shadow and gives it physical weight.
    const floorMaterial=new THREE.MeshPhysicalNodeMaterial({color:0x1b252a,roughness:.94});
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),floorMaterial);this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.39;this.floor.receiveShadow=true;this.scene.add(this.floor);
    this.materials=new TSLMaterials();this.materials.motion.value=this.reducedMotion?0:1;
    this.garden=new GardenBuilder(this.world,this.materials).build();
    this.architecture=new ArchitectureBuilder(this.world,this.materials).build();
    this.weather=new WeatherSystem(this.world,this.materials,this.architecture,this.compact);
    this.postProcessing();
    window.addEventListener('resize',this.onResize);document.addEventListener('visibilitychange',this.onVisibility);
    await this.renderer.compileAsync(this.scene,this.camera);
    this.pipeline.render();
    this.xr=new XRManager(this);
    this.renderer.setAnimationLoop(now=>this.animate(now));
    // Read-only diagnostics for repeatable visual and rendering checks. No visible HUD.
    window.__courtyard={
      get status(){return 'ready';},
      backend:this.renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2',
      revision:THREE.REVISION,
      get canvas(){return document.querySelector('canvas')?.getBoundingClientRect().toJSON();},
      metrics:()=>({frames:this.frameCount,drawCalls:this.renderer.info.render.drawCalls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures}),
      xr:()=>this.xr.diagnostics(),
    };
    console.info(`Courtyard ready · Three.js r${THREE.REVISION} · ${window.__courtyard.backend}`);
    this.renderer.domElement.dataset.backend=window.__courtyard.backend;
    this.renderer.domElement.dataset.state='ready';
  }
  lighting() {
    this.world.add(new THREE.HemisphereLight(0x9aafc2,0x32372a,1.45));
    const moon=new THREE.DirectionalLight(0xb1c8de,2.65);moon.position.set(-5,12,4);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);
    Object.assign(moon.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:32});moon.shadow.bias=-.0003;moon.shadow.normalBias=.035;moon.shadow.radius=3;this.world.add(moon,moon.target);
    const edge=new THREE.DirectionalLight(0x9db2c1,.75);edge.position.set(5,7,-6);this.world.add(edge,edge.target);
    // Broad warm bounce under the open eaves, rather than a point source washing the entire courtyard.
    const fill=new THREE.PointLight(0xffc690,5,6,2);fill.position.set(0,2,-1);this.world.add(fill);
  }
  postProcessing() {
    const renderer=this.renderer;
    this.pipeline=new THREE.RenderPipeline(renderer);
    const beauty=pass(this.scene,this.camera);this.beauty=beauty;
    beauty.renderTarget.samples=0;
    beauty.setMRT(mrt({output,normal:normalView,material:vec2(metalness,roughness),emissive}));
    const sceneColor=beauty.getTextureNode('output'),depth=beauty.getTextureNode('depth'),normal=beauty.getTextureNode('normal'),material=beauty.getTextureNode('material');
    const ambient=ao(depth,normal,this.camera);ambient.resolutionScale=.5;ambient.radius.value=.33;ambient.scale.value=.8;ambient.samples.value=12;
    const reflections=ssr(sceneColor,depth,normal,{metalnessNode:material.r,roughnessNode:material.g,reflectNonMetals:true,camera:this.camera});
    reflections.resolutionScale=this.compact?.4:.5;reflections.quality.value=.35;reflections.maxDistance.value=6;reflections.thickness.value=.1;reflections.intensity.value=.32;
    const lit=vec4(sceneColor.rgb.mul(mix(.48,1,ambient)).add(reflections.rgb),sceneColor.a);
    const fogged=this.weather.fogNode(lit,depth,this.camera,this.compact?6:10);
    const glow=bloom(beauty.getTextureNode('emissive'),.13,.35,1.05);
    const vignette=screenUV.sub(.5).length().smoothstep(.25,.76).mul(.16).oneMinus();
    this.pipeline.outputNode=fxaa(fogged.add(glow).mul(vignette));
    this.effects={ambient,reflections,glow};
  }
  resetView() {
    const aspect=this.host.clientWidth/this.host.clientHeight;
    const scale=Math.max(1,1.16/aspect);
    this.camera.position.set(15.7*scale,12.2*scale,18.7*scale);this.controls.target.set(0,1.18,0);this.controls.update();
  }
  resize() {
    if(this.disposed)return;const width=this.host.clientWidth,height=this.host.clientHeight;
    const previousAspect=this.camera.aspect;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);
    if(Math.abs(previousAspect-this.camera.aspect)>.15)this.resetView();
  }
  animate(now) {
    if(!this.active||this.disposed||['starting','presenting','ending'].includes(this.xr?.state))return;
    const actualFrameMs=this.previous?now-this.previous:0;
    const delta=Math.min(actualFrameMs/1000,.05);this.previous=now;
    if(!this.reducedMotion)this.elapsed+=delta;
    this.controls.update();this.garden.update(this.elapsed);this.weather.update(this.elapsed);
    if(this.xr?.preview){this.xr.updatePreview(delta);this.renderer.render(this.scene,this.camera);}else this.pipeline.render();this.frameCount++;
    if(this.frameCount%60===0){
      const canvas=this.renderer.domElement;
      canvas.dataset.frames=String(this.frameCount);
      canvas.dataset.frameMs=actualFrameMs.toFixed(1);
      if(this.metricsTime)canvas.dataset.fps=(60000/(now-this.metricsTime)).toFixed(1);
      this.metricsTime=now;
      canvas.dataset.drawCalls=String(this.renderer.info.render.drawCalls);
      canvas.dataset.triangles=String(this.renderer.info.render.triangles);
    }
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    window.removeEventListener('resize',this.onResize);document.removeEventListener('visibilitychange',this.onVisibility);
    this.renderer?.setAnimationLoop(null);this.controls?.dispose();
    this.xr?.dispose();
    this.renderer?.domElement.removeEventListener('dblclick',this.onDoubleClick);this.renderer?.domElement.removeEventListener('keydown',this.onKey);
    this.weather?.dispose();this.materials?.dispose();
    this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});
    this.floor?.material.dispose();this.envTarget?.dispose();this.environment?.dispose();
    this.effects&&Object.values(this.effects).forEach(e=>e.dispose?.());this.beauty?.dispose();this.pipeline?.dispose();this.renderer?.dispose();
  }
}

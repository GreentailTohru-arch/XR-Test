import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const EXHIBITS=[
  {id:'eaves',seal:'水',title:'四水归堂与灰瓦滴水',english:'RAIN / EAVES',position:[-.82,1.42,-.60],
    paragraphs:[['01  屋面导水','仰瓦承水、覆瓦压缝，重叠的灰瓦把雨水沿坡面送向檐口。檐下的细密水线，是屋顶排水路径的最后一段。'],['02  天井聚景','“四水归堂”指向内院组织的屋面与雨水意象。本场景以厅堂、回廊与水院取景，并非完整四合天井复原。'],['03  靠近观察','抬头看瓦垄，沿檐口追踪滴水，再比较檐下干燥木地板与庭院湿石面的反射。']]},
  {id:'pond',seal:'石',title:'太湖石与理水锦鲤池',english:'STONE / WATER',position:[4.15,1.32,2.28],
    paragraphs:[['01  石中山水','太湖石常以瘦、皱、漏、透来品评。孔洞让光与视线穿行，近观是一块石，远观可联想到山峦。'],['02  水面借景','池水将石、木、檐与暖灯收进倒影。岸线的曲折延长观看路径，也让同一处小景在不同角度不断变化。'],['03  动静相生','观察锦鲤缓游与雨滴扩散的细圈：水面扰动让倒影时聚时散，静止的建筑因此有了时间感。']]},
  {id:'moon',seal:'门',title:'月洞门与回廊框景',english:'FRAME / PASSAGE',position:[-2.43,1.45,1.58],
    paragraphs:[['01  以洞为框','圆形门洞将门后竹影、柱与墙组织成一幅可行走的画。门框遮住一部分景物，也把注意力引向圆内。'],['02  步移景异','穿过月洞门时，前后景的相对位置持续改变。回廊让身体沿路线移动，景色随脚步展开。'],['03  转身再看','从水院看向回廊，再进入廊中回望池石，比较两次取景的前景、遮挡和纵深。']]},
  {id:'lattice',seal:'窗',title:'花窗格栅与冷暖光影',english:'LATTICE / LIGHT',position:[2.46,1.52,-.83],
    paragraphs:[['01  格栅的秩序','木构的横竖分格将窗面划出节奏。格栅既是围护细节，也把室内灯光切分成有层次的明暗。'],['02  一窗两种光','庭院的冷色夜光与室内的暖色灯光在窗边相遇。湿木、石面与半透窗纸呈现不同的反射和透光感。'],['03  贴近材质','从侧面观察窗格厚度、榫接式交叠和窗纸表面，再退到院中看整片窗面的光色关系。']]},
  {id:'study',seal:'茶',title:'文人书斋与茶席雅器',english:'STUDY / TEA',position:[.98,1.38,-3.73],
    paragraphs:[['01  器物与尺度','案几、书册、卷轴与笔墨构成书斋的日常线索。进入室内后，用身体尺度感受桌面高度和器物之间的疏密。'],['02  茶席留白','茶壶、杯盏与托盘围绕使用顺序摆放。器物之外留下的空隙，让动作、视线与交谈都有余地。'],['03  材质相映','比较瓷器的柔亮釉面、木案的细长纹理和纸张的漫反射，观察灯光如何在三种材料上停留。']]},
];

function canvasTexture(canvas){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;}
function wrap(ctx,text,x,y,width,lineHeight){let line='';for(const char of text){if(ctx.measureText(line+char).width>width){ctx.fillText(line,x,y);line=char;y+=lineHeight;}else line+=char;}if(line)ctx.fillText(line,x,y);return y+lineHeight;}
function cardCanvas(item){
  const c=document.createElement('canvas');c.width=1600;c.height=1040;const x=c.getContext('2d');
  x.fillStyle='#122426';x.fillRect(0,0,1600,1040);
  x.strokeStyle='#8d7851';x.lineWidth=2;x.strokeRect(30,30,1540,980);
  x.fillStyle='#b69a63';x.font='24px Georgia, serif';x.fillText('雨  庭    /    JIANGNAN COURTYARD',90,88);
  x.textAlign='right';x.fillText(item.english,1510,88);x.textAlign='left';
  x.fillStyle='#eee4cc';x.font='600 58px "Microsoft YaHei", sans-serif';x.fillText(item.title,90,181);
  x.strokeStyle='#6b644a';x.beginPath();x.moveTo(90,220);x.lineTo(1510,220);x.stroke();
  let y=283;
  for(const [heading,body]of item.paragraphs){
    x.fillStyle='#d4b978';x.font='500 36px "Microsoft YaHei", sans-serif';x.fillText(heading,90,y);
    x.fillStyle='#d4ddd4';x.font='46px "Microsoft YaHei", sans-serif';y=wrap(x,body,90,y+60,1420,60)+55;
  }
  x.fillStyle='#98a49a';x.font='25px "Microsoft YaHei", sans-serif';x.fillText('再次轻触印章收起  ·  移步庭院，发现下一处细节',90,966);
  return c;
}
function labelCanvas(text,width=512,height=192){
  const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
  x.clearRect(0,0,width,height);x.fillStyle='#e4cf98';x.textAlign='center';x.textBaseline='middle';
  x.font=`500 ${Math.min(height*.48,width/Math.max(2,text.length)*.8)}px "Microsoft YaHei", sans-serif`;x.fillText(text,width/2,height/2);return c;
}

export class SpatialUI {
  constructor(scene,world,doors,callbacks={}){
    Object.assign(this,{scene,world,doors,callbacks});this.items=[];this.textures=[];this.materials=[];this.elapsed=0;
    this.group=new THREE.Group();this.group.name='Spatial heritage interpretation';world.add(this.group);this.group.visible=false;
    this.wood=this.material({color:0x39271e,roughness:.54,clearcoat:.22});
    this.edge=this.material({color:0xb59858,metalness:.7,roughness:.28});
    this.jade=this.material({color:0x637f73,roughness:.3,clearcoat:.8,emissive:0x294438,emissiveIntensity:.2});
    this.dark=this.material({color:0x111c1c,roughness:.8});this.raycaster=new THREE.Raycaster();this.gazeTime=0;
    this.occluders=[];world.traverse(o=>{if(o.isMesh&&!o.material?.transparent)this.occluders.push(o);});
    for(const data of EXHIBITS)this.addExhibit(data);
    this.addControls();this.addStatus();
    this.gazeDot=new THREE.Mesh(new THREE.RingGeometry(.004,.006,24),new THREE.MeshBasicNodeMaterial({color:0xe6cc91,transparent:true,opacity:.65,depthTest:false}));
    this.gazeDot.renderOrder=1000;this.gazeDot.visible=false;scene.add(this.gazeDot);
  }
  material(props){const m=new THREE.MeshPhysicalNodeMaterial(props);this.materials.push(m);return m;}
  box(parent,w,h,d,material,x=0,y=0,z=0,r=.008){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/4,h/4,d/4)),material);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
  text(parent,text,w,h,x=0,y=0,z=.04){
    const tex=canvasTexture(labelCanvas(text,1024,Math.round(1024*h/w)));this.textures.push(tex);
    const mat=this.material({map:tex,transparent:true,roughness:.9,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.8,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  button(parent,label,x=0,y=0,w=.21,h=.21){
    const pivot=new THREE.Group();pivot.position.set(x,y,0);parent.add(pivot);
    this.box(pivot,w+.025,h+.025,.075,this.wood,0,0,0);
    this.box(pivot,w+.008,h+.008,.023,this.edge,0,0,.042);
    const cap=this.box(pivot,w,h,.038,this.jade,0,0,.061);
    this.text(cap,label,w*.88,h*.85,0,0,.022);
    return {pivot,cap,w,h,restZ:.061,spring:0,velocity:0,lastActivated:-10,action:()=>{},open:false};
  }
  addExhibit(data){
    const node=new THREE.Group();node.position.fromArray(data.position);this.group.add(node);
    const item=this.button(node,data.seal);Object.assign(item,{data,node,awake:0,kind:'exhibit'});
    const board=new THREE.Group();board.position.set(0,.66,-.025);node.add(board);board.visible=false;
    this.box(board,1.31,.875,.065,this.wood);
    this.box(board,1.279,.845,.016,this.edge,0,0,.037);
    this.box(board,1.26,.824,.011,this.dark,0,0,.048);
    const tex=canvasTexture(cardCanvas(data));this.textures.push(tex);
    const m=this.material({map:tex,roughness:.93,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.7});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.8125),m);face.position.z=.055;board.add(face);
    this.box(node,.008,.22,.008,this.edge,0,.22,-.016,.001);
    item.board=board;item.action=()=>{item.open=!item.open;board.visible=item.open;if(item.open)board.scale.setScalar(.72);};this.items.push(item);
  }
  addControls(){
    const dock=new THREE.Group();dock.position.set(-1.28,1.35,3.35);this.group.add(dock);this.dock=dock;
    this.box(dock,.81,.2,.05,this.wood);
    this.controls=['归位','瞬转','退出'].map((label,i)=>{
      const item=this.button(dock,label,(i-1)*.255,0,.21,.125);item.kind='control';item.node=dock;
      item.action=()=>[this.callbacks.home,this.callbacks.turn,this.callbacks.exit][i]?.();this.items.push(item);return item;
    });
  }
  addStatus(){
    this.status=new THREE.Group();this.scene.add(this.status);this.status.visible=false;
    this.box(this.status,.9,.16,.025,this.wood);this.box(this.status,.885,.145,.008,this.edge,0,0,.015);
    this.statusCanvas=document.createElement('canvas');this.statusCanvas.width=1800;this.statusCanvas.height=280;
    this.statusTexture=canvasTexture(this.statusCanvas);this.textures.push(this.statusTexture);
    const m=this.material({map:this.statusTexture,roughness:1,emissive:0xffffff,emissiveMap:this.statusTexture,emissiveIntensity:.9});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.875,.136),m);mesh.position.z=.021;this.status.add(mesh);
  }
  setStatus(text){
    if(text===this.statusText)return;this.statusText=text;const x=this.statusCanvas.getContext('2d');x.fillStyle='#142526';x.fillRect(0,0,1800,280);
    x.fillStyle='#d8c08a';x.font='42px "Microsoft YaHei", sans-serif';x.textAlign='center';x.fillText('雨  庭  /  混 合 现 实',900,78);
    x.fillStyle='#e5e8d7';x.font='46px "Microsoft YaHei", sans-serif';x.fillText(text,900,185,1680);this.statusTexture.needsUpdate=true;
  }
  positionStatus(head,rotation){
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation);forward.y=0;forward.normalize();
    this.status.position.copy(head).addScaledVector(forward,1.05);this.status.position.y=head.y-.32;this.status.rotation.y=Math.atan2(head.x-this.status.position.x,head.z-this.status.position.z);this.status.visible=true;
  }
  setMode(mode){
    this.mode=mode;this.group.visible=!!mode;this.status.visible=false;this.gazeDot.visible=false;
    for(const item of this.items)if(item.board){item.open=false;item.board.visible=false;item.awake=0;}
    for(const [i,label]of (mode==='mr'?['重放','微缩','退出']:['归位','瞬转','退出']).entries()){
      const mesh=this.controls[i].cap.children[0];const tex=canvasTexture(labelCanvas(label,1024,588));
      const old=mesh.material.map;this.textures.splice(this.textures.indexOf(old),1);old.dispose();this.textures.push(tex);mesh.material.map=tex;mesh.material.emissiveMap=tex;mesh.material.needsUpdate=true;
    }
  }
  warmAudio(){
    try{this.audio??=new (window.AudioContext||window.webkitAudioContext)();this.audio.resume().catch(()=>{});}catch{/* Visual and haptic feedback still work without audio. */}
  }
  sound(){
    if(!this.audio||this.audio.state!=='running')return;const t=this.audio.currentTime,g=this.audio.createGain(),o=this.audio.createOscillator();
    o.type='sine';o.frequency.setValueAtTime(730,t);o.frequency.exponentialRampToValueAtTime(290,t+.09);g.gain.setValueAtTime(.055,t);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(g);g.connect(this.audio.destination);o.start(t);o.stop(t+.13);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  activate(item,input){
    if(this.elapsed-item.lastActivated<.4)return;item.lastActivated=this.elapsed;item.velocity=-.7;item.action();this.sound();this.callbacks.feedback?.(input);
  }
  pick(origin,direction){
    this.raycaster.set(origin,direction);this.raycaster.far=this.mode==='mr'?4:4.5;
    const hits=this.raycaster.intersectObjects(this.items.filter(i=>i.node.visible).map(i=>i.cap),false);
    if(!hits.length)return null;const hit=hits[0];
    this.raycaster.far=Math.max(0,hit.distance-.025);
    if(this.raycaster.intersectObjects(this.occluders,false).length)return null;
    const item=this.items.find(i=>i.cap===hit.object);return {item,point:hit.point,distance:hit.distance};
  }
  update(delta,head,rotation,inputs=[],{placed=true,manipulating=false,gaze=true}={}){
    if(!this.mode)return;this.elapsed+=delta;this.group.visible=placed;
    const scale=this.world.scale.x,localHead=this.world.worldToLocal(head.clone()),uiScale=this.mode==='mr'?Math.min(3,Math.max(1,.3/scale)):1;
    for(const item of this.items){
      if(item.kind==='exhibit'){
        const point=item.node.getWorldPosition(new THREE.Vector3());const distance=head.distanceTo(point);
        const nearHand=inputs.some(s=>s.poke.distanceTo(point)<.42);
        const wake=(this.mode==='mr'?nearHand:distance<3)||item.open;
        item.awake=THREE.MathUtils.damp(item.awake,wake?1:.22,7,delta);
        item.node.scale.setScalar(uiScale);item.pivot.scale.setScalar(item.awake);
        item.node.rotation.y=Math.atan2(localHead.x-item.node.position.x,localHead.z-item.node.position.z);
        if(item.open&&distance>4.5){item.open=false;item.board.visible=false;}
        if(item.open){item.board.scale.setScalar(THREE.MathUtils.damp(item.board.scale.x,1,12,delta));}
      }
      item.velocity+=(-130*item.spring-19*item.velocity)*delta;item.spring=THREE.MathUtils.clamp(item.spring+item.velocity*delta,-.03,.004);item.cap.position.z=item.restZ+item.spring;
    }
    this.dock.scale.setScalar(uiScale);this.dock.rotation.y=Math.atan2(localHead.x-this.dock.position.x,localHead.z-this.dock.position.z);
    this.group.updateMatrixWorld(true);
    if(!placed||manipulating){this.gazeDot.visible=false;return;}
    for(const state of inputs){
      const hit=this.pick(state.rayOrigin,state.rayDirection);
      if(hit){hit.item.awake=1;this.callbacks.aim?.(state,hit.point);if(state.activated){this.activate(hit.item,state);state.activated=false;}}
      for(const item of this.items){
        const p=item.cap.worldToLocal(state.poke.clone());
        const inside=Math.abs(p.x)<item.w*.6&&Math.abs(p.y)<item.h*.6&&p.z>-.035&&p.z<.065;
        if(inside&&!state.pokeLatched.has(item)){state.pokeLatched.add(item);this.activate(item,state);state.activated=false;}
        else if(!inside)state.pokeLatched.delete(item);
      }
      if(state.activated){if(this.interactDoor(state))state.activated=false;}
      this.pushDoor(state);
    }
    this.gazeDot.visible=gaze&&inputs.length===0;
    if(this.gazeDot.visible){
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation),hit=this.pick(head,forward);
      this.gazeDot.position.copy(hit?.point||head.clone().addScaledVector(forward,1.3));this.gazeDot.quaternion.copy(rotation);
      this.gazeDot.scale.setScalar(hit?.distance||1.3);
      if(hit?.item===this.gazeTarget){this.gazeTime+=delta;if(this.gazeTime>1.6){this.activate(hit.item);this.gazeTime=-2;}}
      else {this.gazeTarget=hit?.item;this.gazeTime=0;}
      if(hit)hit.item.awake=1;
    }
  }
  interactDoor(state){
    this.raycaster.set(state.rayOrigin,state.rayDirection);this.raycaster.far=2.5;
    for(const door of this.doors){if(this.raycaster.intersectObject(door.group,true).length){door.open=!door.open;door.targetAngle=door.open?-door.sign*1.35:-door.sign*.025;this.sound();this.callbacks.feedback?.(state);return true;}}return false;
  }
  pushDoor(state){
    for(const door of this.doors){
      const p=door.group.worldToLocal(state.poke.clone());const near=p.x*door.sign>0&&p.x*door.sign<.66&&p.y>0&&p.y<2.14&&Math.abs(p.z)<.12;
      if(near&&!state.pokeLatched.has(door)){state.pokeLatched.add(door);door.open=true;door.targetAngle=-door.sign*1.35;this.sound();this.callbacks.feedback?.(state);}
      else if(!near)state.pokeLatched.delete(door);
    }
  }
  animateDoors(delta){for(const door of this.doors){door.group.rotation.y=THREE.MathUtils.damp(door.group.rotation.y,door.targetAngle,9,delta);}}
  dispose(){
    this.group.traverse(o=>o.geometry?.dispose());this.status.traverse(o=>o.geometry?.dispose());this.group.removeFromParent();this.status.removeFromParent();
    this.gazeDot.geometry.dispose();this.gazeDot.material.dispose();this.gazeDot.removeFromParent();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.audio?.close();
  }
}

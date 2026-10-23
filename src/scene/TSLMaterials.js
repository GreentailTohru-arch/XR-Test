import * as THREE from 'three/webgpu';
import { uv, texture, color, float, vec2, vec3, vec4, positionWorld, positionLocal, normalWorld, normalMap, mix, smoothstep, sin, cos, time, mx_noise_float, uniform } from 'three/tsl';
import { makeSurface, paintingTexture } from './Textures.js';

export class TSLMaterials {
  constructor() {
    this.all = new Set(); this.textures = [];
    this.motion = uniform(1);
    // Procedural patina belongs to the courtyard, including when MR moves/scales it.
    this.worldInverse = uniform(new THREE.Matrix4());
    this.scenePosition = this.worldInverse.mul(vec4(positionWorld,1)).xyz;
    this.clock = time.mul(this.motion);
    this.wood = this.surface('wood', [93, 59, 36], 6, { roughness:.6, normalScale:.48 });
    this.wetWood = this.surface('wood', [80, 53, 34], 6, { wet:true, normalScale:.42 });
    this.lightWood = this.surface('wood', [134, 100, 60], 9, { roughness:.52, normalScale:.35 });
    this.blackWood = this.surface('wood', [45, 36, 29], 4, { roughness:.7, normalScale:.3 });
    this.stone = this.surface('stone', [106, 116, 113], 11, { wet:true, moss:true, normalScale:.8 });
    this.stoneLight = this.surface('stone', [134, 138, 129], 12, { wet:true, moss:true, normalScale:.7 });
    this.rock = this.surface('stone', [117, 126, 119], 18, { wet:true, moss:true, rock:true, normalScale:.8 });
    this.plaster = this.surface('plaster', [196, 194, 176], 5, { damp:true, normalScale:.44 });
    this.earth = this.surface('earth', [57, 65, 44], 12, { roughness:.98, normalScale:1.1 });
    this.gravel = this.surface('stone', [119, 119, 101], 22, { roughness:.95, normalScale:1 });
    this.tiles = [0,1,2,3].map(i=>this.surface('tile',[51+i*4,60+i*4,63+i*4],3+i,{wet:true,roof:true,normalScale:.65}));
    this.plinth = this.surface('stone',[33,38,38],21,{roughness:.8,normalScale:.22});
    this.brass = this.physical({color:0x655334,metalness:.72,roughness:.38});
    this.ceramic = this.physical({color:0xc8c7b2,roughness:.16,clearcoat:1,clearcoatRoughness:.08,ior:1.5});
    this.blueCeramic = this.physical({color:0x547c7c,roughness:.2,clearcoat:1,ior:1.5});
    this.ink = this.physical({color:0x232b2b,roughness:.8});
    this.linen = this.surface('plaster',[138,127,96],12,{roughness:.98,normalScale:.3});
    this.paper = this.physical({color:0xcdb888,roughness:.95,emissive:0xffb257,emissiveIntensity:2.1,side:THREE.DoubleSide});
    this.softPaper = this.physical({color:0xcab58b,roughness:.95,emissive:0xffbc72,emissiveIntensity:.38,side:THREE.DoubleSide});
    this.leaf = this.createLeaf(0x354e2c);
    this.leafLight = this.createLeaf(0x576842);
    this.bamboo = this.surface('wood',[82,100,53],16,{wet:true,normalScale:.36});
    this.moss = this.surface('earth',[51,69,37],2,{roughness:1,normalScale:.8});
    this.glass = this.createGlass();
    this.water = this.createWater();
    this.painting = this.physical({map:paintingTexture(),roughness:.95}); this.textures.push(this.painting.map);
    this.koi = this.createKoi();
  }

  physical(properties) { const m=new THREE.MeshPhysicalNodeMaterial(properties);this.all.add(m);return m; }

  surface(kind,base,seed,options={}) {
    const t=makeSurface(kind,base,seed);this.textures.push(...Object.values(t));
    const repeat=kind==='wood'?vec2(1,1.5):vec2(1,1);
    const p=uv().mul(repeat);
    const m=this.physical({roughness:options.roughness??.75,metalness:0,clearcoat:options.wet?.65:0,clearcoatRoughness:.14});
    const n=mx_noise_float(this.scenePosition.mul(kind==='wood'?2.1:2.5)).mul(.5).add(.5);
    let baseColor=texture(t.color,p).rgb;
    if(options.wet) {
      const wet=smoothstep(.23,.69,n);
      baseColor=baseColor.mul(mix(.82,.55,wet));
      m.roughnessNode=options.rock?mix(.62,.34,wet):mix(.36,.17,wet);
      if(options.rock)m.clearcoat=.18;
      if(kind==='stone'&&!options.rock) {
        const puddle=smoothstep(.59,.76,n).mul(smoothstep(.4,.72,this.scenePosition.y.oneMinus())).mul(smoothstep(.87,.99,normalWorld.y));
        m.roughnessNode=mix(m.roughnessNode,.028,puddle);m.clearcoatNode=mix(.5,1,puddle);
      }
    } else m.roughnessNode=texture(t.rough,p).r.mul(options.roughness??.86);
    if(options.moss) {
      const low=smoothstep(.15,.8,this.scenePosition.y).oneMinus();
      const mask=smoothstep(.6,.82,n).mul(low).mul(.54);
      baseColor=mix(baseColor,color(0x283824),mask);
      m.roughnessNode=mix(m.roughnessNode,.93,mask);
    }
    if(options.damp) {
      const bottom=smoothstep(.43,1.5,this.scenePosition.y).oneMinus().mul(n.mul(.65).add(.2));
      baseColor=mix(baseColor,color(0x5b6254),bottom.mul(.6));
    }
    m.colorNode=baseColor;
    let normalUV=p;
    if(options.roof){
      normalUV=p.add(vec2(0,this.clock.mul(.018)));
      const streak=sin(p.x.mul(85).add(sin(p.y.mul(12).sub(this.clock.mul(.2))))).mul(.5).add(.5);
      m.roughnessNode=mix(.21,.34,streak);
    }
    m.normalNode=normalMap(texture(t.normal,normalUV),vec2(options.normalScale??.5));
    return m;
  }

  createLeaf(tint) {
    const m=this.physical({color:tint,roughness:.48,clearcoat:.28,clearcoatRoughness:.25,side:THREE.DoubleSide,transmission:.08,thickness:.018,ior:1.35});
    const anchor=positionLocal.y.max(0).mul(.009);
    const wind=sin(this.clock.mul(.58).add(positionLocal.x.mul(.9))).add(sin(this.clock.mul(.91).add(positionLocal.z.mul(2))).mul(.3));
    m.positionNode=positionLocal.add(vec3(wind.mul(anchor),0,wind.mul(anchor).mul(.45)));
    m.colorNode=color(tint).mul(mix(.72,1.15,uv().y)).mul(sin(uv().x.mul(18)).mul(.025).add(1));
    return m;
  }

  createGlass() {
    const m=this.physical({color:0xa9b9b5,roughness:.15,transparent:true,opacity:.17,metalness:0,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});
    const p=uv().mul(vec2(21,3));
    const drop=sin(p.x.mul(6.28).add(sin(p.y.mul(6).add(this.clock.mul(.24)))).mul(.025));
    m.normalNode=normalMap(vec3(drop.add(.5),sin(p.y.mul(18).sub(this.clock.mul(.5))).mul(.022).add(.5),1));
    return m;
  }

  createWater() {
    const m=this.physical({color:0x233e39,roughness:.06,metalness:.08,clearcoat:1,clearcoatRoughness:.035,transparent:true,opacity:.68,ior:1.333,depthWrite:false,side:THREE.DoubleSide});
    const p=this.scenePosition.xz;
    let sx=sin(p.x.mul(3.2).add(this.clock.mul(.32))).mul(.009), sy=cos(p.y.mul(4).sub(this.clock.mul(.28))).mul(.009);
    for(let i=0;i<9;i++){
      const origin=vec2(Math.sin(i*42)*2.0+1.8,Math.cos(i*13)*1.1+2.15);
      const delta=p.sub(origin), d=delta.length().max(.001), phase=this.clock.mul(.34).add(i*.173).fract();
      const ring=d.sub(phase.mul(1.4));
      const envelope=ring.abs().mul(-14).exp().mul(phase.oneMinus()).mul(.027);
      const wave=sin(ring.mul(54)).mul(envelope);
      sx=sx.add(delta.x.div(d).mul(wave));sy=sy.add(delta.y.div(d).mul(wave));
    }
    m.normalNode=normalMap(vec3(sx.add(.5),sy.add(.5),1));
    return m;
  }

  createKoi() {
    const m=this.physical({roughness:.3,clearcoat:.8,color:0xe0d8b9});
    const pattern=mx_noise_float(positionLocal.mul(vec3(7,12,9)));
    m.colorNode=mix(color(0xe4ddc5),color(0xb44c2a),smoothstep(.03,.16,pattern));
    const tailWeight=smoothstep(-.05,.33,positionLocal.z);
    m.positionNode=positionLocal.add(vec3(sin(positionLocal.z.mul(14).sub(this.clock.mul(2.5))).mul(tailWeight).mul(.045),0,0));
    return m;
  }

  dispose() { this.all.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose()); }
}

import * as THREE from 'three/webgpu';
import { attribute, texture, uv, vec2, vec3, positionLocal, normalMap, sin, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TILE=128,COLS=8,PAD=4;

function makeCanvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function textureFrom(canvas,srgb=false){const t=new THREE.CanvasTexture(canvas);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t;}

/** One immutable atlas replaces procedural fragment noise and physical coatings.
 * The desktop material objects and their shader graphs are never modified. */
export class XRMaterialAtlas {
  constructor(sources,materials){
    this.sources=[...new Set(sources)];this.slots=new Map(this.sources.map((m,i)=>[m,i]));
    const rows=Math.max(1,2**Math.ceil(Math.log2(Math.ceil(this.sources.length/COLS))));
    this.width=COLS*TILE;this.height=rows*TILE;this.clock=uniform(0);
    const canvases=['color','normal','rough'].map(()=>makeCanvas(this.width,this.height));
    this.sources.forEach((source,i)=>this.bake(source,i,canvases));
    this.textures=canvases.map((c,i)=>textureFrom(c,i===0));
    const tile=attribute('xrTile','vec2');
    const atlasUV=uv().fract().mul(vec2((TILE-2*PAD)/this.width,(TILE-2*PAD)/this.height)).add(tile);
    const [albedo,normals,rough]=this.textures;
    this.opaque=new THREE.MeshStandardNodeMaterial({roughness:.5});
    this.opaque.colorNode=texture(albedo,atlasUV).rgb;
    this.opaque.normalNode=normalMap(texture(normals,atlasUV));
    this.opaque.roughnessNode=texture(rough,atlasUV).r;
    this.opaque.metalnessNode=attribute('xrMetal','float');
    this.opaque.emissiveNode=attribute('xrEmission','vec3');
    this.foliage=this.opaque.clone();this.foliage.side=THREE.DoubleSide;
    this.foliage.roughnessNode=null;this.foliage.roughness=.4;
    const wind=sin(this.clock.add(positionLocal.x)).mul(positionLocal.y.max(0)).mul(.009);
    this.foliage.positionNode=positionLocal.add(vec3(wind,0,wind.mul(.45)));
    // A small unlit contribution keeps the back of a leaf readable without transmission.
    this.foliage.emissiveNode=texture(albedo,atlasUV).rgb.mul(.12);
    this.glass=new THREE.MeshStandardNodeMaterial({color:0xa9b9b5,roughness:.15,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    this.glass.emissive.setHex(0x73542c);this.glass.emissiveIntensity=.18;
    this.water=new THREE.MeshStandardNodeMaterial({color:0x233e39,roughness:.03,metalness:.08,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    // Exactly two sine waves; no radial droplet loops, exponentials or fragment noise.
    const p=materials.scenePosition.xz;
    const a=sin(p.x.mul(3.2).add(this.clock.mul(.32))).mul(.009);
    const b=sin(p.y.mul(4).sub(this.clock.mul(.28))).mul(.009);
    this.water.normalNode=normalMap(vec3(a.add(.5),b.add(.5),1));
    this.materials=[this.opaque,this.foliage,this.glass,this.water];this.sceneMaterials=materials;
    this.materials.forEach((m,i)=>m.name=['XR atlas','XR single-wave leaves','XR simple glass','XR two-wave water'][i]);
  }
  bake(source,slot,canvases){
    const surface=source.userData.xrSurface,images=surface?.textures;
    const scratch=makeCanvas(TILE,TILE),ctx=scratch.getContext('2d',{willReadFrequently:true});
    const x=slot%COLS*TILE,y=Math.floor(slot/COLS)*TILE;
    const read=(image,fallback)=>{
      ctx.fillStyle=fallback;ctx.fillRect(0,0,TILE,TILE);
      if(image)ctx.drawImage(image,0,0,TILE,TILE);
      return ctx.getImageData(0,0,TILE,TILE);
    };
    const albedo=read(images?.color.image||source.map?.image,`#${source.color.getHexString()}`);
    const normals=read(images?.normal.image,'#8080ff');
    const rough=read(images?.rough.image,'#aaaaaa');
    for(let i=0;i<rough.data.length;i+=4){
      const mask=rough.data[i]/255;
      let r=source.roughness??.7,dark=1;
      if(surface){
        r=(surface.roughness??.85)*mask;
        if(surface.wet){
          const wet=THREE.MathUtils.clamp((mask-.55)*2.6,0,1);dark=.82-wet*.27;
          r=surface.rock?.62-wet*.28:surface.kind==='stone'?.25-wet*.22:.34-wet*.17;
        }
        const strength=surface.normalScale??.5;
        normals.data[i]=128+(normals.data[i]-128)*strength;normals.data[i+1]=128+(normals.data[i+1]-128)*strength;
      }
      for(let c=0;c<3;c++){albedo.data[i+c]*=dark;rough.data[i+c]=THREE.MathUtils.clamp(r,.03,1)*255;}
    }
    [albedo,normals,rough].forEach((pixels,j)=>{
      ctx.putImageData(pixels,0,0);const out=canvases[j].getContext('2d');
      out.drawImage(scratch,0,0,TILE,TILE,x+PAD,y+PAD,TILE-2*PAD,TILE-2*PAD);
      // Duplicate edge texels into gutters so atlas mipmaps do not bleed.
      out.drawImage(scratch,0,0,1,TILE,x,y+PAD,PAD,TILE-2*PAD);
      out.drawImage(scratch,TILE-1,0,1,TILE,x+TILE-PAD,y+PAD,PAD,TILE-2*PAD);
      out.drawImage(scratch,0,0,TILE,1,x,y,TILE,PAD);
      out.drawImage(scratch,0,TILE-1,TILE,1,x,y+TILE-PAD,TILE,PAD);
    });
  }
  materialFor(source){
    if(source===this.sceneMaterials.water)return this.water;
    if(source===this.sceneMaterials.glass)return this.glass;
    if(source===this.sceneMaterials.leaf||source===this.sceneMaterials.leafLight)return this.foliage;
    return this.opaque;
  }
  decorate(geometry,source,worldMatrix,warmLights=[]){
    const count=geometry.attributes.position.count,slot=this.slots.get(source);
    const tiles=new Float32Array(count*2),emission=new Float32Array(count*3),metal=new Float32Array(count);
    // CanvasTexture flips vertically on upload; address atlas rows from the bottom.
    const tx=(slot%COLS*TILE+PAD)/this.width,ty=1-(Math.floor(slot/COLS)*TILE+TILE-PAD)/this.height;
    const position=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(worldMatrix);
    const baseGlow=source.emissive?.clone().multiplyScalar(source.emissiveIntensity??1)||new THREE.Color(0),glow=new THREE.Color();
    for(let i=0;i<count;i++){
      tiles[i*2]=tx;tiles[i*2+1]=ty;metal[i]=source.metalness||0;
      glow.copy(baseGlow);
      position.fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(worldMatrix);
      normal.fromBufferAttribute(geometry.attributes.normal,i).applyNormalMatrix(normalMatrix);
      // Bake the missing lantern bounce into ground/wood vertex emission once.
      if(normal.y>.45&&position.y<1.1){
        for(const light of warmLights){
          const d=(position.x-light.x)**2+(position.z-light.z)**2;
          const strength=Math.exp(-d/1.2)*.08;
          glow.r+=strength;glow.g+=strength*.48;glow.b+=strength*.16;
        }
      }
      emission.set([glow.r,glow.g,glow.b],i*3);
    }
    geometry.setAttribute('xrTile',new THREE.BufferAttribute(tiles,2));
    geometry.setAttribute('xrEmission',new THREE.BufferAttribute(emission,3));
    geometry.setAttribute('xrMetal',new THREE.BufferAttribute(metal,1));
    return geometry;
  }
  dispose(){this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}

/** Merge static descendants across original groups; doors and koi retain local transforms. */
export class XRSceneOptimizer {
  constructor(app){
    this.app=app;this.groups=[];this.originals=[];this.visibleState=new Map();
    const world=app.world;world.updateMatrixWorld(true);
    const dynamic=[...app.architecture.doors.map(d=>d.group),...app.garden.fish.map(f=>f.group)];
    const excluded=new Set([app.xr.ui.group,...app.weather.resources.map(r=>r.mesh)]);
    const owners=new Map([[world,[]],...dynamic.map(g=>[g,[]])]);
    const visit=(object,owner)=>{
      if(excluded.has(object))return;
      if(owners.has(object))owner=object;
      if(object.isMesh&&object.geometry&&!object.isInstancedMesh&&!object.geometry.isInstancedBufferGeometry){
        owners.get(owner).push(object);this.originals.push(object);
      }
      for(const child of object.children)visit(child,owner);
    };
    visit(world,world);
    this.atlas=new XRMaterialAtlas(this.originals.map(m=>m.material),app.materials);
    const inverse=new THREE.Matrix4().copy(world.matrixWorld).invert();
    const warm=[];world.traverse(o=>{if(o.isPointLight&&!o.userData.xrCore)warm.push(o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));});
    let originalTriangles=0,optimizedTriangles=0;
    for(const [owner,meshes]of owners){
      const group=new THREE.Group();group.name='XR merged '+(owner.name||'geometry');group.visible=false;
      const ownerInverse=new THREE.Matrix4().copy(owner.matrixWorld).invert(),buckets=new Map();
      for(const mesh of meshes){
        const source=mesh.userData.xrGeometry||mesh.geometry,g=source.index?source.toNonIndexed():source.clone();
        originalTriangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
        optimizedTriangles+=g.attributes.position.count/3;
        if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
        const localToWorld=inverse.clone().multiply(mesh.matrixWorld);
        this.atlas.decorate(g,mesh.material,localToWorld,owner===world?warm:[]);
        g.applyMatrix4(ownerInverse.clone().multiply(mesh.matrixWorld));
        const material=this.atlas.materialFor(mesh.material);
        const list=buckets.get(material)||[];list.push(g);buckets.set(material,list);
      }
      for(const [material,parts]of buckets){
        const geometry=mergeGeometries(parts,false);geometry.computeBoundingSphere();
        const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=!material.transparent;
        mesh.castShadow=material===this.atlas.opaque&&!app.garden.fish.some(f=>f.group===owner);
        if(material.transparent)mesh.renderOrder=2;
        group.add(mesh);parts.forEach(p=>p.dispose());
      }
      owner.add(group);this.groups.push(group);
    }
    this.stats={originalMeshes:this.originals.length,mergedMeshes:this.groups.reduce((n,g)=>n+g.children.length,0),originalTriangles,optimizedTriangles};
  }
  enable(){for(const mesh of this.originals){this.visibleState.set(mesh,mesh.visible);mesh.visible=false;}this.groups.forEach(g=>g.visible=true);}
  disable(){for(const [mesh,visible]of this.visibleState)mesh.visible=visible;this.visibleState.clear();this.groups.forEach(g=>g.visible=false);}
  dispose(){this.disable();for(const group of this.groups){group.traverse(o=>o.geometry?.dispose());group.removeFromParent();}this.atlas.dispose();}
}

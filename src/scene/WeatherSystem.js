import * as THREE from 'three/webgpu';
import { attribute, positionLocal, positionWorld, cameraPosition, fog, uv, vec2, vec3, vec4, float, color, sin, smoothstep, mx_noise_float, Fn, Loop, uniform, getViewPosition, screenUV } from 'three/tsl';
import { random } from './Geometry.js';

export class WeatherSystem {
  constructor(scene,materials,architecture,compact=false) {
    this.scene=scene;this.materials=materials;this.architecture=architecture;this.resources=[];
    this.rain(compact?650:1450);this.drips();
  }
  rain(count) {
    const rng=random(87),quad=new THREE.PlaneGeometry(.009,.16),g=new THREE.InstancedBufferGeometry();
    g.index=quad.index;g.attributes.position=quad.attributes.position;g.attributes.uv=quad.attributes.uv;g.attributes.normal=quad.attributes.normal;
    const values=new Float32Array(count*3),speeds=new Float32Array(count);
    for(let i=0;i<count;i++){values.set([(rng()-.5)*10.6,rng()*8,(rng()-.5)*10.6],i*3);speeds[i]=.8+rng()*.45;}
    g.setAttribute('rainOrigin',new THREE.InstancedBufferAttribute(values,3));g.setAttribute('rainSpeed',new THREE.InstancedBufferAttribute(speeds,1));g.instanceCount=count;
    const origin=attribute('rainOrigin','vec3'),speed=attribute('rainSpeed','float'),t=this.materials.clock;
    const y=origin.y.sub(t.mul(3.7).mul(speed)).mod(7.7).add(.4);
    const x=origin.x.add(y.mul(.065));
    const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,color:0x94adba});
    m.positionNode=positionLocal.add(vec3(x,y,origin.z));
    const axis=smoothstep(0,.18,uv().x).mul(smoothstep(1,.82,uv().x));
    const ends=sin(uv().y.mul(Math.PI)).mul(.22);
    // Rain below the main roof and covered gallery is explicitly masked out.
    const hall=origin.z.lessThan(-1.02).and(origin.z.greaterThan(-5.3)).and(origin.x.abs().lessThan(4.9)).and(y.lessThan(4.35));
    const gallery=origin.x.lessThan(-1.8).and(origin.x.greaterThan(-5.1)).and(origin.z.greaterThan(-1.5)).and(origin.z.lessThan(1.38)).and(y.lessThan(3.7));
    const bounds=x.abs().lessThan(5.25).and(origin.z.abs().lessThan(5.25));
    m.opacityNode=axis.mul(ends).mul(hall.or(gallery).select(0,1)).mul(bounds.select(1,0));
    const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.name='GPU instanced fine rain';mesh.renderOrder=4;this.scene.add(mesh);this.resources.push({mesh,g,m});
  }
  drips() {
    const rng=random(62),origins=[];
    for(const e of this.architecture.eaves)for(let i=0;i<35;i++)origins.push(e.x+(rng()-.5)*e.width,e.y,e.z);
    const count=origins.length/3,quad=new THREE.PlaneGeometry(.012,.046),g=new THREE.InstancedBufferGeometry();g.index=quad.index;g.attributes.position=quad.attributes.position;g.attributes.normal=quad.attributes.normal;g.attributes.uv=quad.attributes.uv;
    g.setAttribute('dripOrigin',new THREE.InstancedBufferAttribute(new Float32Array(origins),3));
    g.setAttribute('phase',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},()=>rng()),1));g.instanceCount=count;
    const origin=attribute('dripOrigin','vec3'),phase=attribute('phase','float'),fall=this.materials.clock.mul(.48).add(phase).fract();
    const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,color:0xb1c1c4});
    m.positionNode=positionLocal.add(vec3(origin.x,origin.y.sub(fall.pow(2).mul(origin.y.sub(.47))),origin.z.add(fall.mul(.03))));
    m.opacityNode=sin(uv().y.mul(Math.PI)).mul(.43).mul(smoothstep(0,.03,fall));
    const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.name='Falling eave droplets';mesh.renderOrder=4;this.scene.add(mesh);this.resources.push({mesh,g,m});
  }

  // Integrate a bounded, height-dependent fog volume along the actual camera ray.
  fogNode(input,depth,camera,steps=10) {
    const inverseProjection=uniform(camera.projectionMatrixInverse),worldMatrix=uniform(camera.matrixWorld),eye=uniform(camera.position),t=this.materials.clock;
    return Fn(()=>{
      const view=getViewPosition(screenUV,depth,inverseProjection);
      const endpoint=worldMatrix.mul(vec4(view,1)).xyz;
      const ray=endpoint.sub(eye),distance=ray.length().min(55),step=distance.div(steps);
      const transmission=float(1).toVar(),scatter=vec3(0).toVar();
      Loop(steps,({i})=>{
        const fraction=float(i).add(.5).div(steps),p=eye.add(ray.mul(fraction));
        const edge=smoothstep(4.6,5.4,p.x.abs().max(p.z.abs())).oneMinus();
        const height=smoothstep(.42,1.6,p.y).oneMinus().mul(smoothstep(.28,.43,p.y));
        const mist=mx_noise_float(p.mul(vec3(.9,1.8,.9)).add(vec3(t.mul(.035),0,t.mul(.018)))).mul(.5).add(.5);
        const density=edge.mul(height).mul(smoothstep(.19,.8,mist)).mul(.075);
        const absorb=density.mul(step).negate().exp().oneMinus();
        const warmth=p.sub(vec3(-.1,1,-1)).length().mul(-.35).exp().mul(.3);
        const tint=color(0x667c83).mix(color(0xb59a70),warmth);
        scatter.addAssign(tint.mul(absorb).mul(transmission));transmission.mulAssign(absorb.oneMinus());
      });
      return vec4(input.rgb.mul(transmission).add(scatter),input.a);
    })();
  }
  update(t) {
    for(const {pivot,phase}of this.architecture.lanterns){pivot.rotation.z=Math.sin(t*.67+phase)*.012;pivot.rotation.x=Math.sin(t*.49+phase)*.008;}
    for(const {light,base,phase}of this.architecture.lights)light.intensity=base*(1+Math.sin(t*.43+phase)*.014+Math.sin(t*.71+phase)*.008);
  }
  // Uses each eye's camera position, without a monoscopic screen-space render pass.
  stereoFogNode() {
    const inverse=this.materials.worldInverse,t=this.materials.clock;
    const factor=Fn(()=>{
      const eye=inverse.mul(vec4(cameraPosition,1)).xyz;
      const endpoint=inverse.mul(vec4(positionWorld,1)).xyz;
      const ray=endpoint.sub(eye),step=ray.length().min(24).div(6),optical=float(0).toVar();
      Loop(6,({i})=>{
        const p=eye.add(ray.mul(float(i).add(.5).div(6)));
        const edge=smoothstep(4.6,5.3,p.x.abs().max(p.z.abs())).oneMinus();
        const height=smoothstep(.42,1.7,p.y).oneMinus().mul(smoothstep(.28,.43,p.y));
        const mist=mx_noise_float(p.mul(vec3(.9,1.8,.9)).add(vec3(t.mul(.035),0,t.mul(.018)))).mul(.5).add(.5);
        optical.addAssign(edge.mul(height).mul(smoothstep(.19,.8,mist)).mul(.09).mul(step));
      });
      return optical.negate().exp().oneMinus().clamp(0,.48);
    })();
    return fog(color(0x667c83),factor);
  }
  dispose(){for(const {g,m}of this.resources){g.dispose();m.dispose();}}
}

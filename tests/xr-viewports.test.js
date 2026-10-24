import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector4 } from 'three/webgpu';
import { syncXRViewports } from '../src/xr/XRViewports.js';

function fixture({layers=false,webgpu=false,height=2048}={}){
  const views=[{eye:'left'},{eye:'right'}];
  const rectangles=[{x:32,y:64,width:1536,height:1728},{x:1744,y:96,width:1504,height:1664}];
  const cameras=views.map((_,i)=>{const camera=new PerspectiveCamera();camera.viewport=new Vector4();camera.projectionMatrix.elements[8]=i?-.12:.12;camera.position.set(i?.032:-.032,1.65,0);return camera;});
  const read=view=>rectangles[views.indexOf(view)];
  const layer=layers?{}:{getViewport:read};
  const renderer={backend:{isWebGLBackend:!webgpu},getOutputRenderTarget:()=>({height}),xr:{isPresenting:true,getBaseLayer:()=>layer,getCamera:()=>({cameras}),getBinding:()=>({getViewSubImage:(_,view)=>({viewport:read(view)})})}};
  return {renderer,pose:{views},rectangles,cameras,height};
}
// These are the pixel rectangles WebGLBackend sends to gl.viewport after its
// top-left -> bottom-left conversion. They must match the compositor exactly.
function actualGLViewport(camera,height){const v=camera.viewport;return {x:v.x,y:height-v.y-v.w,width:v.z,height:v.w};}

for(const layers of [false,true])test(`${layers?'projection layer':'base layer'}: asymmetric padded eyes land in the runtime crop`,()=>{
  const f=fixture({layers}),matrices=f.cameras.map(c=>c.projectionMatrix.toArray()),positions=f.cameras.map(c=>c.position.toArray());
  syncXRViewports(f.renderer,f.pose);
  f.cameras.forEach((camera,i)=>{assert.deepEqual(actualGLViewport(camera,f.height),f.rectangles[i]);assert.deepEqual(camera.projectionMatrix.toArray(),matrices[i]);assert.deepEqual(camera.position.toArray(),positions[i]);});
});

test('dynamic resolution and repeat rendering do not flip or accumulate offsets',()=>{
  const f=fixture({layers:true});
  for(const scale of [1,.85,.7,1]){
    f.rectangles.forEach((r,i)=>{r.height=Math.round((1728-i*64)*scale);r.width=Math.round((1536-i*32)*scale);});
    for(let frame=0;frame<60;frame++){syncXRViewports(f.renderer,f.pose);f.cameras.forEach((c,i)=>assert.deepEqual(actualGLViewport(c,f.height),f.rectangles[i]));}
  }
});

test('full-height eyes remain unchanged and native WebGPU viewports are not flipped',()=>{
  const full=fixture();full.rectangles.forEach(r=>{r.y=0;r.height=full.height;});syncXRViewports(full.renderer,full.pose);
  full.cameras.forEach(c=>assert.equal(c.viewport.y,0));
  const gpu=fixture({webgpu:true});gpu.cameras.forEach(c=>c.viewport.set(12,34,500,600));syncXRViewports(gpu.renderer,gpu.pose);
  gpu.cameras.forEach(c=>assert.deepEqual(c.viewport.toArray(),[12,34,500,600]));
});

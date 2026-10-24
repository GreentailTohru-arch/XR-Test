// WebXR's GL viewports use a bottom-left origin. Three r186's common renderer
// uses a top-left origin, including the per-eye ArrayCamera viewport. Read the
// runtime rectangle every frame so padding and dynamic resolution stay aligned.
export function syncXRViewports(renderer,pose){
  if(!renderer.backend.isWebGLBackend||!renderer.xr.isPresenting)return;
  const target=renderer.getOutputRenderTarget(),layer=renderer.xr.getBaseLayer();
  if(!target||!layer)return;
  const cameras=renderer.xr.getCamera().cameras;
  const binding=typeof layer.getViewport==='function'?null:renderer.xr.getBinding();
  for(let i=0;i<pose.views.length;i++){
    const viewport=binding?binding.getViewSubImage(layer,pose.views[i]).viewport:layer.getViewport(pose.views[i]);
    cameras[i].viewport.set(viewport.x,target.height-viewport.y-viewport.height,viewport.width,viewport.height);
  }
}

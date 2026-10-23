// Imported only behind import.meta.env.DEV and an explicit URL opt-in.
// Never shipped in the production bundle or enabled on a normal headset visit.
import { XRDevice, metaQuest3 } from 'iwer';

export function installDevelopmentEmulator(){
  const device=new XRDevice(metaQuest3);
  device.installRuntime({forceInstall:true});device.stereoEnabled=true;device.position.set(0,1.65,0);
  installFramebufferAdapter();
  device.installSEM(SyntheticRoom);
  window.__xrQA={device,app:null};
  window.__xrQA.errors=[];
  const originalError=console.error;
  console.error=(...args)=>{if(window.__xrQA.errors.length<30)window.__xrQA.errors.push(args.map(a=>a?.stack||String(a)).join(' '));originalError(...args);};
  console.info('IWER development emulation enabled. This is not a physical headset test.');
}

class SyntheticRoom {
  constructor(){
    this.version='courtyard-test-fixture';this.trackedMeshes=new Set();
    const polygon=(w,d)=>[[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z])=>({x,y:0,z,w:1}));
    this.trackedPlanes=new Set([
      {transform:new XRRigidTransform(),polygon:polygon(6,6),semanticLabel:'floor'},
      {transform:new XRRigidTransform({y:.72,z:-1.3}),polygon:polygon(.9,.6),semanticLabel:'table'},
    ]);
    this.environmentCanvas=document.createElement('canvas');this.environmentCanvas.width=1280;this.environmentCanvas.height=720;
    const ctx=this.environmentCanvas.getContext('2d');ctx.fillStyle='#35464b';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#d3c7a8';ctx.textAlign='center';ctx.font='16px sans-serif';ctx.fillText('IWER · 合成地面 / 桌面 · 非真实透视画面',640,690);
  }
  computeHitTestResults(ray){
    const hits=[];for(const [y,table]of [[.72,true],[0,false]]){
      if(Math.abs(ray[9])<1e-5)continue;const t=(y-ray[13])/-ray[9];if(t<=0)continue;
      const x=ray[12]-ray[8]*t,z=ray[14]-ray[10]*t;
      if(table&&(Math.abs(x)>.9||z<-1.9||z>-.7))continue;
      if(Math.abs(x)>6||Math.abs(z)>6)continue;
      hits.push({t,m:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1])});
    }return hits.sort((a,b)=>a.t-b.t).map(h=>h.m);
  }
  render(){}loadEnvironment(){}loadDefaultEnvironment(){return Promise.resolve();}deleteAll(){this.trackedPlanes.clear();}computeDepthBuffer(){return null;}
}

function installFramebufferAdapter(){
  // IWER's base layer normally exposes the canvas's null framebuffer. The r186
  // common WebGL backend expects an actual XR framebuffer object. This test-only
  // adapter supplies a real color/depth framebuffer, then mirrors it to the canvas.
  const BaseLayer=window.XRWebGLLayer;
  window.XRWebGLLayer=class extends BaseLayer {
    constructor(session,gl,options){
      super(session,gl,options);this.gl=gl;
      const request=session.requestAnimationFrame.bind(session);
      session.requestAnimationFrame=callback=>request((time,frame)=>{callback(time,frame);this.present();});
      session.addEventListener('end',()=>this.release(),{once:true});
    }
    get framebuffer(){
      const gl=this.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;if(this.fb&&this.w===w&&this.h===h)return this.fb;
      const draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),texture=gl.getParameter(gl.TEXTURE_BINDING_2D),renderbuffer=gl.getParameter(gl.RENDERBUFFER_BINDING);
      this.release();this.w=w;this.h=h;this.fb=gl.createFramebuffer();this.color=gl.createTexture();this.depth=gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);gl.bindTexture(gl.TEXTURE_2D,this.color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.color,0);
      gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);return this.fb;
    }
    present(){
      if(!this.fb)return;const gl=this.gl,draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),scissor=gl.isEnabled(gl.SCISSOR_TEST);
      gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.fb);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,this.w,this.h,0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.COLOR_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);if(scissor)gl.enable(gl.SCISSOR_TEST);
    }
    release(){const gl=this.gl;if(!gl)return;if(this.fb)gl.deleteFramebuffer(this.fb);if(this.color)gl.deleteTexture(this.color);if(this.depth)gl.deleteRenderbuffer(this.depth);this.fb=null;}
  };
}

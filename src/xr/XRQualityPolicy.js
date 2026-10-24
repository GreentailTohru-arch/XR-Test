export const XR_RENDERING = Object.freeze({
  vr:Object.freeze({framebufferScale:1,viewportScale:1,foveation:0,samples:4}),
  mr:Object.freeze({framebufferScale:1,viewportScale:1,foveation:0,samples:4}),
});

export const XR_QUALITY = Object.freeze([
  {name:'performance',rain:300,animationHz:15},
  {name:'balanced',rain:340,animationHz:24},
  {name:'quality',rain:380,animationHz:30},
]);

// A slow frame reduces detail promptly; recovery needs ten healthy windows.
// Frame intervals include missed display deadlines, unlike CPU render time alone.
export class XRQualityPolicy {
  constructor(targetHz=72){this.reset(targetHz);}
  reset(targetHz=72){
    this.targetHz=targetHz;this.level=2;this.samples=[];this.cpu=[];
    this.previous=0;this.started=null;this.windowStart=null;this.slow=0;this.healthy=0;this.p90=0;
  }
  sample(now,cpuMs=0){
    if(this.started===null)this.started=now;
    const interval=this.previous?now-this.previous:0;this.previous=now;
    // Ignore loss of tracking / background resumes and shader warmup.
    if(interval<=0||interval>250||now-this.started<2000){this.samples=[];this.cpu=[];this.windowStart=now;return false;}
    this.samples.push(interval);this.cpu.push(cpuMs);
    if(now-this.windowStart<1000||this.samples.length<8)return false;
    this.samples.sort((a,b)=>a-b);this.p90=this.samples[Math.floor((this.samples.length-1)*.9)];
    const budget=1000/this.targetHz,meanCPU=this.cpu.reduce((a,b)=>a+b,0)/this.cpu.length;
    this.slow=this.p90>budget*1.25||meanCPU>budget*.85?this.slow+1:0;
    this.healthy=this.p90<budget*1.12&&meanCPU<budget*.55?this.healthy+1:0;
    this.samples=[];this.cpu=[];this.windowStart=now;
    const before=this.level;
    if(this.slow>=2&&this.level>0){this.level--;this.slow=0;this.healthy=0;}
    else if(this.healthy>=10&&this.level<2){this.level++;this.healthy=0;}
    return this.level!==before;
  }
  get profile(){return XR_QUALITY[this.level];}
}

export function isInsideHall(point){return point.x>-4.55&&point.x<4.25&&point.z>-4.68&&point.z<-1.43&&point.y<3.5;}

export function preferredRefreshRate(session){
  const rates=Array.from(session?.supportedFrameRates||[]);
  return rates.includes(90)?90:rates.includes(72)?72:session?.frameRate||72;
}

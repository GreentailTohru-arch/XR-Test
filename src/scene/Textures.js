import * as THREE from 'three/webgpu';

function hash(x, y, seed) { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); }
function noise(x, y, seed) {
  const a = Math.floor(x), b = Math.floor(y), fx = x-a, fy=y-b;
  const u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
  return (hash(a,b,seed)*(1-u)+hash(a+1,b,seed)*u)*(1-v)+(hash(a,b+1,seed)*(1-u)+hash(a+1,b+1,seed)*u)*v;
}
function fbm(x,y,seed) { return noise(x,y,seed)*.58+noise(x*2.1,y*2.1,seed+1)*.27+noise(x*4.3,y*4.3,seed+2)*.15; }

export function makeSurface(kind, base, seed = 1, size = 512) {
  const colorCanvas=document.createElement('canvas'), normalCanvas=document.createElement('canvas'), roughCanvas=document.createElement('canvas');
  for(const c of [colorCanvas,normalCanvas,roughCanvas]) c.width=c.height=size;
  const ctx=colorCanvas.getContext('2d'), nctx=normalCanvas.getContext('2d'), rctx=roughCanvas.getContext('2d');
  const img=ctx.createImageData(size,size), normal=nctx.createImageData(size,size), rough=rctx.createImageData(size,size), heights=new Float32Array(size*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,i=y*size+x, n=fbm(u*9,v*9,seed), fine=hash(x,y,seed), broad=noise(u*3,v*3,seed+20);
    let h=n, variation=n*.35+.75, r=.72;
    if(kind==='wood') {
      const warp=noise(u*3,v*5,seed)*.13, grain=Math.sin((u+warp)*190+noise(u*25,v*3,seed)*8);
      const fibers=noise(u*150,v*5,seed), knot=Math.sin(Math.hypot((u-.68)*2,(v-.38)*.55)*170+noise(u*5,v*5,seed)*3);
      h=fibers*.3+grain*.1+knot*.025; variation=.61+fibers*.25+grain*.095+broad*.17; r=.62+fibers*.22;
    } else if(kind==='stone') {
      const fissure=Math.pow(Math.max(0,1-Math.abs(noise(u*8,v*8,seed+3)-.5)*35),5);
      h=n*.65+fine*.16-fissure*.15; variation=.72+n*.38-fissure*.11; r=.65+n*.3;
    } else if(kind==='plaster') {
      h=n*.45+fine*.22; variation=.83+broad*.17+fine*.035; r=.87+fine*.1;
    } else if(kind==='tile') {
      const patina=noise(u*5,v*18,seed+3); h=n*.45+fine*.1; variation=.7+n*.25+patina*.16; r=.54+patina*.31;
    } else if(kind==='earth') { h=n*.6+fine*.4; variation=.62+n*.65; r=.94; }
    heights[i]=h;
    const p=i*4; for(let k=0;k<3;k++) img.data[p+k]=Math.min(255,base[k]*variation+(fine-.5)*4);
    img.data[p+3]=255; rough.data[p]=rough.data[p+1]=rough.data[p+2]=r*255;rough.data[p+3]=255;
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*2.8;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*2.8;
    const len=Math.sqrt(dx*dx+dy*dy+1);
    normal.data[i]=(-dx/len*.5+.5)*255;normal.data[i+1]=(-dy/len*.5+.5)*255;normal.data[i+2]=(1/len*.5+.5)*255;normal.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);nctx.putImageData(normal,0,0);rctx.putImageData(rough,0,0);
  const textures=[colorCanvas,normalCanvas,roughCanvas].map(c=>{const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;});
  textures[0].colorSpace=THREE.SRGBColorSpace;
  return {color:textures[0],normal:textures[1],rough:textures[2]};
}

export function paintingTexture() {
  const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#baab8f';ctx.fillRect(0,0,256,512);ctx.fillStyle='#d8ccb0';ctx.fillRect(16,30,224,448);
  ctx.strokeStyle='#434b42';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(96,399);ctx.bezierCurveTo(108,304,86,230,118,131);ctx.stroke();
  for(let i=0;i<17;i++){const y=154+i*13,x=103+Math.sin(i)*8;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(i%2?40:-35),y-20);ctx.stroke();for(let k=0;k<3;k++){ctx.fillStyle=`rgba(48,61,49,${.4+k*.16})`;ctx.beginPath();ctx.ellipse(x+(i%2?1:-1)*(15+k*11),y-10-k*5,3,15,i%2?.7:-.7,0,Math.PI*2);ctx.fill();}}
  ctx.fillStyle='#963c2b';ctx.fillRect(185,381,13,17);ctx.fillStyle='#545448';ctx.font='16px serif';['听','雨'].forEach((s,i)=>ctx.fillText(s,182,80+i*23));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function makeEnvironment() {
  const width=256,height=128,data=new Float32Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const t=y/height,sky=Math.max(0,Math.cos(t*Math.PI)),horizon=Math.exp(-Math.pow((t-.48)*7,2));
    const cool=.12+sky*.58+horizon*.12, warm=Math.exp(-Math.pow((x/width-.18)*24,2)-Math.pow((t-.48)*18,2));
    const i=(y*width+x)*4;data[i]=cool*.56+warm*1.6;data[i+1]=cool*.72+warm*.77;data[i+2]=cool*.9+warm*.25;data[i+3]=1;
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;return texture;
}

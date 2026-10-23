import * as THREE from 'three/webgpu';
import { GeometryBatch, random, leafGeometry, irregularStone } from './Geometry.js';

export class GardenBuilder {
  constructor(scene,materials) {this.scene=scene;this.m=materials;this.b=new GeometryBatch(scene);this.rng=random(840);this.fish=[];}
  build() {
    const {b,m,rng}=this;
    // Sharp square slab and layered plinth, with no floating terrain beyond its edges.
    b.box(11.4,.55,11.4,m.plinth,0,-.065,0);
    b.box(11.48,.08,11.48,m.blackWood,0,-.325,0);
    b.box(11.46,.075,11.46,m.plinth,0,.245,0);
    b.box(10.96,.12,10.96,m.earth,0,.34,0);
    for(const edge of [-1,1]){
      b.box(10.94,.12,.18,m.stone,0,.4,edge*5.39);
      b.box(.18,.12,10.94,m.stone,edge*5.39,.4,0);
    }
    // Laid flagstones: irregular sizes, small joints, and rounded worn edges.
    for(let row=0;row<5;row++)for(let col=0;col<5;col++){
      const x=-1.28+col*.565+(row%2)*.06,z=-.04+row*.62;
      if(x>.8&&z>1)continue;
      b.box(.535-rng()*.025,.075,.585-rng()*.028,col%3?m.stone:m.stoneLight,x,.44+rng()*.006,z,[0,(rng()-.5)*.018,0],.022);
    }
    for(let i=0;i<7;i++)b.box(.75,.085,.48,i%3?m.stoneLight:m.stone,-.72-i*.16,.46,2.64+i*.36,[0,-.13+(rng()-.5)*.07,0],.035);
    for(let i=0;i<5;i++)b.box(.68,.065,.47,m.stone,-3.4+i*.46,.44,1.75+i*.1,[0,-.12+(rng()-.5)*.2,0],.035);
    for(let i=0;i<3;i++)b.box(.65,.075,.46,m.stoneLight,1.4+i*.76,.43,-.22,[0,(rng()-.5)*.1,0],.025);
    // Pebble beds beside the path, individually shaded and batched.
    const pebble=irregularStone(15);
    for(let i=0;i<650;i++){
      const x=(rng()-.5)*10.2,z=(rng()-.5)*10.2;
      if(z<-.42||this.insidePool(x,z,1.14)||this.onPath(x,z)||x<-2&&z<1.3)continue;
      const s=.02+rng()*.035;b.add(pebble,i%3?m.gravel:m.stone,[x,.405,z],[0,rng()*6,0],[s,.012+rng()*.016,s*.8]);
    }pebble.dispose();
    this.pond();
    // Taihu limestone built as a porous composition of smooth eroded bridges.
    this.taihu(3.78,.48,1.02,1.0);
    this.taihu(3.2,.43,3.76,.58);
    this.taihu(-4.16,.42,2.07,.67);
    this.bambooGrove(3.94,-.37,13,2.8);
    this.bambooGrove(-4.05,3.23,16,2.7);
    this.bambooGrove(4.58,3.16,7,1.7);
    this.smallTree(-2.63,3.62);
    for(const [x,z]of [[-2.32,2.3],[-1.8,4.5],[.15,4.75],[4.47,4.2],[2.8,.36],[-4.58,1.8],[3.58,2.9]])this.grass(x,z);
    this.stoneLantern(-2.1,.4,1.24);
    // An unassuming clay pot at the veranda, with a soft fern silhouette.
    b.lathe([[.16,0],[.2,.04],[.25,.36],[.28,.4],[.24,.42]],m.wood,1.71,.44,-.86);
    this.fern(1.71,.86,-.86,.67);
    b.flush('Garden masonry, Taihu stones and botanical details');
    this.createKoi();
    return this;
  }
  insidePool(x,z,pad=1) {return ((x-2)/2.14)**2+((z-2.25)/1.5)**2<pad;}
  onPath(x,z) {return (x>-1.65&&x<1.4&&z<1.2)||(x>-1.65&&x<.25&&z<3.1)||(x>-2.2&&x<-.25&&z>2.9);}

  pond() {
    const {b,m,rng}=this,shape=new THREE.Shape(),points=[];
    for(let i=0;i<80;i++){
      const a=i/80*Math.PI*2,r=1+.045*Math.sin(a*3)+.025*Math.cos(a*7);
      points.push(new THREE.Vector2(Math.cos(a)*2.12*r,-Math.sin(a)*1.5*r));
    }
    shape.setFromPoints(points);shape.closePath();
    const bed=new THREE.ShapeGeometry(shape,64);b.add(bed,m.ink,[2,.407,2.25],[-Math.PI/2,0,0]);bed.dispose();
    const waterGeometry=new THREE.ShapeGeometry(shape,64),water=new THREE.Mesh(waterGeometry,m.water);water.rotation.x=-Math.PI/2;water.position.set(2,.59,2.25);water.name='Rain-ripple koi pond';water.renderOrder=2;this.scene.add(water);
    const stone=irregularStone(30);
    for(let i=0;i<44;i++){
      const a=i/44*Math.PI*2,r=1+.045*Math.sin(a*3)+.025*Math.cos(a*7);
      b.add(stone,i%4===0?m.stoneLight:m.rock,[2+Math.cos(a)*2.18*r,.46+rng()*.04,2.25+Math.sin(a)*1.55*r],[rng()*.4,rng()*6,rng()*.3],[.16+rng()*.12,.12+rng()*.11,.14+rng()*.1]);
    }
    for(let i=0;i<95;i++){
      const x=(rng()-.5)*4,z=(rng()-.5)*2.7;if((x/2)**2+(z/1.3)**2>1)continue;
      const s=.035+rng()*.07;b.add(stone,m.gravel,[2+x,.425,2.25+z],[rng(),rng()*6,rng()],[s,s*.3,s*.8]);
    }stone.dispose();
    // Small wet patches continue the water language onto the flagstones.
    for(const [x,z,sx,sz]of [[-.88,1.3,.23,.19],[.38,.2,.31,.12],[-.9,3.15,.25,.12],[-2.59,1.99,.16,.09]]){
      const mesh=new THREE.Mesh(new THREE.CircleGeometry(1,40),m.water);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.485,z);mesh.scale.set(sx,sz,1);mesh.renderOrder=2;this.scene.add(mesh);
    }
  }

  taihu(x,y,z,s) {
    const {b,m}=this;
    const nodes=[[-.35,.12,0,.38,.16,.28],[.22,.12,.08,.34,.17,.3],[-.3,.48,.03,.18,.44,.22],[.26,.45,-.04,.16,.42,.19],[-.05,.85,-.03,.4,.18,.21],[-.18,1.1,-.08,.15,.3,.17],[.12,1.26,-.09,.27,.14,.16],[.38,.87,-.14,.12,.3,.15]];
    for(let i=0;i<nodes.length;i++){
      const [px,py,pz,sx,sy,sz]=nodes[i],g=irregularStone(i+19);
      b.add(g,i%3?m.rock:m.moss,[x+px*s,y+py*s,z+pz*s],[.15*i,.4*i,0],[sx*s,sy*s,sz*s]);g.dispose();
    }
  }

  bambooGrove(cx,cz,count,maxHeight) {
    const {b,m,rng}=this,leaf=leafGeometry();
    for(let i=0;i<count;i++){
      const x=cx+(rng()-.5)*1.22,z=cz+(rng()-.5)*1.1,h=maxHeight*(.63+rng()*.43),leanX=(rng()-.5)*.35,leanZ=(rng()-.5)*.35,r=.019+rng()*.019;
      for(let j=0;j<7;j++){
        const t=j/7,t1=(j+1)/7,a=[x+leanX*t*t,.43+h*t,z+leanZ*t*t],e=[x+leanX*t1*t1,.43+h*t1,z+leanZ*t1*t1];
        b.beam(a,e,r*(1-t*.35),m.bamboo,7);
        b.cylinder(r*1.15,r*1.15,.025,m.leafLight,e[0],e[1],e[2],undefined,8);
        if(j<2)continue;
        for(let k=0;k<2;k++){
          const angle=rng()*Math.PI*2,len=.24+rng()*.4;
          const tip=[e[0]+Math.cos(angle)*len,e[1]+.06+rng()*.22,e[2]+Math.sin(angle)*len];
          b.beam(e,tip,.006,m.bamboo,5);
          for(let l=0;l<6;l++){
            const p=l/6,sgn=l%2?1:-1;
            const px=e[0]+(tip[0]-e[0])*p,pz=e[2]+(tip[2]-e[2])*p,py=e[1]+(tip[1]-e[1])*p;
            const scale=.7+rng()*.65;
            b.add(leaf,l%3?m.leaf:m.leafLight,[px,py,pz],[(rng()-.5)*.8,angle+sgn*.76,(rng()-.5)*.9],[scale,scale,scale*1.25]);
          }
        }
      }
    }leaf.dispose();
  }

  smallTree(x,z) {
    const {b,m,rng}=this,leaf=leafGeometry();
    const branch=(start,direction,len,radius,level)=>{
      const end=[start[0]+direction[0]*len,start[1]+direction[1]*len,start[2]+direction[2]*len];
      const mid=[(start[0]+end[0])/2+.06,(start[1]+end[1])/2,(start[2]+end[2])/2];
      b.beam(start,mid,radius,m.wood);b.beam(mid,end,radius*.72,m.wood);
      if(level>0)for(let i=0;i<3;i++){
        const a=rng()*Math.PI*2;branch(end,[Math.cos(a)*.74,.32+rng()*.45,Math.sin(a)*.74],len*(.58+rng()*.14),radius*.52,level-1);
      }else for(let i=0;i<19;i++){
        const angle=rng()*Math.PI*2,r=rng()*.33;
        b.add(leaf,i%4?m.leaf:m.leafLight,[end[0]+Math.cos(angle)*r,end[1]+(rng()-.5)*.22,end[2]+Math.sin(angle)*r],[-.6+rng(),angle,rng()],[1.25,.8,.75]);
      }
    };
    branch([x,.42,z],[-.12,.98,.1],1.12,.095,3);leaf.dispose();
    const g=irregularStone(92);b.add(g,m.moss,[x,.43,z],[0,0,0],[.44,.11,.39]);g.dispose();
  }

  grass(x,z) {
    const {b,m,rng}=this;
    for(let i=0;i<24;i++){
      const angle=rng()*Math.PI*2,h=.17+rng()*.34,r=.08+rng()*.12;
      const points=[new THREE.Vector3(x+Math.cos(angle)*r,.41,z+Math.sin(angle)*r),new THREE.Vector3(x+Math.cos(angle)*r*1.5,.41+h*.78,z+Math.sin(angle)*r*1.5),new THREE.Vector3(x+Math.cos(angle)*(r+.2),.41+h,z+Math.sin(angle)*(r+.2))];
      const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),5,.009,3,false);b.add(g,m.leaf);g.dispose();
    }
  }
  fern(x,y,z,scale) {
    const {b,m}=this,leaf=leafGeometry();
    for(let i=0;i<11;i++){
      const a=i*2.4,len=scale*(.68+(i%3)*.15);
      for(let j=0;j<8;j++){
        const t=j/8,px=x+Math.cos(a)*len*t,pz=z+Math.sin(a)*len*t,py=y+Math.sin(t*Math.PI*.8)*len*.6;
        for(const side of [-1,1])b.add(leaf,m.leafLight,[px,py,pz],[-.3,a+side*1.1,.25],[.55*(1-t*.5),.5,.55*(1-t*.5)]);
      }
    }leaf.dispose();
  }

  stoneLantern(x,y,z) {
    const {b,m}=this;
    b.box(.51,.11,.5,m.stone,x,y+.06,z,undefined,.035);
    b.cylinder(.14,.23,.16,m.rock,x,y+.18,z,undefined,8);
    b.cylinder(.095,.13,.36,m.rock,x,y+.43,z,undefined,8);
    b.box(.39,.09,.36,m.stoneLight,x,y+.65,z,undefined,.02);
    b.box(.22,.27,.21,m.paper,x,y+.83,z);
    for(const sx of [-1,1])for(const sz of [-1,1])b.box(.065,.31,.065,m.rock,x+sx*.145,y+.83,z+sz*.13);
    b.cylinder(.07,.39,.2,m.rock,x,y+1.08,z,[0,Math.PI/4,0],4);
    b.sphere(.08,m.rock,x,y+1.23,z,[.8,1.1,.8]);
    const light=new THREE.PointLight(0xffc583,2.7,3,2);light.position.set(x,y+.85,z);this.scene.add(light);
  }

  createKoi() {
    for(let i=0;i<3;i++){
      const fish=new THREE.Group();fish.name='Koi '+(i+1);this.scene.add(fish);
      const b=new GeometryBatch(fish),m=this.m;
      b.sphere(.12,m.koi,0,0,0,[.65,.58,2.1]);
      b.sphere(.079,m.koi,0,.005,-.18,[.83,.82,1.2]);
      const fin=new THREE.BufferGeometry();fin.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.17,-.11,.008,.34,.11,.008,.34],3));fin.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,1,1,1],2));fin.computeVertexNormals();
      const tail=m.physical({color:i===1?0xe8d4b4:0xc47748,roughness:.4,transparent:true,opacity:.9,side:THREE.DoubleSide});
      tail.positionNode=m.koi.positionNode;b.add(fin,tail);fin.dispose();
      for(const side of [-1,1]){
        b.sphere(.055,tail,side*.08,-.016,-.03,[1,.09,1.6]);
        b.sphere(.009,m.ink,side*.058,.03,-.217);
      }
      b.flush('Koi body');
      const points=[];for(let j=0;j<9;j++){const a=j/9*Math.PI*2;points.push(new THREE.Vector3(2+Math.cos(a)*(1.26+i*.13),.49+Math.sin(a*2)*.015,2.25+Math.sin(a)*(.83-i*.13)));}
      const curve=new THREE.CatmullRomCurve3(points,true,'catmullrom',.5);
      this.fish.push({group:fish,curve,offset:i/3,speed:.012+i*.002});
    }
  }
  update(t) {
    for(const f of this.fish){const progress=(t*f.speed+f.offset)%1,p=f.curve.getPointAt(progress),tangent=f.curve.getTangentAt(progress);f.group.position.copy(p);f.group.rotation.y=Math.atan2(-tangent.x,-tangent.z);}
  }
}

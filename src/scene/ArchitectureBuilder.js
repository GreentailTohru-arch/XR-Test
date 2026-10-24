import * as THREE from 'three/webgpu';
import { GeometryBatch, random } from './Geometry.js';

export class ArchitectureBuilder {
  constructor(scene,materials) {
    this.scene=scene;this.m=materials;this.b=new GeometryBatch(scene);this.lanterns=[];this.lights=[];this.eaves=[];this.doors=[];this.rng=random(301);
  }
  build() {
    const {b,m}=this;
    // A domestic, single-storey hall, with a deep timber veranda.
    b.box(9.25,.27,3.7,m.stone,-.15,.53,-3.18,undefined,.035);
    b.box(9.05,.09,3.5,m.wood,-.15,.715,-3.18);
    for(let i=0;i<46;i++)b.box(.185,.028,3.44,i%4===0?m.lightWood:m.wood,-4.55+i*.195,.773,-3.18);
    b.box(9.1,2.58,.18,m.plaster,-.15,2.06,-4.83);
    b.box(.18,2.58,3.48,m.plaster,-4.68,2.06,-3.18);
    b.box(.18,2.58,3.48,m.plaster,4.38,2.06,-3.18);
    this.gables(-.15,-3.16,9.24,3.3,3.34,4.38);
    b.box(9.15,.26,.25,m.stone,-.15,.9,-4.72);
    b.box(.24,.26,3.5,m.stone,-4.58,.9,-3.18);
    b.box(.24,.26,3.5,m.stone,4.28,.9,-3.18);
    b.box(9.1,.19,.2,m.wood,-.15,3.22,-1.42);
    b.box(9.1,.17,.2,m.wood,-.15,2.83,-1.42);
    b.box(9.1,.18,.18,m.wood,-.15,3.25,-4.75);
    for(let x=-4.5;x<4.5;x+=1.47) {
      b.cylinder(.095,.11,2.56,m.wetWood,x,2.04,-1.41,undefined,12);
      b.cylinder(.135,.15,.16,m.stone,x,.84,-1.41);
      b.box(.42,.11,.23,m.wood,x,3.06,-1.41);
      b.box(.28,.11,.23,m.wood,x,2.96,-1.41);
      b.box(.14,.11,.23,m.wood,x,2.86,-1.41);
      b.box(.12,.14,3.38,m.wood,x,3.2,-3.05);
      b.beam([x,2.75,-1.45],[x,3.19,-1.95],.065,m.wood);
    }
    for(let z=-4.55;z<-1.5;z+=.42)b.box(9.05,.09,.07,m.blackWood,-.15,3.34,z);
    // Window bays leave a broad central opening and a visible study on the right.
    this.window(-3.76,-1.48,1.1,1.6);
    this.window(-2.28,-1.48,1.1,1.6);
    this.window(2.12,-1.48,1.08,1.6);
    this.window(3.6,-1.48,1.08,1.6);
    for(const x of [-3.76,-2.28,2.12,3.6]) b.box(1.29,.46,.1,m.wood,x,1.02,-1.47);
    // Open door panels, hinged away from the central tea room.
    this.door(-1.39,-1.46,-.88);
    this.door(1.14,-1.46,.88);
    b.box(3.15,.18,.65,m.stoneLight,-.15,.48,-.98,undefined,.025);
    b.box(3.6,.13,.65,m.stone,-.15,.355,-.66,undefined,.025);
    this.roof(-.15,-3.16,10.02,4.25,3.42,1.0);
    this.eaves.push({x:-.15,z:-1.035,width:9.8,y:3.57});

    // Left garden passage with a real circular opening cut through the wall.
    b.box(2.64,.16,2.42,m.stone,-3.47,.45,-.12,undefined,.03);
    for(let i=0;i<13;i++)b.box(.185,.06,2.3,m.wetWood,-4.67+i*.199,.57,-.12);
    b.box(.17,2.35,2.55,m.plaster,-4.82,1.72,-.1);
    this.gables(-3.45,-.1,2.87,2.5,2.98,3.7);
    this.moonWall(-3.45,1.12,2.88,2.55,.91);
    b.box(.14,2.5,.14,m.wetWood,-2.05,1.82,-.92);
    b.box(2.8,.16,.18,m.wood,-3.45,2.98,-.1);
    this.roof(-3.45,-.1,3.34,2.88,3.08,.65);
    this.eaves.push({x:-3.45,z:1.34,width:3.2,y:3.2});

    // Perimeter is kept low toward the viewer, preserving the diorama silhouette.
    this.boundaryWall(4.98,-2.15,5.8,1.55,Math.PI/2);
    this.boundaryWall(-4.98,2.9,3.9,1.45,Math.PI/2);
    this.boundaryWall(-4.02,4.96,1.95,.82,0);
    this.boundaryWall(4.25,4.96,1.45,.82,0);

    this.interiors();
    b.flush('Timber hall, tiled roofs and living spaces');
    this.lantern(-3.76,2.75,-1.05,.23);
    this.lantern(-.18,2.83,-1.07,.26);
    this.lantern(3.6,2.75,-1.05,.23);
    this.lantern(-3.45,2.61,.8,.22);
    this.warmLight(-1.5,2.4,-3.4,30,8);
    this.warmLight(2.4,2.3,-3.4,25,7);
    this.warmLight(-3.5,2.1,-.5,8,4);
    return this;
  }

  window(x,z,w,h) {
    const {b,m}=this,y=1.99;
    for(const side of [-1,1]) {
      b.box(.06,h+.12,.115,m.wood,x+side*(w/2+.025),y,z);
      b.box(w+.16,.06,.115,m.wood,x,y+side*(h/2+.025),z);
    }
    b.box(w-.06,.16,.025,m.softPaper,x,y+h/2-.09,z);
    // Glass and real open lattice reveal the furnished rooms behind them.
    b.box(w-.09,h-.08,.012,m.glass,x,y,z+.075);
    for(let i=-2;i<=2;i++)b.box(.025,h,.045,m.blackWood,x+i*w/5,y,z+.09);
    for(let i=-3;i<=3;i++)b.box(w,.025,.045,m.blackWood,x,y+i*h/7,z+.09);
    for(let i=-1;i<=1;i++)for(let j=-2;j<=2;j++){
      const cx=x+i*w/3.5,cy=y+j*h/5;
      b.box(.13,.017,.046,m.wood,cx,cy,z+.105,[0,0,Math.PI/4]);
      b.box(.13,.017,.046,m.wood,cx+.09,cy,z+.105,[0,0,-Math.PI/4]);
    }
    b.box(w+.22,.075,.23,m.wetWood,x,y-h*.5-.065,z+.05);
  }

  door(x,z,angle) {
    const group=new THREE.Group();group.position.set(x,.8,z);group.rotation.y=angle;this.scene.add(group);
    const b=new GeometryBatch(group),m=this.m,dir=angle<0?1:-1;
    this.doors.push({group,sign:dir,open:true,targetAngle:angle,restAngle:angle});
    b.box(.64,2.14,.07,m.wood,dir*.32,1.07,0);
    b.box(.49,1.27,.074,m.softPaper,dir*.32,1.38,0);
    for(let i=0;i<4;i++)b.box(.018,1.27,.03,m.blackWood,dir*(.1+i*.145),1.38,.05);
    for(let j=0;j<6;j++)b.box(.52,.018,.03,m.blackWood,dir*.32,.82+j*.215,.05);
    b.box(.5,.42,.04,m.lightWood,dir*.32,.33,.05);
    b.sphere(.033,m.brass,dir*.57,.94,.075);
    b.flush('Open lattice door');
  }

  moonWall(x,z,width,height,radius) {
    const {b,m}=this,shape=new THREE.Shape();
    shape.moveTo(-width/2,.45);shape.lineTo(width/2,.45);shape.lineTo(width/2,height+.45);shape.lineTo(-width/2,height+.45);shape.closePath();
    const cy=1.56,hole=new THREE.Path();hole.absarc(0,cy,radius,0,Math.PI*2,true);shape.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.21,bevelEnabled:false,curveSegments:48});b.add(g,m.plaster,[x,0,z-.1]);g.dispose();
    const ring=new THREE.TorusGeometry(radius+.022,.058,8,64);b.add(ring,m.stoneLight,[x,cy,z+.127]);ring.dispose();
    b.box(width+.1,.13,.32,m.tiles[1],x,height+.48,z);
    b.box(width,.22,.26,m.stone,x,.5,z);
    b.box(1.58,.09,.56,m.stoneLight,x,.48,z+.2,undefined,.025);
  }

  gables(cx,cz,width,depth,eave,ridge) {
    const s=new THREE.Shape();s.moveTo(-depth/2,eave);s.lineTo(0,ridge);s.lineTo(depth/2,eave);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:.16,bevelEnabled:false});
    for(const side of [-1,1])this.b.add(g,this.m.plaster,[cx+side*width/2-.08,0,cz],[0,Math.PI/2,0]);
    g.dispose();
  }

  boundaryWall(x,z,length,height,rotation) {
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;this.scene.add(group);
    const b=new GeometryBatch(group),m=this.m;
    b.box(length,height,.16,m.plaster,0,.4+height/2,0);
    b.box(length+.06,.12,.28,m.tiles[2],0,height+.43,0);
    b.box(length,.2,.2,m.stone,0,.49,0);
    for(let i=0;i<length/.19;i++)b.cylinder(.05,.05,.32,m.tiles[i%4],-length/2+i*.19,height+.5,0,[Math.PI/2,0,0],8);
    b.flush('Garden enclosure');
  }

  roof(cx,cz,width,depth,eaveY,rise) {
    const {b,m}=this,half=depth/2,cols=Math.ceil(width/.175),rows=Math.ceil(half/.27),tw=width/cols;
    const height=t=>eaveY+rise*(1-t)+.17*Math.pow(t,6);
    for(const side of [-1,1]) {
      // Curved backing is hidden by overlapping individual semicylindrical clay tiles.
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const start=row/rows,end=Math.min(1,(row+1.16)/rows),positions=[],uvs=[],indices=[];
        for(let j=0;j<=2;j++)for(let i=0;i<=6;i++){
          const t=start+(end-start)*j/2,u=i/6;
          const x=-width/2+(col+u)*tw;
          const corner=.12*Math.pow(Math.abs(x)/(width/2),12)*Math.pow(t,4);
          positions.push(cx+x,height(t)+Math.sin(u*Math.PI)*.043+corner+row*.0015,cz+side*t*half);
          uvs.push(u,(j/2)*.86+col*.137);
        }
        for(let j=0;j<2;j++)for(let i=0;i<6;i++){const a=j*7+i;side===1?indices.push(a,a+7,a+1,a+1,a+7,a+8):indices.push(a,a+1,a+7,a+1,a+8,a+7);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
        b.add(g,m.tiles[Math.floor(this.rng()*4)]);g.dispose();
      }
      b.box(width,.13,.12,m.blackWood,cx,eaveY+.12,cz+side*half);
      for(let i=0;i<cols;i++){
        const x=cx-width/2+(i+.5)*tw;
        b.cylinder(.06,.06,.09,m.tiles[i%4],x,eaveY+.17,cz+side*(half+.015),[Math.PI/2,0,0],10);
        if(i%2===0)b.box(.055,.1,half*1.03,m.wetWood,x,eaveY+rise*.43-.045,cz+side*half*.48,[side*Math.atan(rise/half),0,0]);
      }
      for(const edge of [-1,1]) {
        const points=[];for(let i=0;i<=24;i++){const t=i/24;points.push(new THREE.Vector3(cx+edge*(width/2+.015),height(t)+.06+.12*t**4,cz+side*half*t));}
        const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),30,.065,8,false);b.add(g,m.tiles[2]);g.dispose();
      }
    }
    b.box(width+.13,.13,.18,m.tiles[1],cx,eaveY+rise+.065,cz);
    b.cylinder(.105,.105,width+.18,m.tiles[2],cx,eaveY+rise+.15,cz,[0,0,Math.PI/2],12);
    for(const side of [-1,1]){
      b.box(.12,.23,.15,m.tiles[1],cx+side*(width/2-.02),eaveY+rise+.21,cz,[0,0,side*-.3]);
      b.sphere(.09,m.tiles[2],cx+side*width/2,eaveY+rise+.34,cz,[1,.65,1]);
    }
  }

  table(x,z,w=1.4,d=.7,y=.8) {
    const {b,m}=this;
    b.box(w,.085,d,m.lightWood,x,y+.66,z,undefined,.025);
    b.box(w-.12,.12,d-.09,m.wood,x,y+.55,z);
    for(const sx of [-1,1])for(const sz of [-1,1])b.box(.075,.62,.075,m.wood,x+sx*(w/2-.1),y+.31,z+sz*(d/2-.1));
    b.box(w-.19,.04,.055,m.wood,x,y+.18,z+d/2-.1);
  }
  chair(x,z,angle=0) {
    const group=new THREE.Group();group.position.set(x,.78,z);group.rotation.y=angle;this.scene.add(group);const b=new GeometryBatch(group),m=this.m;
    b.box(.42,.07,.42,m.wood,0,.43,0,undefined,.015);b.box(.34,.025,.33,m.linen,0,.48,0);
    for(const sx of [-1,1])for(const sz of [-1,1])b.box(.042,.43,.042,m.wood,sx*.17,.215,sz*.17);
    for(const sx of [-1,1])b.box(.037,.6,.04,m.wood,sx*.18,.7,-.18);
    b.box(.43,.055,.055,m.lightWood,0,1.015,-.18,undefined,.018);b.box(.095,.43,.025,m.wood,0,.77,-.18);
    b.flush('Handmade wooden chair');
  }
  vase(x,y,z,scale=1,mat=this.m.ceramic) {
    this.b.lathe([[.065,0],[.1,.035],[.115,.14],[.08,.23],[.045,.27],[.045,.35],[.055,.36]],mat,x,y,z,scale);
  }
  cup(x,y,z,scale=1) {
    this.b.lathe([[.032,0],[.039,.013],[.052,.07],[.045,.075],[.035,.02]],this.m.ceramic,x,y,z,scale);
    this.b.cylinder(.036,.036,.004,this.m.ink,x,y+.045*scale,z,undefined,16);
  }

  interiors() {
    const {b,m}=this;
    this.table(-1.02,-2.64,1.65,.86);
    this.chair(-1.03,-3.3);this.chair(-2.08,-2.63,Math.PI/2);this.chair(.07,-2.67,-Math.PI/2);
    b.box(.8,.025,.43,m.blackWood,-1.02,1.52,-2.64,undefined,.025);
    b.lathe([[.055,0],[.10,.04],[.11,.11],[.085,.17],[.05,.19]],m.blueCeramic,-1.1,1.535,-2.67);
    b.cylinder(.087,.087,.026,m.blueCeramic,-1.1,1.725,-2.67);b.sphere(.022,m.blueCeramic,-1.1,1.75,-2.67);
    b.beam([-1.02,1.59,-2.66],[-.91,1.68,-2.66],.035,m.blueCeramic);
    const handle=new THREE.TorusGeometry(.075,.012,8,18);b.add(handle,m.blueCeramic,[-1.22,1.63,-2.67],[0,Math.PI/2,0]);handle.dispose();
    this.cup(-.8,1.545,-2.46);this.cup(-1.34,1.545,-2.47);this.cup(-.84,1.545,-2.84);
    b.cylinder(.13,.09,.035,m.ceramic,-1.5,1.54,-2.77,undefined,20);
    // Study and restrained modern desk lamp / insulated mug.
    this.table(2.77,-3.7,1.9,.72);
    this.chair(2.72,-2.95,Math.PI);
    b.box(.46,.025,.34,m.softPaper,2.67,1.515,-3.65,[0,.17,0]);
    b.box(.025,.018,.25,m.ink,2.64,1.54,-3.65,[0,.5,0]);
    b.cylinder(.067,.067,.23,m.ink,3.33,1.63,-3.67);b.cylinder(.07,.07,.02,m.brass,3.33,1.76,-3.67);
    b.cylinder(.12,.12,.028,m.brass,2.13,1.52,-3.82);b.beam([2.13,1.53,-3.82],[2.13,1.95,-3.82],.016,m.brass);
    b.cylinder(.13,.2,.13,m.paper,2.13,2.01,-3.82,undefined,24);
    this.warmLight(2.14,1.96,-3.7,2.2,2.2);
    // Two shelves, pottery, irregularly arranged books and storage doors.
    for(const sx of [-3.54,3.5]){
      b.box(1.38,1.96,.09,m.wood,sx,1.77,-4.63);
      for(const side of [-1,1])b.box(.065,1.96,.42,m.wood,sx+side*.68,1.77,-4.48);
      for(let row=0;row<5;row++)b.box(1.41,.06,.45,m.lightWood,sx,.8+row*.47,-4.47);
      b.box(.055,1.9,.4,m.wood,sx+.1,1.77,-4.47);
      for(let row=0;row<4;row++)for(let j=0;j<6;j++){
        const h=.24+this.rng()*.14;
        b.box(.045+this.rng()*.027,h,.19,j%3===0?m.linen:j%3===1?m.ink:m.wood,sx-.54+j*.076,.86+row*.47+h/2,-4.39,[0,0,(this.rng()-.5)*.09]);
      }
      this.vase(sx+.39,1.32,-4.43,.65,m.blueCeramic);this.vase(sx+.36,2.26,-4.43,.92);
      b.sphere(.11,m.ceramic,sx+.35,1.88,-4.41,[1,.6,1]);
    }
    b.box(1.68,.76,.48,m.wood,.05,1.17,-4.43,undefined,.018);
    for(const x of [-.38,.46]){b.box(.76,.58,.035,m.lightWood,x,1.17,-4.17);b.sphere(.024,m.brass,x+(x<0?.22:-.22),1.19,-4.13);}
    this.vase(.45,1.57,-4.43,1.1,m.blueCeramic);
    b.beam([.45,1.9,-4.43],[.39,2.45,-4.38],.012,m.wood);
    b.beam([.41,2.16,-4.4],[.6,2.4,-4.38],.008,m.wood);
    for(let i=0;i<5;i++)b.sphere(.034,m.ceramic,.4+Math.sin(i*3)*.16,2.23+i*.045,-4.38);
    // A bamboo ink scroll, mounted on woven silk, with timber rollers.
    b.box(.77,1.37,.035,m.linen,-.15,2.37,-4.69);
    const art=new THREE.PlaneGeometry(.64,1.23);b.add(art,m.painting,[-.15,2.37,-4.66]);art.dispose();
    for(const y of [1.68,3.06])b.cylinder(.027,.027,.87,m.wood,-.15,y,-4.65,[0,0,Math.PI/2]);
    // Folding screen in the shadowed west end.
    for(let i=0;i<3;i++){
      const x=-3.79+i*.48,z=-3.12+(i%2)*.16;
      b.box(.48,1.65,.045,m.wood,x,1.63,z,[0,(i%2?1:-1)*.32,0]);
      b.box(.39,1.45,.05,m.linen,x,1.65,z,[0,(i%2?1:-1)*.32,0]);
    }
    for(let i=0;i<2;i++)b.cylinder(.26,.28,.075,m.linen,-3.69+i*.67,.82,-1.98,undefined,24);
    b.box(.1,.13,.025,m.ceramic,4.23,.96,-4.3,[0,-Math.PI/2,0]);
  }

  lantern(x,y,z,r) {
    const pivot=new THREE.Group();pivot.position.set(x,y+.3,z);this.scene.add(pivot);const b=new GeometryBatch(pivot),m=this.m;
    b.beam([0,.05,0],[0,-.19,0],.009,m.brass);
    b.sphere(r,m.paper,0,-.38,0,[.86,1.22,.86]);
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6,points=[];
      for(let j=0;j<=12;j++){const t=j/12*Math.PI;points.push(new THREE.Vector3(Math.cos(angle)*Math.sin(t)*r*.87,-.38+Math.cos(t)*r*1.24,Math.sin(angle)*Math.sin(t)*r*.87));}
      const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.004,4,false);b.add(g,m.wood);g.dispose();
    }
    for(const yy of [-.38-r*1.18,-.38+r*1.18])b.cylinder(r*.34,r*.34,.035,m.wood,0,yy,0);
    b.beam([0,-.38-r*1.19,0],[0,-.38-r*1.19-.11,0],.007,m.wood);
    b.flush('Silk lantern');
    const light=new THREE.PointLight(0xffc381,5,4.4,2);light.position.set(0,-.39,.08);pivot.add(light);
    light.userData.xrCore=Math.abs(x)<.5;
    this.lanterns.push({pivot,phase:this.rng()*8});this.lights.push({light,base:5,phase:this.rng()*8});
  }
  warmLight(x,y,z,intensity,distance) {
    const light=new THREE.PointLight(0xffc28a,intensity,distance,2);light.position.set(x,y,z);light.userData.xrCore=intensity>=25;this.scene.add(light);this.lights.push({light,base:intensity,phase:this.rng()*8});return light;
  }
}

/* Real mesh-based WebGL view sharing the original game simulation. */
window.Claw3D = class {
  constructor(physics) {
    const T = THREE;
    this.physics = physics;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#ece5fc');
    this.camera = new T.PerspectiveCamera(43, 1.25, 1, 3000);
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.domElement.id = 'scene-3d';
    physics.canvas.after(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x8c6bb3, 2));
    const light = new T.DirectionalLight(0xfff4dd, 3);
    light.position.set(120, 550, 300); light.castShadow = true;
    light.shadow.camera.left = -400; light.shadow.camera.right = 400;
    light.shadow.camera.top = 500; light.shadow.camera.bottom = -400;
    light.shadow.mapSize.set(1024, 1024); this.scene.add(light);
    this.material = color => new T.MeshStandardMaterial({ color, roughness: .65 });
    this.metal = new T.MeshStandardMaterial({ color: 0xc9d7e5, metalness: .85, roughness: .24 });
    this.box = (x,y,z,w,h,d,color,parent=this.scene) => {
      const m = new T.Mesh(new T.BoxGeometry(w,h,d), typeof color === 'object' ? color : this.material(color));
      m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    this.ball = (parent,x,y,z,r,color,sx=1,sy=1,sz=1) => {
      const m = new T.Mesh(new T.SphereGeometry(r,20,14),this.material(color));
      m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow=true; parent.add(m); return m;
    };
    // Floor cells leave an actual open chute in the front left corner.
    for(let x=0;x<12;x++) for(let z=0;z<8;z++) {
      if(x>=1 && x<=2 && z>=6) continue;
      this.box(-275+x*50,-5,-175+z*50,50,10,50,(x+z)%2 ? '#d8b78c':'#ddc39e');
    }
    this.box(0,200,-205,600,400,10,'#eae6ec');
    // Retail-style backboard, stainless rails and warm interior strip lighting.
    const board=document.createElement('canvas');board.width=1024;board.height=512;
    const bc=board.getContext('2d');bc.fillStyle='#fff7dd';bc.fillRect(0,0,1024,512);
    bc.strokeStyle='#eab244';bc.lineWidth=16;bc.strokeRect(16,16,992,480);
    bc.textAlign='center';bc.fillStyle='#d64b32';bc.font='900 90px sans-serif';bc.fillText('親愛的顧客請注意',512,150);
    bc.fillStyle='#68544b';bc.font='bold 42px sans-serif';bc.fillText('娃娃・景品・生活小物 混合台',512,245);
    bc.font='bold 36px sans-serif';bc.fillText('夾出集券  ↑ 機頂限定品可夾換',512,325);
    bc.fillStyle='#b87526';bc.font='28px sans-serif';bc.fillText('挑邊緣・移開支撐・試試連鎖滑落',512,415);
    const sign=new T.Mesh(new T.PlaneGeometry(420,160),new T.MeshBasicMaterial({map:new T.CanvasTexture(board)}));
    sign.position.set(0,260,-198);this.scene.add(sign);this.modeSign=sign;
    for(const x of [-280,280])this.box(x,205,-192,8,320,8,new T.MeshBasicMaterial({color:0xfff1bb}));
    this.roof = this.box(0,394,0,580,6,380,'#f7f6ef');
    this.box(-300,200,0,10,400,410,'#d5d8dc');
    this.box(300,200,0,10,400,410,'#d5d8dc');
    this.box(-185,-45,165,110,80,80,'#242337');
    this.box(-128,22,155,8,45,100,new T.MeshStandardMaterial({color:0x8bcfea,transparent:true,opacity:.35}));
    this.box(0,370,-120,580,8,10,this.metal);
    this.box(0,370,120,580,8,10,this.metal);
    this.carriage = this.box(0,350,0,60,24,45,this.metal);
    this.cable = new T.Mesh(new T.CylinderGeometry(2,2,1,12),this.metal); this.scene.add(this.cable);
    this.claw = new T.Group(); this.claw.scale.setScalar(1.4); this.scene.add(this.claw);
    const red=new T.MeshStandardMaterial({color:0x881e37,metalness:.72,roughness:.3});
    const cylinder=(radius,height,y,mat)=>{const m=new T.Mesh(new T.CylinderGeometry(radius,radius,height,24),mat);m.position.y=y;this.claw.add(m);return m;};
    cylinder(15,42,20,this.metal);cylinder(17,7,38,red);cylinder(17,7,10,red);
    cylinder(13,14,26,new T.MeshStandardMaterial({color:0x252735,metalness:.6,roughness:.28}));
    cylinder(8,22,-10,this.metal);cylinder(12,5,-20,red);
    this.fingers=[];
    for(let i=0;i<3;i++) {
      const pivot=new T.Group();pivot.rotation.y=i*Math.PI*2/3;this.claw.add(pivot);
      const joint=new T.Group();pivot.add(joint);this.fingers.push(joint);
      const curve=new T.CatmullRomCurve3([new T.Vector3(12,0,0),new T.Vector3(28,-9,0),new T.Vector3(37,-24,0),new T.Vector3(34,-42,0),new T.Vector3(23,-52,0)]);
      const finger=new T.Mesh(new T.TubeGeometry(curve,20,2.5,8,false),this.metal);joint.add(finger);finger.castShadow=true;
      this.box(26,-46,0,6,15,7,this.material('#bbbbc1'),joint);
    }
    const coilPoints=[];
    for(let i=0;i<=380;i++){const t=i/380,angle=t*Math.PI*2*23;coilPoints.push(new T.Vector3(-24+Math.cos(angle)*5,48-t*80,Math.sin(angle)*5+5));}
    this.claw.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(coilPoints),380,2,6,false),this.material('#202028')));
    this.target = new T.Mesh(new T.RingGeometry(48,50,48),new T.MeshBasicMaterial({color:0xff4d82,side:T.DoubleSide}));
    this.target.rotation.x=-Math.PI/2; this.target.position.y=1; this.scene.add(this.target);
    this.models = new Map(); this.setView('front');
    const controls=document.createElement('div'); controls.className='view-controls';
    controls.innerHTML='<span>✦ REAL 3D</span><button data-view="front" class="active">正面</button><button data-view="side">側面</button><button data-view="top">俯視</button>';
    physics.canvas.parentElement.append(controls);
    controls.addEventListener('click',e=>{if(!e.target.dataset.view)return; this.setView(e.target.dataset.view); controls.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===e.target));});
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(physics.canvas.parentElement);
    this.resize(); physics.canvas.style.display='none';
  }
  setMachineMode(key) {
    const config=MACHINE_MODES[key],canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const c=canvas.getContext('2d');c.fillStyle=key==='tech'?'#e7edf4':key==='figure'?'#f3e9f5':'#fff7dd';c.fillRect(0,0,1024,512);
    c.strokeStyle='#c4a24f';c.lineWidth=14;c.strokeRect(12,12,1000,488);c.textAlign='center';c.fillStyle='#8c3d36';c.font='900 100px sans-serif';c.fillText(config.name,512,160);
    c.fillStyle='#494b55';c.font='bold 34px sans-serif';c.fillText(config.description.slice(0,19),512,270);c.fillText(config.description.slice(19),512,325);
    c.font='28px sans-serif';c.fillText('投幣 10 元・夾出集券・機頂夾換',512,420);
    this.modeSign.material.map.dispose();this.modeSign.material.map=new THREE.CanvasTexture(canvas);this.modeSign.material.needsUpdate=true;
  }
  setView(view) {
    const positions={front:[0,200,940],side:[720,330,530],top:[0,950,0]};
    if (!positions[view]) return;
    this.roof.visible = view !== 'top';
    // A vertical camera needs an explicit up axis; rear stays at the top of the image.
    this.camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
    this.camera.position.set(...positions[view]);
    this.camera.lookAt(0,view === 'front' ? 200 : view === 'top' ? 0 : 175,0);
  }
  resize() {
    const rect=this.physics.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(rect.width,rect.height,false); this.camera.aspect=rect.width/rect.height; this.camera.updateProjectionMatrix();
  }
  createPrize(doll) {
    const T=THREE,g=new T.Group(),id=doll.type.id;
    if(doll.type.cat==='snack') {
      const cfg=doll.type.package;
      const art=document.createElement('canvas');art.width=256;art.height=256;
      const c=art.getContext('2d');c.fillStyle=cfg.color;c.fillRect(0,0,256,256);c.translate(128,128);c.scale(3.5,3.5);doll.type.draw(c,25);
      const face=new T.MeshStandardMaterial({map:new T.CanvasTexture(art),roughness:.4});
      const side=this.material(cfg.color);
      const mesh=new T.Mesh(new T.SphereGeometry(1,16,12),side);mesh.scale.set(25,32,13);g.add(mesh);mesh.castShadow=true;
      const front=new T.Mesh(new T.PlaneGeometry(42,56),face);front.position.z=12;g.add(front);
      for(const y of [-30,30])this.box(0,y,0,46,4,17,side,g);
    } else if(doll.type.cat==='capsule') {
      this.ball(g,0,0,0,25,'#bc8ce5');this.ball(g,0,10,1,21,'#e8ddff',1,.6,1);
    } else if(doll.type.cat==='pillow') {
      this.ball(g,0,0,0,29,id==='watermelon'?'#7bad61':'#e9c795',1.15,.9,.55);
      const art=document.createElement('canvas');art.width=256;art.height=256;const c=art.getContext('2d');c.translate(128,128);c.scale(3,3);doll.type.draw(c,30);
      const decal=new T.Mesh(new T.PlaneGeometry(65,65),new T.MeshStandardMaterial({map:new T.CanvasTexture(art),transparent:true,roughness:1}));decal.position.z=18;g.add(decal);
    } else if(doll.type.cat!=='plush') {
      const palette=['#243b61','#db7b8f','#72ada6','#c3a775','#79628b'];const color=palette[id.length%palette.length];
      const art=document.createElement('canvas');art.width=256;art.height=384;const c=art.getContext('2d');
      c.fillStyle=color;c.fillRect(0,0,256,384);c.fillStyle='#faf6ef';c.fillRect(15,62,226,252);
      c.save();c.translate(128,180);c.scale(2.7,2.7);doll.type.draw(c,doll.type.radius);c.restore();
      c.fillStyle='#fff';c.font='bold 19px sans-serif';c.textAlign='center';c.fillText(doll.type.name,128,38);c.font='12px sans-serif';c.fillText('COLLECTION  /  PREMIUM PRIZE',128,344);
      for(let i=0;i<38;i++){c.fillStyle=i%3?'#222':'#f6f3ea';c.fillRect(154+i*2,357,2,16);}
      const texture=new T.CanvasTexture(art);texture.colorSpace=T.SRGBColorSpace;
      const face=new T.MeshStandardMaterial({map:texture,roughness:.46});const side=this.material(color);
      const tall=id.includes('hero')||id.includes('qposket');const wide=id.includes('top')||id.includes('mecha');
      const width=wide?65:42,height=tall?82:wide?43:61,depth=wide?35:40;
      const mesh=new T.Mesh(new T.BoxGeometry(width,height,depth),[side,side,side,side,face,face]);g.add(mesh);mesh.castShadow=true;
      this.box(0,height/2,0,width+1,1,depth+1,this.material('#d5d1c8'),g);
      // Irregular glossy wrapping strips rather than a flat pastel box.
      const film=new T.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:.13,roughness:.12,metalness:.1,depthWrite:false});
      const wrap=new T.Mesh(new T.BoxGeometry(width+1,height+1,depth+1),film);g.add(wrap);
      for(let i=0;i<4;i++){const crease=this.box(0,-height*.3+i*height*.2,depth/2+1,width,.65,.4,new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.27}),g);crease.rotation.z=.08*(i%2?1:-1);}
    } else {
      const colors={bear:'#bd8055',bunny:'#ffdae9',capybara:'#b78c62',shiba:'#e5a24e',cat:'#fff1d0',penguin:'#6882ab',dino:'#80c99f',duck:'#ffda63'};
      const color=colors[id]||'#b7a0ed';
      const fur=document.createElement('canvas');fur.width=128;fur.height=128;const fc=fur.getContext('2d');fc.fillStyle=color;fc.fillRect(0,0,128,128);
      for(let i=0;i<2200;i++){fc.strokeStyle=i%2?'#ffffff30':'#32231520';const x=Math.random()*128,y=Math.random()*128;fc.beginPath();fc.moveTo(x,y);fc.lineTo(x+1,y+3);fc.stroke();}
      const furTexture=new T.CanvasTexture(fur);furTexture.wrapS=furTexture.wrapT=T.RepeatWrapping;furTexture.repeat.set(3,3);
      g.userData.furTexture=furTexture;
      this.ball(g,0,-9,0,23,color,1,1.1,.8);this.ball(g,0,15,0,25,color,1,1,.85);
      for(const sign of [-1,1]) {
        this.ball(g,sign*17,34,0,id==='bunny'?9:8,color,1,id==='bunny'?2.3:1,.65);
        this.ball(g,sign*20,-8,0,9,color);this.ball(g,sign*12,-27,9,10,color);
        this.ball(g,sign*9,19,20,3,'#30293c');
      }
      this.ball(g,0,8,20,10,id==='duck'?'#ed9446':'#fff0df',1,.65,.4);
      this.ball(g,0,11,25,3,'#4e3643');
      if(id==='capybara')this.ball(g,0,43,0,8,'#ffa52d');
      if(id==='bear'){for(const side of [-1,1])this.ball(g,side*18,34,0,11,color,1.6,.8,.55);for(let i=0;i<12;i++){const t=i*Math.PI/6;this.ball(g,Math.cos(t)*24,-3,Math.sin(t)*17,7,'#f6efe4');}}
      if(id==='cat'){for(const side of [-1,1]){const ear=new T.Mesh(new T.ConeGeometry(11,22,3),this.material(color));ear.position.set(side*17,38,0);g.add(ear);this.ball(g,side*15,8,20,5,'#e9a6b0',1,.6,.3);}}
      if(id==='duck'){g.scale.y=.85;for(const side of [-1,1])this.ball(g,side*10,-27,10,10,'#f1a645',1.3,.45,1.2);}
      if(id==='penguin')this.ball(g,0,-8,17,18,'#f8f3e6',.85,1.15,.2);
      if(id==='bunny'){for(const side of [-1,1])this.ball(g,side*17,39,5,6,'#e9a0b8',1,2,.4);}
      g.traverse(m=>{if(m.isMesh&&m.material.color?.getHexString()===new T.Color(color).getHexString()){m.material.map=furTexture;m.material.roughness=1;}});
      const tag=this.box(25,-13,-5,13,20,.5,this.material('#fff9e9'),g);tag.rotation.z=-.3;

    }
    g.scale.multiplyScalar(doll.radius/30);this.scene.add(g);return g;
  }
  render() {
    const p=this.physics, live=new Set(p.dolls);
    for(const [d,g] of this.models) if(!live.has(d)) {this.scene.remove(g);g.traverse(m=>{if(m.isMesh){m.geometry.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(mat=>{if(mat.map)mat.map.dispose();mat.dispose();});}});this.models.delete(d);}
    for(const d of p.dolls) {
      if(!this.models.has(d))this.models.set(d,this.createPrize(d));
      const g=this.models.get(d);g.position.set(d.x-300,410-d.y,(d.depth-.65)*500);g.rotation.z=-d.rotation;g.rotation.y=Math.sin(d.x*.1)*.2;
    }
    const z=(p.gantry.depth-.65)*500,cy=410-p.claw.y;
    this.carriage.position.set(p.gantry.x-300,350,z);
    this.claw.position.set(p.claw.x-300,cy,z);this.claw.rotation.z=-p.claw.angle;
    const start=new THREE.Vector3(p.gantry.x-300,350,z),end=this.claw.position;
    this.cable.position.copy(start).add(end).multiplyScalar(.5);this.cable.scale.y=start.distanceTo(end);
    this.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
    this.fingers.forEach(f=>f.rotation.z=(p.claw.openRatio-.65)*.65);
    this.target.position.set(p.claw.x-300,1,z);
    this.renderer.render(this.scene,this.camera);
  }
};

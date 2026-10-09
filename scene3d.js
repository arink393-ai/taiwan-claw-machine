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
      this.box(-275+x*50,-5,-175+z*50,50,10,50,(x+z)%2 ? '#c1b1df':'#f8f0ff');
    }
    this.box(0,200,-205,600,400,10,'#eae6ec');
    // Retail-style backboard, stainless rails and warm interior strip lighting.
    const board=document.createElement('canvas');board.width=1024;board.height=512;
    const bc=board.getContext('2d');bc.fillStyle='#fff7dd';bc.fillRect(0,0,1024,512);
    bc.strokeStyle='#eab244';bc.lineWidth=16;bc.strokeRect(16,16,992,480);
    bc.textAlign='center';bc.fillStyle='#d64b32';bc.font='900 90px sans-serif';bc.fillText('滿滿山崩台',512,150);
    bc.fillStyle='#68544b';bc.font='bold 42px sans-serif';bc.fillText('零食・娃娃・景品  混合大放送',512,245);
    bc.font='bold 36px sans-serif';bc.fillText('夾出集券  ↑ 機頂限定品可夾換',512,325);
    bc.fillStyle='#b87526';bc.font='28px sans-serif';bc.fillText('挑邊緣・移開支撐・試試連鎖滑落',512,415);
    const sign=new T.Mesh(new T.PlaneGeometry(420,160),new T.MeshBasicMaterial({map:new T.CanvasTexture(board)}));
    sign.position.set(0,260,-198);this.scene.add(sign);
    for(const x of [-280,280])this.box(x,205,-192,8,320,8,new T.MeshBasicMaterial({color:0xfff1bb}));
    this.box(0,394,0,580,6,380,'#f7f6ef');
    this.box(-300,200,0,10,400,410,'#e1d5f4');
    this.box(300,200,0,10,400,410,'#e1d5f4');
    this.box(-185,-45,165,110,80,80,'#242337');
    this.box(-128,22,155,8,45,100,new T.MeshStandardMaterial({color:0x8bcfea,transparent:true,opacity:.35}));
    this.box(0,370,-120,580,8,10,this.metal);
    this.box(0,370,120,580,8,10,this.metal);
    this.carriage = this.box(0,350,0,60,24,45,this.metal);
    this.cable = new T.Mesh(new T.CylinderGeometry(2,2,1,12),this.metal); this.scene.add(this.cable);
    this.claw = new T.Group(); this.scene.add(this.claw);
    this.ball(this.claw,0,8,0,15,'#d0d9e2',1,.7,1);
    this.fingers=[];
    for(let i=0;i<3;i++) {
      const pivot = new T.Group(); pivot.rotation.y=i*Math.PI*2/3;
      const joint = new T.Group(); pivot.add(joint); this.claw.add(pivot);
      this.box(12,-16,0,7,38,7,this.metal,joint);
      const tip=this.box(5,-35,0,7,22,7,this.metal,joint); tip.rotation.z=-.65;
      this.fingers.push(joint);
    }
    this.target = new T.Mesh(new T.RingGeometry(20,23,48),new T.MeshBasicMaterial({color:0xff4d82,side:T.DoubleSide}));
    this.target.rotation.x=-Math.PI/2; this.target.position.y=1; this.scene.add(this.target);
    this.models = new Map(); this.setView('front');
    const controls=document.createElement('div'); controls.className='view-controls';
    controls.innerHTML='<span>✦ REAL 3D</span><button data-view="front" class="active">正面</button><button data-view="side">側面</button><button data-view="top">俯視</button>';
    physics.canvas.parentElement.append(controls);
    controls.addEventListener('click',e=>{if(!e.target.dataset.view)return; this.setView(e.target.dataset.view); controls.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===e.target));});
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(physics.canvas.parentElement);
    this.resize(); physics.canvas.style.display='none';
  }
  setView(view) {
    const positions={front:[0,200,940],side:[720,330,530],top:[0,950,220]};
    this.camera.position.set(...positions[view]); this.camera.lookAt(0,view === 'front' ? 200 : 175,0);
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
    } else if(doll.type.cat!=='plush') {
      const art=document.createElement('canvas'); art.width=256; art.height=256;
      const ctx=art.getContext('2d'); ctx.fillStyle='#fff4dc';ctx.fillRect(0,0,256,256);ctx.translate(128,128);ctx.scale(2.5,2.5); doll.type.draw(ctx,doll.type.radius);
      const face=new T.MeshStandardMaterial({map:new T.CanvasTexture(art),roughness:.6});
      const side=this.material('#c5a6ed'); const mesh=new T.Mesh(new T.BoxGeometry(46,58,40),[side,side,side,side,face,side]); g.add(mesh);mesh.castShadow=true;
    } else {
      const colors={bear:'#bd8055',bunny:'#ffdae9',capybara:'#b78c62',shiba:'#e5a24e',cat:'#fff1d0',penguin:'#6882ab',dino:'#80c99f',duck:'#ffda63'};
      const color=colors[id]||'#b7a0ed';
      this.ball(g,0,-9,0,23,color,1,1.1,.8);this.ball(g,0,15,0,25,color,1,1,.85);
      for(const sign of [-1,1]) {
        this.ball(g,sign*17,34,0,id==='bunny'?9:8,color,1,id==='bunny'?2.3:1,.65);
        this.ball(g,sign*20,-8,0,9,color);this.ball(g,sign*12,-27,9,10,color);
        this.ball(g,sign*9,19,20,3,'#30293c');
      }
      this.ball(g,0,8,20,10,id==='duck'?'#ed9446':'#fff0df',1,.65,.4);
      this.ball(g,0,11,25,3,'#4e3643');
      if(id==='capybara')this.ball(g,0,43,0,8,'#ffa52d');
    }
    g.scale.setScalar(doll.radius/30);this.scene.add(g);return g;
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
    this.fingers.forEach(f=>f.rotation.z=p.claw.openRatio*.85);
    this.target.position.set(p.claw.x-300,1,z);
    this.renderer.render(this.scene,this.camera);
  }
};

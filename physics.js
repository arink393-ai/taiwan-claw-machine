/**
 * 台灣飛絡力夾娃娃機 物理與渲染引擎 (Physics & Render Engine)
 * - 天車雙軸運動 (X + 景深 Depth)，景深會影響大小、位置與能否夾到
 * - 鋼索擺盪單擺物理 (甩爪效應 Swing Physics)
 * - 爪子三爪開合與二停控制
 * - 娃娃堆疊、碰撞反彈與抓取判定
 * - 壓克力洞口擋板與出貨判定
 * - 立體可愛畫面：透視房間、棋盤地板、地面陰影、金屬爪、彩帶粒子
 *
 * 獎品種類與繪圖在 prizes.js
 */

class ClawPhysics {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // 櫥窗機台邊界 (世界座標)
    this.bounds = {
      minX: 55,
      maxX: this.width - 55,
      minY: 60,
      maxY: this.height - 70, // 底部平台
      depthMin: 0.3,
      depthMax: 1.0
    };

    // 透視房間：背牆矩形 (其餘為四面往外展開)
    this.room = { bx0: 52, bx1: this.width - 52, by0: 46, by1: 392 };

    // 洞口設定 (左前方)
    this.chute = {
      x: 60,
      y: this.height - 130,
      width: 110,
      height: 90,
      baffleHeight: 45
    };

    // 天車位置 (Gantry)
    this.gantry = {
      x: this.chute.x + this.chute.width / 2,
      y: 65,
      depth: 0.9, // 0 = 靠後牆, 1 = 靠前玻璃
      speed: 160
    };

    // 爪子能碰到的景深範圍 (±)
    this.depthTolerance = 0.35;

    // 鋼索與爪子
    this.claw = {
      x: this.gantry.x,
      y: this.gantry.y + 70,
      cableLength: 70,
      maxCableLength: this.height - 160,
      descendSpeed: 230,
      ascendSpeed: 180,
      angle: 0,
      angleVel: 0,
      dampening: 0.985,
      openRatio: 0.8,
      holdingPrize: null,
      dropAttemptDone: false
    };

    this.dolls = [];

    // 機台設定值 (台主模式)
    this.settings = {
      clawPower: 0.75,
      dropPower: 0.35,
      baffleHeight: 45,
      isGuaranteed: false
    };

    this.fallingWins = [];
    this.particles = [];
    this.time = 0;
    this.lastDt = 0.016;

    this.backdrop = this.buildBackdrop();
    this.initDolls();
  }

  // ------------------------------------------------------------------
  // 景深輔助
  // ------------------------------------------------------------------
  depthScale(d) { return 0.84 + 0.16 * d; }
  depthYOffset(d) { return -(1 - d) * 16; }

  isInReach(doll) {
    return Math.abs(doll.depth - this.gantry.depth) <= this.depthTolerance;
  }

  // ------------------------------------------------------------------
  // 補貨
  // ------------------------------------------------------------------
  initDolls() {
    this.dolls = [];
    // 補貨後的 3 秒內，擋板視為無限高：讓山堆先落定，不會一開局就自己滾進洞口
    this.settleTimer = 3;
    // 山堆剛鋪好、尚在垮落的幾秒內，掉進洞口的娃娃視為「滑出堆外」，放回山上而不算出貨
    this.graceTimer = 7;
    const startX = this.chute.x + this.chute.width + 10;
    const endX = this.bounds.maxX - 20;

    const layers = [
      { y: this.height - 75, from: startX, to: endX, step: 50, jitter: 10 },
      { y: this.height - 110, from: startX - 20, to: endX - 30, step: 46, jitter: 12 },
      { y: this.height - 145, from: startX - 35, to: endX - 50, step: 56, jitter: 0 }
    ];

    // 不能鋪到洞口上方，否則一開局就有娃娃自己掉進洞口
    const minX = startX + 30;

    for (const L of layers) {
      for (let x = Math.max(L.from, minX); x <= L.to; x += L.step) {
        const jx = L.jitter ? Math.random() * L.jitter - L.jitter / 2 : 0;
        this.dolls.push(this.createDoll(pickPrizeType(), x + jx, L.y, 0.55 + Math.random() * 0.45));
      }
    }
  }

  createDoll(type, x, y, depth) {
    return {
      type,
      x,
      y,
      depth: depth || 0.7,
      vx: (Math.random() - 0.5) * 5,
      vy: 0,
      radius: type.radius,
      rotation: (Math.random() - 0.5) * 0.4,
      rotVel: 0,
      isGrasped: false,
      settled: false
    };
  }

  // ------------------------------------------------------------------
  // 更新循環
  // ------------------------------------------------------------------
  update(dt, input, state) {
    this.time += dt;
    this.lastDt = dt;
    if (this.settleTimer > 0) this.settleTimer -= dt;
    if (this.graceTimer > 0) this.graceTimer -= dt;

    let isMoving = false;
    if (state === 'PLAYING') {
      let dx = 0;
      let dDepth = 0;

      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.up) dDepth -= 1; // 往後
      if (input.down) dDepth += 1; // 往前

      if (Math.abs(input.joyX) > 0.1) dx = input.joyX;
      if (Math.abs(input.joyY) > 0.1) dDepth = input.joyY;

      if (dx !== 0 || dDepth !== 0) {
        isMoving = true;
        this.gantry.x += dx * this.gantry.speed * dt;
        this.gantry.depth += dDepth * (this.gantry.speed / 450) * dt;

        this.gantry.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.gantry.x));
        this.gantry.depth = Math.max(this.bounds.depthMin, Math.min(this.bounds.depthMax, this.gantry.depth));

        // 擺盪慣性加速 (甩爪核心機制)
        this.claw.angleVel += (-dx * 8.5 * dt * 0.65);
      }
    }

    // 單擺模型
    const g = 650;
    const effLen = Math.max(50, this.claw.cableLength);
    this.claw.angleVel += (-g / effLen) * Math.sin(this.claw.angle) * dt;
    this.claw.angleVel *= this.claw.dampening;
    this.claw.angle += this.claw.angleVel * dt;
    this.claw.angle = Math.max(-0.95, Math.min(0.95, this.claw.angle));

    this.claw.x = this.gantry.x + Math.sin(this.claw.angle) * this.claw.cableLength;
    this.claw.y = this.gantry.y + Math.cos(this.claw.angle) * this.claw.cableLength;

    this.updateDolls(dt);
    this.updateParticles(dt);

    return isMoving;
  }

  updateDolls(dt) {
    const gravity = 520;
    const floorY = this.bounds.maxY;

    if (this.claw.holdingPrize) {
      const p = this.claw.holdingPrize;
      p.x = this.claw.x;
      p.y = this.claw.y + p.radius * 0.6;
      p.vx = (this.claw.angleVel * this.claw.cableLength) * 0.2;
      p.vy = 0;
      p.depth = this.gantry.depth;
      p.rotation += this.claw.angleVel * dt * 0.5;
    }

    for (let i = 0; i < this.dolls.length; i++) {
      const doll = this.dolls[i];
      if (doll.isGrasped) continue;

      doll.vy += gravity * dt;
      doll.x += doll.vx * dt;
      doll.y += doll.vy * dt;
      doll.rotation += doll.rotVel * dt;

      doll.vx *= 0.95;
      doll.rotVel *= 0.92;

      if (doll.y + doll.radius > floorY) {
        doll.y = floorY - doll.radius;
        doll.vy = -doll.vy * 0.25;
        if (Math.abs(doll.vy) < 15) doll.vy = 0;
      }

      if (doll.x + doll.radius > this.bounds.maxX) {
        doll.x = this.bounds.maxX - doll.radius;
        doll.vx = -doll.vx * 0.4;
      }

      // 洞口擋板碰撞
      const baffleX = this.chute.x + this.chute.width;
      const baffleTopY = floorY - this.settings.baffleHeight;

      // 落定期間在擋板外留一段緩衝帶，山堆才不會一鬆手就整片滑進洞口
      if (this.settleTimer > 0 && doll.x - doll.radius < baffleX + 45) {
        doll.x = baffleX + 45 + doll.radius;
        doll.vx = Math.abs(doll.vx) * 0.4;
      }

      if (doll.x - doll.radius < baffleX && doll.x + doll.radius > baffleX) {
        if (doll.y + doll.radius > baffleTopY) {
          if (doll.x > baffleX) {
            doll.x = baffleX + doll.radius;
            doll.vx = Math.abs(doll.vx) * 0.4;
          } else {
            doll.x = baffleX - doll.radius;
            doll.vx = -Math.abs(doll.vx) * 0.4;
          }
        }
      }

      // 洞口判定
      if (doll.x > this.chute.x && doll.x < baffleX && doll.y > baffleTopY + 10) {
        if (this.graceTimer > 0) {
          doll.x = baffleX + 80 + Math.random() * 60;
          doll.y = floorY - 160;
          doll.vx = 0;
          doll.vy = 0;
          continue;
        }
        this.triggerWin(doll, i);
        i--;
        continue;
      }

      // 娃娃之間的彈性擠壓
      for (let j = i + 1; j < this.dolls.length; j++) {
        const other = this.dolls[j];
        if (other.isGrasped) continue;

        const dx = other.x - doll.x;
        const dy = other.y - doll.y;
        const dist = Math.hypot(dx, dy);
        const minDist = doll.radius + other.radius;

        if (dist < minDist && dist > 0.001) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          doll.x -= nx * overlap * 0.5;
          doll.y -= ny * overlap * 0.5;
          other.x += nx * overlap * 0.5;
          other.y += ny * overlap * 0.5;

          const relativeV = (doll.vx - other.vx) * nx + (doll.vy - other.vy) * ny;
          if (relativeV > 0) {
            const impulse = relativeV * 0.5;
            doll.vx -= nx * impulse;
            doll.vy -= ny * impulse;
            other.vx += nx * impulse;
            other.vy += ny * impulse;
          }
        }
      }
    }
  }

  triggerWin(doll, index) {
    this.dolls.splice(index, 1);
    doll.vy = 280;
    this.fallingWins.push(doll);

    this.burst(this.chute.x + this.chute.width / 2, this.chute.y + 20, 46);

    if (this.onPrizeWon) {
      this.onPrizeWon(doll.type);
    }
  }

  // 爪尖夾取點：爪子中心往下約 22px，視覺上就是三個爪尖圍起來的位置
  grabPoint() {
    return { x: this.claw.x, y: this.claw.y + 22 };
  }

  // 爪子是否已碰到(插進)娃娃的上緣：下爪時用來判斷「到底」
  touchesDoll(doll) {
    if (!this.isInReach(doll)) return false;
    const g = this.grabPoint();
    return Math.hypot(g.x - doll.x, g.y - doll.y) < doll.radius * 0.95;
  }

  // 抓取檢測 (只能抓到景深範圍內的娃娃)
  attemptGrab() {
    const gp = this.grabPoint();
    let closestDoll = null;
    let minDist = 9999;

    for (const doll of this.dolls) {
      if (!this.isInReach(doll)) continue;
      const dist = Math.hypot(gp.x - doll.x, gp.y - doll.y);
      if (dist < doll.type.catchRadius && dist < minDist) {
        minDist = dist;
        closestDoll = doll;
      }
    }

    if (closestDoll) {
      const basePower = this.settings.isGuaranteed ? 1.0 : this.settings.clawPower;
      const successChance = Math.max(0.2, (basePower * 1.2) - (closestDoll.type.catchDifficulty * 0.35));

      if (Math.random() <= successChance || this.settings.isGuaranteed) {
        this.claw.holdingPrize = closestDoll;
        closestDoll.isGrasped = true;
        return true;
      }
    }
    return false;
  }

  // 二段放爪檢測
  checkDropPowerRelease() {
    if (this.settings.isGuaranteed || !this.claw.holdingPrize) return;
    if (this.claw.dropAttemptDone) return;
    this.claw.dropAttemptDone = true;

    const dropChance = 1.0 - (this.settings.dropPower * 1.1);
    if (Math.random() < dropChance) {
      const dropped = this.claw.holdingPrize;
      dropped.isGrasped = false;
      dropped.vy = 40;
      dropped.vx = (Math.random() - 0.5) * 80;
      this.claw.holdingPrize = null;
      if (window.clawAudio) window.clawAudio.playClawSnap();
    }
  }

  // ------------------------------------------------------------------
  // 粒子 (彩帶 / 星星)
  // ------------------------------------------------------------------
  burst(x, y, n = 40) {
    const colors = ['#ff6fa5', '#ffd54a', '#6bd6ff', '#9b7bff', '#7be0a8', '#ff9a3d'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 120 + Math.random() * 260;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        ttl: 1.0 + Math.random() * 0.9,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        star: Math.random() < 0.3
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.vy += 420 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.life > p.ttl) this.particles.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.drawImage(this.backdrop, 0, 0, this.width, this.height);
    this.renderAmbient(ctx);
    this.renderChute(ctx);
    this.renderShadows(ctx);

    // 遠的先畫，近的後畫
    const sorted = [...this.dolls].sort((a, b) => (a.depth - b.depth) || (a.y - b.y));
    for (const doll of sorted) this.renderDoll(ctx, doll);

    this.renderGantry(ctx);
    this.renderClaw(ctx);
    this.renderFallingWins(ctx);
    this.renderParticles(ctx);
    this.renderDepthGauge(ctx);
  }

  // 靜態背景只畫一次：透視房間 + 棋盤地板
  buildBackdrop() {
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const g = c.getContext('2d');
    const W = this.width, H = this.height;
    const { bx0, bx1, by0, by1 } = this.room;
    const A = window.PrizeArt;

    // 背牆
    g.fillStyle = A.lg(g, 0, by0, 0, by1, ['#fff4fa', '#ffe3f1', '#e9dcff']);
    g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // 波點
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 12; i++) {
        const px = bx0 + 22 + i * 42 + (j % 2) * 21;
        const py = by0 + 40 + j * 40;
        g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
      }
    }
    // 愛心與星星點綴
    const deco = [[0.1, 0.32, 'h', '#ffb3d1'], [0.3, 0.55, 's', '#ffe08a'], [0.5, 0.28, 'h', '#d4bcff'], [0.7, 0.5, 's', '#9fe3ff'],
                  [0.88, 0.3, 'h', '#ffb3d1'], [0.2, 0.75, 's', '#9fe3ff'], [0.62, 0.74, 'h', '#ffd0e4'], [0.82, 0.72, 's', '#ffe08a'], [0.42, 0.8, 'h', '#d4bcff']];
    for (const [fx, fy, kind, col] of deco) {
      const px = bx0 + (bx1 - bx0) * fx, py = by0 + (by1 - by0) * fy;
      g.fillStyle = col;
      if (kind === 'h') { A.heartPath(g, px, py, 11); g.fill(); }
      else { A.starPath(g, px, py, 12, 5); g.fill(); }
    }
    // 彩旗
    const flags = ['#ff8fc8', '#ffd54a', '#7bd6ff', '#a98bff', '#7be0a8'];
    g.strokeStyle = 'rgba(120,80,140,.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(bx0, by0 + 6); g.quadraticCurveTo((bx0 + bx1) / 2, by0 + 40, bx1, by0 + 6); g.stroke();
    for (let i = 0; i < 17; i++) {
      const t = (i + 0.5) / 17;
      const fx = bx0 + (bx1 - bx0) * t;
      const sag = (1 - Math.pow(2 * t - 1, 2)) * 17;
      g.fillStyle = flags[i % flags.length];
      g.beginPath(); g.moveTo(fx - 8, by0 + 6 + sag); g.lineTo(fx + 8, by0 + 6 + sag); g.lineTo(fx, by0 + 24 + sag); g.closePath(); g.fill();
    }

    // 天花板
    g.fillStyle = A.lg(g, 0, 0, 0, by0, ['#fff', '#ffd9ec']);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(bx1, by0); g.lineTo(bx0, by0); g.closePath(); g.fill();
    // 側牆
    g.fillStyle = A.lg(g, 0, 0, bx0, 0, ['#ff9cc6', '#ffc6de']);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(bx0, by0); g.lineTo(bx0, by1); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = A.lg(g, W, 0, bx1, 0, ['#ff9cc6', '#ffc6de']);
    g.beginPath(); g.moveTo(W, 0); g.lineTo(bx1, by0); g.lineTo(bx1, by1); g.lineTo(W, H); g.closePath(); g.fill();

    // 地板：透視棋盤
    const NR = 7, NC = 10;
    const floorH = H - by1;
    for (let r = 0; r < NR; r++) {
      const t0 = Math.pow(r / NR, 1.6), t1 = Math.pow((r + 1) / NR, 1.6);
      const y0 = by1 + floorH * t0, y1 = by1 + floorH * t1;
      for (let i = 0; i < NC; i++) {
        const lx = (t) => (bx0 + (bx1 - bx0) * (i / NC)) * (1 - t) + (W * (i / NC)) * t;
        const rx = (t) => (bx0 + (bx1 - bx0) * ((i + 1) / NC)) * (1 - t) + (W * ((i + 1) / NC)) * t;
        g.fillStyle = (r + i) % 2 ? '#fff0f6' : '#ffc9de';
        g.beginPath();
        g.moveTo(lx(t0), y0); g.lineTo(rx(t0), y0); g.lineTo(rx(t1), y1); g.lineTo(lx(t1), y1);
        g.closePath(); g.fill();
      }
    }
    // 地板遠端淡霧
    g.fillStyle = A.lg(g, 0, by1, 0, H, ['rgba(200,160,230,.5)', 'rgba(200,160,230,0)']);
    g.fillRect(0, by1, W, floorH);

    // 房間稜線
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(bx0, by0); g.lineTo(bx0, by1); g.lineTo(0, H);
    g.moveTo(W, 0); g.lineTo(bx1, by0); g.lineTo(bx1, by1); g.lineTo(W, H);
    g.moveTo(bx0, by0); g.lineTo(bx1, by0); g.moveTo(bx0, by1); g.lineTo(bx1, by1);
    g.stroke();
    g.strokeStyle = 'rgba(160,90,170,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(bx0 + 1, by1 + 1); g.lineTo(bx1 - 1, by1 + 1); g.stroke();

    // 暈影
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(120,60,150,0)');
    vg.addColorStop(1, 'rgba(120,60,150,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    return c;
  }

  // 動態環境光：聚光燈錐、閃爍星光
  renderAmbient(ctx) {
    const t = this.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, a] of [[0.3, 0.16], [0.7, 0.16]]) {
      const x = this.width * lx;
      const g = ctx.createLinearGradient(0, 40, 0, 400);
      g.addColorStop(0, `rgba(255,245,200,${a})`);
      g.addColorStop(1, 'rgba(255,245,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 18, 40); ctx.lineTo(x + 18, 40); ctx.lineTo(x + 110, 400); ctx.lineTo(x - 110, 400); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    const twinkles = [[110, 120], [230, 90], [370, 110], [490, 130], [160, 220], [440, 240], [300, 170], [75, 300], [525, 310], [260, 280]];
    twinkles.forEach(([x, y], i) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7);
      window.PrizeArt.sparkle(ctx, x, y, 3 + a * 4, `rgba(255,255,255,${0.25 + a * 0.6})`);
    });
  }

  // 洞口與壓克力擋板
  renderChute(ctx) {
    const c = this.chute;
    const floorY = this.bounds.maxY;
    const baffleTopY = floorY - this.settings.baffleHeight;
    const baffleX = c.x + c.width;
    const A = window.PrizeArt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);

    // 洞內深度
    A.rr(ctx, c.x, c.y, c.width, c.height, 14);
    ctx.fillStyle = A.lg(ctx, 0, c.y, 0, c.y + c.height, ['#3b1d54', '#150a24']);
    ctx.fill();
    ctx.save();
    A.rr(ctx, c.x, c.y, c.width, c.height, 14); ctx.clip();
    const inner = ctx.createRadialGradient(c.x + c.width / 2, c.y + c.height * 0.2, 4, c.x + c.width / 2, c.y + c.height * 0.5, c.width * 0.7);
    inner.addColorStop(0, 'rgba(255,160,220,.35)');
    inner.addColorStop(1, 'rgba(255,160,220,0)');
    ctx.fillStyle = inner; ctx.fillRect(c.x, c.y, c.width, c.height);
    // 警示條紋
    for (let i = c.x - 20; i < c.x + c.width + 20; i += 16) {
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.moveTo(i, c.y + c.height - 12); ctx.lineTo(i + 8, c.y + c.height - 12); ctx.lineTo(i + 2, c.y + c.height); ctx.lineTo(i - 6, c.y + c.height); ctx.fill();
    }
    ctx.restore();

    // 霓虹包邊
    ctx.shadowColor = '#ff6fb5';
    ctx.shadowBlur = 8 + pulse * 10;
    A.rr(ctx, c.x, c.y, c.width, c.height, 14);
    ctx.strokeStyle = '#ff6fb5'; ctx.lineWidth = 4; ctx.stroke();
    ctx.shadowBlur = 0;
    A.rr(ctx, c.x + 3, c.y + 3, c.width - 6, c.height - 6, 11);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.stroke();

    // 彈跳愛心箭頭
    const bob = Math.sin(this.time * 4) * 3;
    ctx.fillStyle = '#ffe3f1';
    A.heartPath(ctx, c.x + c.width / 2, c.y + 26 + bob, 9); ctx.fill();
    ctx.font = '900 11px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe3f1';
    ctx.fillText('出 貨 口', c.x + c.width / 2, c.y + 52);

    // 壓克力擋板
    const bh = this.settings.baffleHeight;
    const bg = ctx.createLinearGradient(baffleX - 5, 0, baffleX + 5, 0);
    bg.addColorStop(0, 'rgba(210,240,255,.7)');
    bg.addColorStop(0.5, 'rgba(255,255,255,.85)');
    bg.addColorStop(1, 'rgba(180,225,255,.55)');
    ctx.fillStyle = bg;
    A.rr(ctx, baffleX - 5, baffleTopY, 10, bh + 14, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(baffleX - 3, baffleTopY + 4, 2, bh * 0.5);

    ctx.font = '700 9px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d6479a';
    ctx.fillText(`${bh}mm`, baffleX, baffleTopY - 7);
  }

  // 地面接觸陰影 (讓娃娃看起來真的站在地板上)
  renderShadows(ctx) {
    const floorY = this.bounds.maxY;
    for (const d of this.dolls) {
      const h = Math.max(0, floorY - (d.y + d.radius));
      const k = Math.max(0, 1 - h / 240);
      const s = this.depthScale(d.depth);
      const rx = d.radius * (0.95 - Math.min(0.4, h / 400)) * s;
      this.shadowEllipse(ctx, d.x, floorY + 2 + this.depthYOffset(d.depth), rx, rx * 0.26, 0.3 * k);
    }

    // 爪子影子 (越低越大越深)
    const cl = this.claw;
    const lowK = Math.min(1, (cl.cableLength - 70) / (cl.maxCableLength - 70));
    const s = this.depthScale(this.gantry.depth);
    this.shadowEllipse(ctx, cl.x, floorY + 4 + this.depthYOffset(this.gantry.depth), (14 + lowK * 18) * s, (4 + lowK * 5) * s, 0.12 + lowK * 0.22);
  }

  shadowEllipse(ctx, x, y, rx, ry, alpha) {
    if (alpha <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(90,30,110,${alpha})`);
    g.addColorStop(1, 'rgba(90,30,110,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  renderDoll(ctx, doll) {
    const bm = window.getPrizeBitmap(doll.type);
    const s = this.depthScale(doll.depth);
    ctx.save();
    ctx.translate(doll.x, doll.y + this.depthYOffset(doll.depth));
    ctx.rotate(doll.rotation);
    ctx.scale(s, s);
    if (!doll.isGrasped && !this.isInReach(doll)) ctx.globalAlpha = 0.72;
    ctx.drawImage(bm.canvas, -bm.L / 2, -bm.L / 2, bm.L, bm.L);
    ctx.restore();
  }

  // 天車 (Gantry)
  renderGantry(ctx) {
    const A = window.PrizeArt;
    const gx = this.gantry.x;
    const gy = this.gantry.y;
    const s = this.depthScale(this.gantry.depth);

    // 主橫軌
    A.rr(ctx, 36, gy - 25, this.width - 72, 11, 5);
    ctx.fillStyle = A.lg(ctx, 0, gy - 25, 0, gy - 14, ['#f3eefc', '#b8aed0', '#8479a3']);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,100,.5)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(s, s);
    // 車體
    A.rr(ctx, -28, -24, 56, 26, 8);
    ctx.fillStyle = A.lg(ctx, 0, -24, 0, 2, ['#ff9ec6', '#ff5d9e', '#d83380']);
    ctx.fill();
    ctx.strokeStyle = '#b02468'; ctx.lineWidth = 1.5; ctx.stroke();
    A.rr(ctx, -24, -21, 48, 7, 4);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
    // 小燈
    const blink = 0.55 + 0.45 * Math.sin(this.time * 6);
    ctx.shadowColor = '#7bffb0'; ctx.shadowBlur = 8 * blink;
    A.sphere(ctx, 17, -9, 3.6, '#5df0a0', 0.5, 0.2);
    ctx.shadowBlur = 0;
    A.sphere(ctx, -17, -9, 3.6, '#ffe27a', 0.5, 0.2);
    // 滑輪軸
    A.rr(ctx, -9, 1, 18, 8, 3);
    ctx.fillStyle = A.lg(ctx, -9, 0, 9, 0, ['#d9d2ea', '#8b80a8']);
    ctx.fill();
    ctx.restore();
  }

  // 鋼索與三爪機械爪
  renderClaw(ctx) {
    const A = window.PrizeArt;
    const gx = this.gantry.x;
    const gy = this.gantry.y + 6;
    const cx = this.claw.x;
    const cy = this.claw.y;
    const ang = this.claw.angle;
    const s = this.depthScale(this.gantry.depth);

    // 鋼索 (接到爪頭頂)
    const topX = cx + 20 * s * Math.sin(ang);
    const topY = cy - 20 * s * Math.cos(ang);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a3a5e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(topX, topY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx - 0.8, gy); ctx.lineTo(topX - 0.8, topY); ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.scale(s, s);

    const hubY = -20;
    const open = this.claw.openRatio;
    const spread = 18 + open * 26;

    const prong = (dir, len, back) => {
      ctx.save();
      ctx.scale(dir, 1);
      const tipX = spread - 6 + open * 4;
      const tipY = hubY + 32 + len;
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(8, hubY + 12);
        ctx.lineTo(spread, hubY + 32);
        ctx.lineTo(tipX, tipY);
      };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      trace(); ctx.strokeStyle = back ? '#5b4a78' : '#4a3a68'; ctx.lineWidth = back ? 8 : 9; ctx.stroke();
      trace(); ctx.strokeStyle = back ? '#a9a0c4' : '#e6e0f5'; ctx.lineWidth = back ? 5 : 6; ctx.stroke();
      trace(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6; ctx.translate(-1.2, -1); ctx.stroke(); ctx.translate(1.2, 1);
      // 爪尖粉紅橡膠套
      ctx.beginPath(); ctx.moveTo(tipX + 3, tipY - 14); ctx.lineTo(tipX - 2, tipY);
      ctx.strokeStyle = '#d83380'; ctx.lineWidth = 8.5; ctx.stroke();
      ctx.strokeStyle = '#ff7fb6'; ctx.lineWidth = 6.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tipX + 2, tipY - 12); ctx.lineTo(tipX - 1, tipY - 4);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.6; ctx.stroke();
      // 關節
      A.sphere(ctx, spread, hubY + 32, 3.6, '#ffd54a', 0.5, 0.25);
      ctx.restore();
    };

    // 後爪
    ctx.strokeStyle = '#4a3a68'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, hubY + 14); ctx.lineTo(0, hubY + 48 + (1 - open) * 8); ctx.stroke();
    ctx.strokeStyle = '#a9a0c4'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(0, hubY + 14); ctx.lineTo(0, hubY + 48 + (1 - open) * 8); ctx.stroke();

    prong(-1, 26, false);
    prong(1, 26, false);

    // 爪頭圓柱
    A.rr(ctx, -15, hubY, 30, 19, 6);
    ctx.fillStyle = A.lg(ctx, -15, 0, 15, 0, ['#8b80a8', '#f3eefc', '#c9c0e0', '#7f739e']);
    ctx.fill();
    ctx.strokeStyle = '#4a3a68'; ctx.lineWidth = 1.8; ctx.stroke();
    A.rr(ctx, -15, hubY + 6, 30, 4, 2);
    ctx.fillStyle = '#ff5d9e'; ctx.fill();
    A.sphere(ctx, 0, hubY + 14, 3.6, '#ffd54a', 0.5, 0.25);
    A.rr(ctx, -6, hubY - 6, 12, 8, 3);
    ctx.fillStyle = A.lg(ctx, -6, 0, 6, 0, ['#8b80a8', '#f3eefc', '#8b80a8']);
    ctx.fill();

    ctx.restore();
  }

  renderFallingWins(ctx) {
    const dt = this.lastDt;
    for (let i = this.fallingWins.length - 1; i >= 0; i--) {
      const doll = this.fallingWins[i];
      doll.vy += 300 * dt;
      doll.y += doll.vy * dt;
      doll.rotation += 3 * dt;

      const bm = window.getPrizeBitmap(doll.type);
      ctx.save();
      ctx.translate(doll.x, doll.y);
      ctx.rotate(doll.rotation);
      ctx.drawImage(bm.canvas, -bm.L / 2, -bm.L / 2, bm.L, bm.L);
      ctx.restore();

      if (doll.y > this.height + 60) this.fallingWins.splice(i, 1);
    }
  }

  renderParticles(ctx) {
    for (const p of this.particles) {
      const a = 1 - p.life / p.ttl;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.star) {
        window.PrizeArt.starPath(ctx, 0, 0, p.size * 1.3, p.size * 0.55);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
  }

  // 景深指示條：告訴玩家爪子目前在「前 / 後」哪一排
  renderDepthGauge(ctx) {
    const A = window.PrizeArt;
    const x = 568, top = 110, bot = 330;
    const dMin = this.bounds.depthMin, dMax = this.bounds.depthMax;
    const t = (this.gantry.depth - dMin) / (dMax - dMin);
    const my = top + (bot - top) * t;

    A.rr(ctx, x - 5, top - 6, 10, bot - top + 12, 5);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(160,90,170,.6)'; ctx.lineWidth = 1.5; ctx.stroke();

    // 可夾範圍
    const lo = Math.max(dMin, this.gantry.depth - this.depthTolerance);
    const hi = Math.min(dMax, this.gantry.depth + this.depthTolerance);
    const y0 = top + (bot - top) * ((lo - dMin) / (dMax - dMin));
    const y1 = top + (bot - top) * ((hi - dMin) / (dMax - dMin));
    A.rr(ctx, x - 3, y0, 6, Math.max(6, y1 - y0), 3);
    ctx.fillStyle = 'rgba(255,111,181,.45)'; ctx.fill();

    ctx.shadowColor = '#ff6fb5'; ctx.shadowBlur = 8;
    A.sphere(ctx, x, my, 7, '#ff6fb5', 0.5, 0.25);
    ctx.shadowBlur = 0;

    ctx.font = '900 10px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b02468';
    ctx.fillText('後', x, top - 16);
    ctx.fillText('前', x, bot + 16);
  }
}

window.ClawPhysics = ClawPhysics;

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
    this.depthTolerance = 0.17;

    // 洞口的兩支鐵桿：把洞口縮小，太大隻的娃娃要擠過去 (gap = 兩桿之間的淨空 px)
    this.rods = { gap: 66, r: 8 };

    // 台主手法：本拍的電壓加減值 (強拍 +、弱拍 -)，由 game.js 每局開始時設定
    this.beatMod = { grab: 0, carry: 0 };
    this.tricks = { jam: false }; // 卡洞預擺

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
      swing: 0,
      releaseOnLift: false,
      dropAttemptDone: false
    };

    this.dolls = [];

    // 機台設定值 (台主模式)
    this.settings = {
      // 爪力以「電壓」表示，和真機台一樣：電壓越高爪力越強
      grabVoltage: 26,   // 抓取電壓：爪子合起來夾住的力道
      carryVoltage: 16,  // 搬運電壓：上升與移動途中維持的力道（太低會中途掉）
      baffleHeight: 45,
      isGuaranteed: false
    };

    this.fallingWins = [];
    this.particles = [];
    this.guaranteePrice = 300;   // 由 game.js 同步，顯示在保證取物告示上
    this.accumulatedPrice = 0;
    this.time = 0;
    this.lastDt = 0.016;

    this.machineMode = 'avalanche';
    try { const saved=localStorage.getItem('claw-machine-mode'); if(MACHINE_MODES[saved]) this.machineMode=saved; } catch (_) {}
    this.backdrop = this.buildBackdrop();
    this.initDolls();
  }

  // ------------------------------------------------------------------
  // 景深輔助
  // ------------------------------------------------------------------
  // 景深投影：越靠後越小、越往上，三排貨架(前/中/後)一眼就分得出來
  depthScale(d) { return 0.5 + 0.5 * d; }
  depthYOffset(d) { return (d - 0.45) * 100 - 26; }

  // 洞口只在最前排；後排的娃娃在洞口後面，不會掉進去
  inFrontLane(doll) { return doll.depth >= 0.8; }

  isInReach(doll) {
    return Math.abs(doll.depth - this.gantry.depth) <= this.depthTolerance;
  }

  rodPositions() {
    const cx = this.chute.x + this.chute.width / 2;
    const y = this.bounds.maxY - this.settings.baffleHeight + 8;
    const off = this.rods.gap / 2 + this.rods.r;
    return [{ x: cx - off, y, r: this.rods.r }, { x: cx + off, y, r: this.rods.r }];
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
    const config=MACHINE_MODES[this.machineMode];
    const pool=PRIZE_TYPES.filter(config.filter);
    const baffleX = this.chute.x + this.chute.width;
    const endX = this.bounds.maxX - 24;

    // 三排貨架 (前 / 中 / 後)，每排各自堆一座小山，前排要避開洞口
    const lanes = [
      {d: .94, from: baffleX + 50, to: endX, center: 345},
      {d: .70, from: 78, to: endX, center: 315},
      {d: .46, from: 78, to: endX, center: 290}
    ];
    for (const lane of lanes) {
      for (let layer = 0; layer < config.layers; layer++) {
        const inset = layer * 28;
        for (let x = lane.from + inset; x <= lane.to - inset; x += config.step) {
          const type = pool[Math.floor(Math.random()*pool.length)];
          const scale = type.cat === 'snack' ? .9 + Math.random() * .25 : .86 + Math.random() * .34;
          const doll = this.createDoll(type,x+(Math.random()-.5)*12,382-layer*45,lane.d+(Math.random()-.5)*.035,scale);
          doll.rotation = (Math.random()-.5)*.7;
          this.dolls.push(doll);
        }
      }
    }

    // 台主手法「卡洞預擺」：把特大隻的獎品先卡在洞口鐵桿上，看起來一碰就掉，其實根本擠不過去
    // (只能靠「卡洞自取」付費買走)
    if (this.tricks.jam && this.machineMode === 'avalanche') {
      const jamId = Math.random() < 0.5 ? 'watermelon' : 'fb_hero';
      const type = PRIZE_TYPES.find(t => t.id === jamId);
      const doll = this.createDoll(type, this.chute.x + this.chute.width / 2, 250, 0.95, 1.5);
      doll.jam = true;
      doll.rotation = 0;
      this.dolls.push(doll);
    }
  }

  // 卡洞中的娃娃：停在鐵桿上超過 3 秒就算卡洞，可以付費自取
  stuckDoll() {
    let best = null;
    for (const d of this.dolls) {
      if (d.stuckTime > 3 && (!best || d.stuckTime > best.stuckTime)) best = d;
    }
    return best;
  }

  takeStuck() {
    const doll = this.stuckDoll();
    if (!doll) return false;
    this.triggerWin(doll, this.dolls.indexOf(doll));
    return true;
  }

  // 同一款獎品有大小之分：迷你 / 標準 / 大型 / 特大
  rollScale() {
    const r = Math.random();
    if (r < 0.3) return 0.78;
    if (r < 0.65) return 1.0;
    if (r < 0.92) return 1.25;
    return 1.45;
  }

  static sizeLabel(scale) {
    return scale < 0.9 ? '迷你' : scale < 1.1 ? '標準' : scale < 1.35 ? '大型' : '特大';
  }

  createDoll(type, x, y, depth, scale = 1) {
    return {
      type,
      scale,
      x,
      y,
      depth: depth || 0.7,
      vx: (Math.random() - 0.5) * 5,
      vy: 0,
      radius: type.radius * scale,
      rotation: (Math.random() - 0.5) * (type.cat === 'figurebox' ? 1.2 : 0.4),
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

    const c = this.claw;
    const effLen = Math.max(50, c.cableLength);

    if (state === 'DESCENDING') {
      // 甩爪下爪：按下的瞬間，爪子帶著當下的擺動速度「拋」出去，
      // 沿著甩動方向一邊下墜一邊飄移，路徑呈拋物線；不會被單擺拉回來
      if (!c.throwing) {
        c.throwing = true;
        c.offset = Math.sin(c.angle) * c.cableLength;
        c.offVel = c.angleVel * c.cableLength * Math.cos(c.angle) * 1.35;
        // 甩爪程度 0~1：甩得越大越容易夾住；直上直下(≈0)則容易夾了馬上鬆開
        c.swing = Math.min(1, Math.abs(c.offVel) / 80);
      }
      c.offVel *= Math.max(0, 1 - 0.75 * dt);
      c.offset += c.offVel * dt;

      const lim = Math.min(170, effLen * 0.9);
      const minOff = this.bounds.minX - this.gantry.x;
      const maxOff = this.bounds.maxX - this.gantry.x;
      const lo = Math.max(-lim, minOff), hi = Math.min(lim, maxOff);
      if (c.offset < lo) { c.offset = lo; c.offVel = 0; }
      if (c.offset > hi) { c.offset = hi; c.offVel = 0; }

      c.angle = Math.asin(Math.max(-0.95, Math.min(0.95, c.offset / effLen)));
      c.angleVel = c.offVel / effLen; // 抓取後繼續帶著這個速度擺盪
    } else {
      c.throwing = false;
      // 單擺模型
      const g = 650;
      c.angleVel += (-g / effLen) * Math.sin(c.angle) * dt;
      c.angleVel *= c.dampening;
      c.angle += c.angleVel * dt;
      c.angle = Math.max(-0.95, Math.min(0.95, c.angle));
    }

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
      p.y = this.grabPoint().y + p.radius * 0.15;
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

      // 洞口上方沒有地板：大隻的娃娃(半徑>35)才碰得到洞底、不然永遠到不了出貨線
      const overHole = this.inFrontLane(doll) && doll.x > this.chute.x + 8 && doll.x < this.chute.x + this.chute.width;
      if (!overHole && doll.y + doll.radius > floorY) {
        doll.y = floorY - doll.radius;
        doll.vy = -doll.vy * 0.25;
        if (Math.abs(doll.vy) < 15) doll.vy = 0;
      }

      if (doll.x - doll.radius < 36) {
        doll.x = 36 + doll.radius;
        doll.vx = Math.abs(doll.vx) * 0.4;
      }

      if (doll.x + doll.radius > this.bounds.maxX) {
        doll.x = this.bounds.maxX - doll.radius;
        doll.vx = -doll.vx * 0.4;
      }

      // 洞口擋板碰撞
      const baffleX = this.chute.x + this.chute.width;
      const baffleTopY = floorY - this.settings.baffleHeight;

      // 落定期間在擋板外留一段緩衝帶，山堆才不會一鬆手就整片滑進洞口
      const front = this.inFrontLane(doll);
      if (front && !doll.jam && this.settleTimer > 0 && doll.x - doll.radius < baffleX + 45) {
        doll.x = baffleX + 45 + doll.radius;
        doll.vx = Math.abs(doll.vx) * 0.4;
      }

      if (front && doll.x - doll.radius < baffleX && doll.x + doll.radius > baffleX) {
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

      // 洞口鐵桿：娃娃是軟的，可以擠進比自己小一點的縫隙 (有效半徑 78%)
      for (const rod of front ? this.rodPositions() : []) {
        const rx = doll.x - rod.x, ry = doll.y - rod.y;
        const rd = Math.hypot(rx, ry);
        const minD = doll.radius * 0.78 + rod.r;
        if (rd < minD && rd > 0.001) {
          const nx = rx / rd, ny = ry / rd;
          doll.x = rod.x + nx * minD;
          doll.y = rod.y + ny * minD;
          const vn = doll.vx * nx + doll.vy * ny;
          if (vn < 0) {
            doll.vx -= 1.25 * vn * nx;
            doll.vy -= 1.25 * vn * ny;
          }
          // Resting overlap is not an impact: never add spin every frame.
          if (vn < -20) doll.rotVel += nx * Math.min(1.2, -vn * .008);
          if (Math.abs(doll.vx) < 8 && Math.abs(doll.vy) < 15) {
            doll.rotVel *= Math.exp(-12 * dt);
            if (Math.abs(doll.rotVel) < .03) doll.rotVel = 0;
          }
          doll.rotVel = Math.max(-2, Math.min(2, doll.rotVel));
        }
      }

      // 卡洞偵測：停在鐵桿上方不動
      const restY = this.rodPositions()[0].y - 4;
      if (front && !doll.isGrasped && doll.x > this.chute.x && doll.x < baffleX && doll.y < restY && Math.abs(doll.vy) < 10) {
        doll.stuckTime = (doll.stuckTime || 0) + dt;
      } else {
        doll.stuckTime = 0;
      }

      // 洞口判定
      if (front && doll.x > this.chute.x && doll.x < baffleX && doll.y > baffleTopY + 10) {
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
        if (Math.abs(other.depth - doll.depth) > 0.14) continue; // 不同排不互撞

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
      this.onPrizeWon(doll.type, doll);
    }

    // 清檯：最後一件也被夾出洞口
    if (this.dolls.length === 0 && this.onTableCleared) {
      this.onTableCleared();
    }
  }

  // 電壓 → 0~1 的爪力比例 (8V ~ 32V)
  static voltagePower(v) {
    return Math.max(0, Math.min(1, (v - 8) / 24));
  }

  // 保夾時電壓鎖在最大
  // 實際電壓 = 台主設定 + 本拍加減值 (保夾時鎖最大)
  get grabPower() {
    if (this.settings.isGuaranteed) return 1;
    return ClawPhysics.voltagePower(this.settings.grabVoltage + this.beatMod.grab);
  }

  get carryPower() {
    if (this.settings.isGuaranteed) return 1;
    return ClawPhysics.voltagePower(this.settings.carryVoltage + this.beatMod.carry);
  }

  // 面板上顯示的是台主設定值，不會洩漏這一拍是強是弱
  get effectiveGrabVoltage() {
    return this.settings.isGuaranteed ? 32 : this.settings.grabVoltage;
  }

  get effectiveCarryVoltage() {
    return this.settings.isGuaranteed ? 32 : this.settings.carryVoltage;
  }

  // 爪子合起來的程度：電壓越高閉得越緊
  // 強拍閉得特別緊、弱拍鬆鬆的，是玩家「看爪」判斷拍數的線索
  gripOpenRatio() {
    return 0.46 - 0.4 * this.grabPower;
  }

  carryOpenRatio() {
    return 0.46 - 0.4 * this.carryPower;
  }

  // 爪尖夾取點：爪子中心往下約 60px，視覺上就是三個爪尖圍起來的位置
  grabPoint() {
    return { x: this.claw.x, y: this.claw.y + 60 };
  }

  // 爪子是否已碰到(插進)娃娃的上緣：下爪時用來判斷「到底」
  touchesDoll(doll) {
    if (!this.isInReach(doll)) return false;
    const g = this.grabPoint();
    return Math.hypot(g.x - doll.x, g.y - doll.y) < this.catchRange(doll);
  }

  catchRange(doll) {
    return Math.max(doll.type.catchRadius * doll.scale, doll.radius * .95 + 10);
  }

  // 抓取檢測 (只能抓到景深範圍內的娃娃)
  attemptGrab() {
    const gp = this.grabPoint();
    let closestDoll = null;
    let minDist = 9999;

    for (const doll of this.dolls) {
      if (!this.isInReach(doll)) continue;
      const dist = Math.hypot(gp.x - doll.x, gp.y - doll.y);
      if (dist < this.catchRange(doll) && dist < minDist) {
        minDist = dist;
        closestDoll = doll;
      }
    }

    if (closestDoll) {
      // 甩爪帶著動能，爪尖更容易卡進娃娃：甩得越大越好夾
      const swingBonus = this.claw.swing * 0.2;
      // 越大隻越難夾牢
      const sizePenalty = (closestDoll.scale - 1) * 0.25;
      const successChance = Math.max(0.2, (this.grabPower * 1.2) - (closestDoll.type.catchDifficulty * 0.35) + swingBonus - sizePenalty);

      if (Math.random() <= successChance || this.settings.isGuaranteed) {
        this.claw.holdingPrize = closestDoll;
        closestDoll.isGrasped = true;
        // Removing a support disturbs nearby packages; normal collisions carry the collapse.
        for (const neighbor of this.dolls) {
          if (neighbor === closestDoll || neighbor.isGrasped || neighbor.jam) continue;
          const distance = Math.hypot(neighbor.x-closestDoll.x, neighbor.y-closestDoll.y);
          if (Math.abs(neighbor.depth-closestDoll.depth)<.14 && distance<105) {
            neighbor.vx += (neighbor.x < closestDoll.x ? -1 : 1) * (105-distance)*.8;
            neighbor.vy += 25;
            neighbor.rotVel += (neighbor.x < closestDoll.x ? -1 : 1)*.65;
          }
        }
        // 直上直下夾住，爪子沒有咬進去，一提起來就容易放開，娃娃留在原地
        const straight = 1 - this.claw.swing;
        this.claw.releaseOnLift = !this.settings.isGuaranteed && Math.random() < 0.75 * straight * straight;
        return true;
      }
    }
    return false;
  }

  // 開始上升時呼叫：直上直下的夾取可能一提起就鬆開，娃娃停在原地
  checkReleaseOnLift() {
    if (!this.claw.releaseOnLift) return false;
    this.claw.releaseOnLift = false;
    const doll = this.claw.holdingPrize;
    if (!doll) return false;
    doll.isGrasped = false;
    doll.vx = 0;
    doll.vy = 0;
    this.claw.holdingPrize = null;
    this.claw.dropAttemptDone = true;
    if (window.clawAudio) window.clawAudio.playClawSnap();
    return true;
  }

  // 二段放爪檢測
  checkDropPowerRelease() {
    if (this.settings.isGuaranteed || !this.claw.holdingPrize) return false;
    if (this.claw.dropAttemptDone) return false;
    this.claw.dropAttemptDone = true;

    // 搬運電壓不夠，越重的獎品越容易中途鬆脫
    const held = this.claw.holdingPrize;
    const heavy = (held.type.weight * Math.pow(held.scale, 1.5) - 1) * 0.3;
    // 甩爪夾得比較牢，直上直下則比較容易掉
    const grip = 1 - this.claw.swing * 0.5;
    const dropChance = Math.max(0, Math.min(0.98, (1.0 - (this.carryPower * 1.1) + heavy) * grip));
    if (Math.random() < dropChance) {
      const dropped = this.claw.holdingPrize;
      dropped.isGrasped = false;
      dropped.vy = 40;
      dropped.vx = (Math.random() - 0.5) * 80;
      this.claw.holdingPrize = null;
      if (window.clawAudio) window.clawAudio.playClawSnap();
      return true;
    }
    return false;
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
    this.renderNotices(ctx);
    this.renderLanes(ctx);
    this.renderShadows(ctx);

    // 遠的先畫，近的後畫；洞口在最前排，所以夾在中後排與前排之間
    const sorted = [...this.dolls].sort((a, b) => (a.depth - b.depth) || (a.y - b.y));
    let chuteDrawn = false;
    for (const doll of sorted) {
      if (!chuteDrawn && doll.depth >= 0.8) { this.renderChute(ctx); chuteDrawn = true; }
      this.renderDoll(ctx, doll);
    }
    if (!chuteDrawn) this.renderChute(ctx);

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
    g.fillStyle = A.lg(g, 0, by0, 0, by1, ['#ffffff', '#fff8dc', '#ffefb0']);
    g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // 波點
    g.fillStyle = 'rgba(255,200,60,.4)';
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
    g.fillStyle = A.lg(g, 0, 0, 0, by0, ['#fff', '#ffe9a8']);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(bx1, by0); g.lineTo(bx0, by0); g.closePath(); g.fill();
    // 側牆
    g.fillStyle = A.lg(g, 0, 0, bx0, 0, ['#9fb4d4', '#e2ecf8']);
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
        g.fillStyle = (r + i) % 2 ? '#62d686' : '#46bd6c';
        g.beginPath();
        g.moveTo(lx(t0), y0); g.lineTo(rx(t0), y0); g.lineTo(rx(t1), y1); g.lineTo(lx(t1), y1);
        g.closePath(); g.fill();
      }
    }
    // 地板遠端淡霧
    g.fillStyle = A.lg(g, 0, by1, 0, H, ['rgba(10,70,40,.4)', 'rgba(10,70,40,0)']);
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
    vg.addColorStop(0, 'rgba(120,80,0,0)');
    vg.addColorStop(1, 'rgba(120,80,0,.25)');
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
    // 洞口在最前排，跟著前排一起往下投影
    ctx.save();
    ctx.translate(0, this.depthYOffset(0.95));
    this.drawChute(ctx);
    ctx.restore();
  }

  drawChute(ctx) {
    const c = this.chute;
    const floorY = this.bounds.maxY;
    const baffleTopY = floorY - this.settings.baffleHeight;
    const baffleX = c.x + c.width;
    const A = window.PrizeArt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);

    // 洞內深度
    A.rr(ctx, c.x, c.y, c.width, c.height, 14);
    ctx.fillStyle = A.lg(ctx, 0, c.y, 0, c.y + c.height, ['#2e2e2e', '#0a0a0a']);
    ctx.fill();
    ctx.save();
    A.rr(ctx, c.x, c.y, c.width, c.height, 14); ctx.clip();
    const inner = ctx.createRadialGradient(c.x + c.width / 2, c.y + c.height * 0.2, 4, c.x + c.width / 2, c.y + c.height * 0.5, c.width * 0.7);
    inner.addColorStop(0, 'rgba(255,210,80,.3)');
    inner.addColorStop(1, 'rgba(255,210,80,0)');
    ctx.fillStyle = inner; ctx.fillRect(c.x, c.y, c.width, c.height);
    // 警示條紋
    for (let i = c.x - 20; i < c.x + c.width + 20; i += 16) {
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.moveTo(i, c.y + c.height - 12); ctx.lineTo(i + 8, c.y + c.height - 12); ctx.lineTo(i + 2, c.y + c.height); ctx.lineTo(i - 6, c.y + c.height); ctx.fill();
    }
    ctx.restore();

    // 霓虹包邊
    ctx.shadowColor = '#ff3b30';
    ctx.shadowBlur = 8 + pulse * 10;
    A.rr(ctx, c.x, c.y, c.width, c.height, 14);
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 4; ctx.stroke();
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
    ctx.fillStyle = '#b35a00';
    ctx.fillText(`${bh}mm`, baffleX, baffleTopY - 7);

    // 兩支鐵桿 (縮小洞口)
    for (const rod of this.rodPositions()) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(rod.x + 1.5, rod.y + 2, rod.r + 1, 0, Math.PI * 2); ctx.fill();
      const rg = ctx.createRadialGradient(rod.x - rod.r * 0.4, rod.y - rod.r * 0.4, 1, rod.x, rod.y, rod.r * 1.1);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#cfd6e0'); rg.addColorStop(1, '#6b7486');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rod.x, rod.y, rod.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a5160'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = '#7a5200';
    ctx.fillText(`縮口 ${this.rods.gap}mm`, c.x + c.width / 2, this.rodPositions()[0].y + 22);
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
    ctx.drawImage(bm.canvas, -bm.L * doll.scale / 2, -bm.L * doll.scale / 2, bm.L * doll.scale, bm.L * doll.scale);
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
    ctx.fillStyle = A.lg(ctx, 0, -24, 0, 2, ['#ff8a7a', '#e8392b', '#b3211a']);
    ctx.fill();
    ctx.strokeStyle = '#7d130e'; ctx.lineWidth = 1.5; ctx.stroke();
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

  // 鋼索與三爪機械爪：螺旋電線 + 紅銀圓筒爪頭 + 三支細長弧形鋼爪 (參考實機)
  renderClaw(ctx) {
    const A = window.PrizeArt;
    const gx = this.gantry.x;
    const gy = this.gantry.y + 6;
    const ang = this.claw.angle;
    const s = this.depthScale(this.gantry.depth);
    const yo = this.depthYOffset(this.gantry.depth);
    const cx = this.claw.x;
    const cy = this.claw.y + yo;

    // 爪頭頂端接點
    const topX = cx + 20 * s * Math.sin(ang);
    const topY = cy - 20 * s * Math.cos(ang);

    // 螺旋電線 (實機是黑色捲線)
    const len = Math.hypot(topX - gx, topY - gy);
    const ux = (topX - gx) / (len || 1), uy = (topY - gy) / (len || 1);
    const nx = -uy, ny = ux;
    const coils = Math.max(3, Math.floor(len / 7));
    const trace = (w) => {
      ctx.beginPath();
      for (let i = 0; i <= coils * 8; i++) {
        const t = i / (coils * 8);
        const wob = Math.sin(t * coils * Math.PI * 2) * w;
        const px = gx + (topX - gx) * t + nx * wob;
        const py = gy + (topY - gy) * t + ny * wob;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1620'; ctx.lineWidth = 3.4; trace(4.5 * s); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.save(); ctx.translate(-0.8, -0.8); trace(4.5 * s); ctx.stroke(); ctx.restore();
    // 中央細鋼索
    ctx.strokeStyle = 'rgba(210,214,224,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(topX, topY); ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.scale(s, s);

    const hubY = -20;
    const open = this.claw.openRatio;
    const spread = 16 + open * 28;

    // 細弧形鋼爪
    const prong = (dir) => {
      ctx.save();
      ctx.scale(dir, 1);
      const tipX = spread - 2 + open * 2;
      const tipY = hubY + 60;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(6, hubY + 14);
        ctx.quadraticCurveTo(spread + 10, hubY + 16, tipX, tipY);
      };
      ctx.lineCap = 'round';
      path(); ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 5.4; ctx.stroke();
      path(); ctx.strokeStyle = '#d9dee8'; ctx.lineWidth = 3.4; ctx.stroke();
      path(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1; ctx.translate(-0.8, -0.8); ctx.stroke(); ctx.translate(0.8, 0.8);
      // 爪尖小套
      ctx.beginPath(); ctx.moveTo(tipX + 1, tipY - 7); ctx.lineTo(tipX - 1, tipY + 1);
      ctx.strokeStyle = '#a82016'; ctx.lineWidth = 6.2; ctx.stroke();
      ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 4.2; ctx.stroke();
      ctx.restore();
    };

    // 後爪
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, hubY + 14); ctx.lineTo(0, hubY + 52 + (1 - open) * 6); ctx.stroke();
    ctx.strokeStyle = '#aab1c0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, hubY + 14); ctx.lineTo(0, hubY + 52 + (1 - open) * 6); ctx.stroke();

    prong(-1);
    prong(1);

    // 爪頭：銀色圓筒 + 紅色環
    A.rr(ctx, -12, hubY - 4, 24, 24, 5);
    ctx.fillStyle = A.lg(ctx, -12, 0, 12, 0, ['#7e8594', '#f4f6fa', '#c3c9d6', '#6f7686']);
    ctx.fill();
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 1.6; ctx.stroke();
    A.rr(ctx, -12, hubY + 3, 24, 5, 2);
    ctx.fillStyle = A.lg(ctx, -12, 0, 12, 0, ['#8c1812', '#ff5a48', '#8c1812']); ctx.fill();
    A.rr(ctx, -12, hubY + 12, 24, 3, 1);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    A.rr(ctx, -6, hubY - 10, 12, 8, 3);
    ctx.fillStyle = A.lg(ctx, -6, 0, 6, 0, ['#7e8594', '#f4f6fa', '#7e8594']);
    ctx.fill();

    ctx.restore();
  }

  // 背牆告示：顧客須知、保證取物看板、卡洞自取小紙條 (實機一定會貼)
  renderNotices(ctx) {
    const A = window.PrizeArt;
    const W = this.width;
    const guaranteed = this.accumulatedPrice >= this.guaranteePrice;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);

    // 顧客須知 (左右各一張)
    const sheet = (x, y, rot) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(2, 3, 62, 84);
      ctx.fillStyle = '#fbfcff'; ctx.fillRect(0, 0, 62, 84);
      ctx.strokeStyle = '#c6cbd8'; ctx.lineWidth = 0.8; ctx.strokeRect(0, 0, 62, 84);
      ctx.fillStyle = '#d6281f';
      ctx.font = '900 6.5px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('※親愛的顧客請注意※', 31, 5);
      ctx.fillStyle = '#b9bfcd';
      for (let i = 0; i < 9; i++) ctx.fillRect(6, 17 + i * 7, i % 3 === 2 ? 34 : 50, 2.4);
      ctx.fillStyle = '#e8ecf5'; ctx.fillRect(6, 78, 24, 2.4);
      ctx.restore();
    };
    sheet(112, 96, -0.03);
    sheet(W - 112 - 62, 100, 0.025);

    // 保證取物看板
    const sx = W / 2 - 58, sy = 82, sw = 116, sh = 88;
    ctx.save();
    if (guaranteed) { ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10 + pulse * 14; }
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(sx + 3, sy + 4, sw, sh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#e0a400'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh);
    ctx.restore();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffeb7a'; ctx.fillRect(sx + 3, sy + 3, sw - 6, 26);
    ctx.fillStyle = '#d6281f'; ctx.font = '900 11px "Noto Sans TC", sans-serif';
    ctx.fillText('產品售價', sx + 8, sy + 11);
    ctx.fillStyle = '#2b2b2b'; ctx.font = '900 12px "Noto Sans TC", sans-serif';
    ctx.fillText('每局  $ 10', sx + 8, sy + 23);

    ctx.fillStyle = guaranteed ? `rgb(${220 + pulse * 35},40,30)` : '#e5301f';
    ctx.fillRect(sx + 3, sy + 31, sw - 6, 24);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '900 16px "Noto Sans TC", sans-serif';
    ctx.fillText(guaranteed ? '保夾啟動！' : '保證取物', sx + sw / 2, sy + 44);

    ctx.fillStyle = '#fff6c9'; ctx.fillRect(sx + 3, sy + 57, sw - 6, 28);
    ctx.fillStyle = '#2b2b2b'; ctx.font = '900 13px "Noto Sans TC", sans-serif';
    ctx.fillText(`累計 $${this.guaranteePrice} 保證`, sx + sw / 2, sy + 66);
    const bx = sx + 9, bw = sw - 18, by = sy + 74;
    ctx.fillStyle = '#d9d3b0'; ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = guaranteed ? '#e5301f' : '#27b98a';
    ctx.fillRect(bx, by, bw * Math.min(1, this.accumulatedPrice / this.guaranteePrice), 6);

    // 清檯獎看板：剩餘件數
    const left = this.dolls.length;
    const cy = sy + sh + 8;
    const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    g.addColorStop(0, '#b8860b'); g.addColorStop(0.5, '#ffe27a'); g.addColorStop(1, '#b8860b');
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(sx + 2, cy + 3, sw, 24);
    ctx.fillStyle = g; ctx.fillRect(sx, cy, sw, 24);
    ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 1.5; ctx.strokeRect(sx, cy, sw, 24);
    ctx.fillStyle = '#7a1d12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 12px "Noto Sans TC", sans-serif';
    ctx.fillText(left > 0 ? `清檯獎 · 剩 ${left} 件` : '清檯成功！', sx + sw / 2, cy + 12);
    ctx.fillStyle = '#e5301f'; A.starPath(ctx, sx + 11, cy + 12, 6, 2.6); ctx.fill();
    A.starPath(ctx, sx + sw - 11, cy + 12, 6, 2.6); ctx.fill();

    // 卡洞自取 小紙條
    ctx.save();
    ctx.translate(W / 2 + 70, 112); ctx.rotate(0.05);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(2, 3, 52, 38);
    ctx.fillStyle = '#2f62d9'; ctx.fillRect(0, 0, 52, 38);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 11px "Noto Sans TC", sans-serif';
    ctx.fillText('卡洞自取', 26, 13);
    ctx.font = '700 8px "Noto Sans TC", sans-serif';
    ctx.fillText('購一取一', 26, 28);
    ctx.restore();
  }

  // 景深地板：三排貨架的地線，以及爪子目前所在排的高亮帶
  renderLanes(ctx) {
    const floorY = this.bounds.maxY;
    for (const d of [0.45, 0.70, 0.95]) {
      const y = floorY + this.depthYOffset(d) + 1;
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(this.width - 44, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    const d = this.gantry.depth;
    const y = floorY + this.depthYOffset(d) + 2;
    const g = ctx.createLinearGradient(0, y - 10, 0, y + 10);
    g.addColorStop(0, 'rgba(255,230,80,0)');
    g.addColorStop(0.5, 'rgba(255,230,80,.55)');
    g.addColorStop(1, 'rgba(255,230,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(44, y - 10, this.width - 88, 20);
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
      ctx.translate(doll.x, doll.y + this.depthYOffset(0.95));
      ctx.rotate(doll.rotation);
      const fs = doll.scale || 1;
      ctx.drawImage(bm.canvas, -bm.L * fs / 2, -bm.L * fs / 2, bm.L * fs, bm.L * fs);
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
    ctx.fillStyle = 'rgba(255,59,48,.4)'; ctx.fill();

    ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 8;
    A.sphere(ctx, x, my, 7, '#ff3b30', 0.5, 0.25);
    ctx.shadowBlur = 0;

    ctx.font = '900 10px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a82016';
    ctx.fillText('後', x, top - 16);
    ctx.fillText('前', x, bot + 16);
  }
}

window.ClawPhysics = ClawPhysics;

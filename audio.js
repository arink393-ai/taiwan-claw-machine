/**
 * 音效系統 (Web Audio API 合成音效)
 * 完全不依賴外部音檔，零網路延遲，提供最原汁原味的台灣街機與微動開關打擊感。
 */

class ClawAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.motorOsc = null;
    this.motorGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  // 1. 投幣聲 (清脆的十元硬幣滾動與噹噹聲)
  playCoin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 硬幣落入金屬軌道的撞擊聲
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1400, t);
    osc1.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
    gain1.gain.setValueAtTime(0.3, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.12);

    // 金屬回響噹亮音
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2480, t + 0.06);
    osc2.frequency.setValueAtTime(3200, t + 0.12);
    gain2.gain.setValueAtTime(0.35, t + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t + 0.06);
    osc2.stop(t + 0.45);
  }

  // 2. 搖桿與按鈕微動開關聲 (喀嗒聲 Microswitch click)
  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.025);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.025);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.025);
  }

  // 3. 天車馬達移動時的運轉嗡鳴聲
  startMotor() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || this.motorOsc) return;

    const t = this.ctx.currentTime;
    this.motorOsc = this.ctx.createOscillator();
    this.motorGain = this.ctx.createGain();

    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.setValueAtTime(110, t);

    // 低頻濾波器模擬馬達機殼共振
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);

    this.motorGain.gain.setValueAtTime(0.08, t);

    this.motorOsc.connect(filter);
    filter.connect(this.motorGain);
    this.motorGain.connect(this.ctx.destination);

    this.motorOsc.start(t);
  }

  stopMotor() {
    if (this.motorOsc) {
      try {
        this.motorOsc.stop();
        this.motorOsc.disconnect();
      } catch (e) {}
      this.motorOsc = null;
      this.motorGain = null;
    }
  }

  // 4. 下爪繩索滑輪聲
  playDrop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(300, t + 0.3);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // 5. 爪子收合/捏緊撞擊聲
  playClawSnap() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // 6. 二停音效 (煞車卡嗒聲)
  playSecondStop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.setValueAtTime(460, t + 0.04);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // 7. 出貨恭喜慶祝樂曲 (Classic Taiwan Arcade Win Fanfare)
  playWinFanfare() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.50, d: 0.35 },// C6
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.50, d: 0.55 } // C6
    ];

    let startTime = this.ctx.currentTime + 0.05;
    notes.forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, startTime);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + note.d);

      startTime += note.d * 0.85;
    });
  }

  // 8. 達到保夾提示警報音
  playGuaranteeAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = t + i * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, start);
      osc.frequency.linearRampToValueAtTime(1760, start + 0.08);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.1);
    }
  }

  // 10. 盲盒拆開：由低到高的閃亮上行音 (稀有款音階更長)
  playReveal(rarity = 'N') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const scale = rarity === 'SSR'
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093]
      : rarity === 'R' || rarity === 'SR'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : [523.25, 659.25, 880];

    let t = this.ctx.currentTime + 0.02;
    scale.forEach(f => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
      t += 0.09;
    });
  }

  // 11. 盲盒搖晃的悶響
  playShake() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const s = t + i * 0.09;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i % 2 ? 180 : 240, s);
      gain.gain.setValueAtTime(0.18, s);
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.07);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(s);
      osc.stop(s + 0.07);
    }
  }

  // 9. 倒數最後 3 秒警示音 (嗶、嗶、嗶)
  playCountTick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, t);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}

// 全域音效實例
window.clawAudio = new ClawAudio();

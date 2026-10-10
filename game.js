/**
 * 台灣飛絡力夾娃娃機 遊戲主邏輯控制器 (Game Controller)
 * 整合狀態機、投幣保夾邏輯、實體搖桿手感與二停下爪系統
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const physics = new ClawPhysics(canvas);
  let scene3d;
  try { scene3d = new Claw3D(physics); } catch (error) {
    console.warn("3D 初始化失敗，使用原版畫面", error);
    document.getElementById("scene-3d")?.remove();
    canvas.style.display = "block";
  }

  // 遊戲全域狀態
  const state = {
    mode: 'IDLE', // IDLE, PLAYING, DESCENDING, GRABBING, ASCENDING, RETURNING, RELEASING
    credits: 0,
    guaranteePrice: 300,
    accumulatedPrice: 0,
    timerSeconds: 20,
    currentTimer: 0,
    totalCoinsInserted: 0,
    prizesWonCount: 0,
    collection: {}, // { 'capybara': 2, ... }
    isSecondStopAvailable: false,
    hasSecondStopped: false,
    isMotorSoundPlaying: false,
    winOpen: false,        // 出貨卡片開啟時暫停倒數與操作
    releaseScheduled: false,
    beat: 0,              // 拍數：機台已經玩了幾拍 (每局一拍)
    lastWinBeat: 0,
    winBeats: [],         // 最近幾次出貨是第幾拍 (登記板上看得到，用來算拍數)
    tickets: 0,           // 兌換券：每夾出一個獎品就有，可換夾換品或刮刮樂
    clearBonus: false,    // 剛清檯：關掉出貨卡片後要顯示清檯獎
    pendingSize: '標準',
    pendingPrize: null     // 目前出貨卡片上的獎品 (盲盒會在此被拆開)
  };

  // 存檔：戰利品與統計存在 localStorage，重新整理不會消失
  const SAVE_KEY = 'feiluoli-claw-save-v2';

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!raw) return;
      state.collection = raw.collection || {};
      state.totalCoinsInserted = raw.totalCoinsInserted || 0;
      state.prizesWonCount = raw.prizesWonCount || 0;
      state.tickets = raw.tickets || 0;
      state.beat = raw.beat || 0;
      state.lastWinBeat = raw.lastWinBeat || 0;
      state.winBeats = raw.winBeats || [];
    } catch (e) { /* 無痕模式或資料損毀就當作新遊戲 */ }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        collection: state.collection,
        totalCoinsInserted: state.totalCoinsInserted,
        prizesWonCount: state.prizesWonCount,
        tickets: state.tickets,
        beat: state.beat,
        lastWinBeat: state.lastWinBeat,
        winBeats: state.winBeats
      }));
    } catch (e) { /* 儲存失敗不影響遊戲 */ }
  }

  loadSave();

  // 輸入狀態
  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    joyX: 0,
    joyY: 0
  };

  // DOM 元素引用
  const elDispCredits = document.getElementById('disp-credits');
  const elDispGuarantee = document.getElementById('disp-guarantee');
  const elDispAccumulated = document.getElementById('disp-accumulated');
  const elDispTimer = document.getElementById('disp-timer');
  const elBtnDrop = document.getElementById('btn-drop');
  const elBtnCoin = document.getElementById('btn-insert-coin');
  const elBtnCoin100 = document.getElementById('btn-insert-100');
  const elCoinSlit = document.getElementById('coin-slot-slit');
  const elDispVoltage = document.getElementById('disp-voltage');
  const elActionText = document.getElementById('action-status-text');
  const elGuaranteeBulb = document.getElementById('guarantee-bulb');
  const elGuaranteePill = document.getElementById('marquee-guarantee-pill');

  // 統計列
  const elStatBeat = document.getElementById('stat-beat');
  const elClipBeats = document.getElementById('clip-beats');
  const elTicketCount = document.getElementById('ticket-count');
  const elClipTally = document.getElementById('clip-tally');
  const elStatCoins = document.getElementById('stat-total-coins');
  const elStatWins = document.getElementById('stat-prizes-won');
  const elStatWinRate = document.getElementById('stat-win-rate');
  const elCollectionBadge = document.getElementById('collection-badge');

  // 獲勝覆蓋卡片
  const elWinOverlay = document.getElementById('win-overlay');
  const elWinPreview = document.getElementById('win-prize-preview');
  const elWinPrizeName = document.getElementById('win-prize-name');
  const elWinSpent = document.getElementById('win-spent');
  const elWinTag = document.getElementById('win-guaranteed-tag');
  const elBtnCollectPrize = document.getElementById('btn-collect-prize');
  const elBtnOpenBlind = document.getElementById('btn-open-blind');
  const elWinCard = document.getElementById('win-card');
  const elWinTitle = document.getElementById('win-title');
  const elWinRarity = document.getElementById('win-rarity');
  const elWinDesc = document.getElementById('win-prize-desc');

  // 取物門
  const elChuteFlap = document.getElementById('chute-flap');

  // 彈跳視窗
  const modalCollection = document.getElementById('modal-collection');
  const modalOwner = document.getElementById('modal-owner');
  const modalHelp = document.getElementById('modal-help');

  // 登記板的「正」字記號：5 為一組
  function tallyString(n) {
    if (!n) return '—';
    const groups = Math.floor(n / 5), rest = n % 5;
    return '正'.repeat(Math.min(groups, 8)) + (groups > 8 ? `×${groups}` : '') + ['', '一', '丅', '下', '止'][rest];
  }

  // 更新儀表板顯示
  function updateDisplays() {
    elDispCredits.textContent = String(state.credits).padStart(2, '0');
    elDispGuarantee.textContent = String(state.guaranteePrice).padStart(3, '0');
    elDispAccumulated.textContent = String(state.accumulatedPrice).padStart(3, '0');
    
    if (state.mode === 'PLAYING') {
      elDispTimer.textContent = String(Math.ceil(state.currentTimer)).padStart(2, '0');
    } else {
      elDispTimer.textContent = '--';
    }

    // 保夾判斷
    const isGuaranteed = state.accumulatedPrice >= state.guaranteePrice;
    physics.settings.isGuaranteed = isGuaranteed;

    physics.guaranteePrice = state.guaranteePrice;
    physics.accumulatedPrice = state.accumulatedPrice;

    // 爪力電壓顯示 (保夾時鎖在最大)
    elDispVoltage.textContent = `${physics.effectiveGrabVoltage}V / ${physics.effectiveCarryVoltage}V`;

    if (isGuaranteed) {
      elGuaranteeBulb.classList.add('active');
      elGuaranteePill.classList.add('active');
      elGuaranteePill.textContent = '保夾啟動中！';
    } else {
      elGuaranteeBulb.classList.remove('active');
      elGuaranteePill.classList.remove('active');
      elGuaranteePill.textContent = '保證取物';
    }

    // 統計
    elStatCoins.textContent = state.totalCoinsInserted;
    elStatWins.textContent = state.prizesWonCount;
    const rate = state.totalCoinsInserted > 0 
      ? ((state.prizesWonCount / (state.totalCoinsInserted / 10)) * 100).toFixed(1)
      : '0.0';
    elStatWinRate.textContent = `${rate}%`;

    // 兌換券與夾出登記板
    elTicketCount.textContent = state.tickets;
    elStatBeat.textContent = state.beat;
    elClipBeats.textContent = state.winBeats.length ? '出貨拍 ' + state.winBeats.join('·') : '出貨拍 —';
    elClipTally.textContent = tallyString(state.prizesWonCount);

    // 背包徽章
    const totalCollected = Object.values(state.collection).reduce((a, b) => a + b, 0);
    elCollectionBadge.textContent = totalCollected;
  }

  // 投幣處理
  function insertCoin(amount = 10) {
    window.clawAudio.playCoin();
    state.totalCoinsInserted += amount;
    state.credits += Math.floor(amount / 10);
    state.accumulatedPrice += amount;
    saveGame();

    // 檢查是否剛達到保夾
    if (state.accumulatedPrice >= state.guaranteePrice && !physics.settings.isGuaranteed) {
      window.clawAudio.playGuaranteeAlert();
    }

    updateDisplays();

    // 如果機台閒置，自動開始遊戲
    if (state.mode === 'IDLE') {
      startNextRound();
    }
  }

  // -------------------------------------------------------------
  // 台主手法：拍數強爪週期 + 出貨後收水
  //   強拍：抓取電壓 +6V、搬運電壓 +8V，夾得特別緊
  //   一般拍(放水拍)：各 -4V
  //   收水期：剛出貨後的 3 拍各 -8V
  //   (保夾時全部鎖最大電壓，不受影響)
  // -------------------------------------------------------------
  const tricks = { beatOn: true, period: 7, coolDown: true };

  function computeBeatMod() {
    if (!tricks.beatOn) return { grab: 0, carry: 0 };
    if (state.beat % tricks.period === 0) return { grab: 6, carry: 8 };
    const since = state.beat - state.lastWinBeat;
    if (tricks.coolDown && state.lastWinBeat > 0 && since >= 1 && since <= 3) return { grab: -8, carry: -8 };
    return { grab: -4, carry: -4 };
  }

  // 開始新一局
  function startNextRound() {
    if (state.credits <= 0) {
      state.mode = 'IDLE';
      elActionText.textContent = '請投入 10 元硬幣開始';
      elBtnDrop.disabled = true;
      const cap = elBtnDrop.querySelector('.btn-text');
      if (cap) cap.textContent = '下 爪';
      updateDisplays();
      return;
    }

    state.credits--;
    state.beat++;
    physics.beatMod = computeBeatMod();
    saveGame();
    state.mode = 'PLAYING';
    state.currentTimer = state.timerSeconds;
    state.isSecondStopAvailable = false;
    state.hasSecondStopped = false;

    // 天車重置至可移動狀態，爪子張開
    physics.claw.openRatio = 0.85;
    physics.claw.holdingPrize = null;
    physics.claw.dropAttemptDone = false;

    elBtnDrop.disabled = false;
    const cap = elBtnDrop.querySelector('.btn-text');
    if (cap) cap.textContent = '下 爪';
    elActionText.textContent = physics.settings.isGuaranteed ? '🔥 保夾模式中！100% 強爪不放' : '移動搖桿瞄準，可甩爪！';
    updateDisplays();
  }

  // 觸發下爪或二停 (按下大圓鈕)
  function handleDropButton() {
    if (state.winOpen) return;
    window.clawAudio.playClick();

    if (state.mode === 'PLAYING') {
      // 1. 第一次按下：啟動下爪！
      state.mode = 'DESCENDING';
      state.isSecondStopAvailable = true;
      state.hasSecondStopped = false;

      // 改變按鈕文案為「二 停」
      const cap = elBtnDrop.querySelector('.btn-text');
      if (cap) cap.textContent = '二 停';
      elActionText.textContent = '下放中！再次按下可「二停收爪」！';

      window.clawAudio.playDrop();

    } else if (state.mode === 'DESCENDING' && state.isSecondStopAvailable && !state.hasSecondStopped) {
      // 2. 第二次按下：經典二停！立即煞車收爪！
      state.hasSecondStopped = true;
      state.isSecondStopAvailable = false;
      window.clawAudio.playSecondStop();

      elActionText.textContent = '⚡ 二停啟動！提前夾取！';
      // 立刻轉為抓取閉合狀態
      state.mode = 'GRABBING';
      triggerClawGrip();
    }
  }

  // 執行收爪抓取判定
  function triggerClawGrip() {
    physics.claw.openRatio = physics.gripOpenRatio(); // 閉合：電壓越高閉得越緊
    window.clawAudio.playClawSnap();

    // 進行抓取碰撞判定
    const caught = physics.attemptGrab();
    elActionText.textContent = caught ? '🎯 抓到了！準備上升...' : '爪子閉合，未抓中！';

    // 爪子閉合後短暫停頓 0.35 秒開始上升
    setTimeout(() => {
      state.mode = 'ASCENDING';
      const slipped = physics.checkReleaseOnLift();
      elBtnDrop.disabled = true;
      const cap = elBtnDrop.querySelector('.btn-text');
      if (cap) cap.textContent = '上升中';
      elActionText.textContent = slipped ? '直上直下沒夾牢，一提就鬆開了！' : '爪子上升中...';
    }, 350);
  }

  const TICKET_BY_RARITY = { N: 1, R: 2, SR: 3, SSR: 5 };

  // 獲勝出貨事件監聽
  physics.onPrizeWon = (prizeType, doll) => {
    state.pendingSize = doll ? ClawPhysics.sizeLabel(doll.scale) : '標準';
    state.prizesWonCount++;

    // 出貨時若在保夾中，重置累積金額
    const wasGuaranteed = physics.settings.isGuaranteed;
    if (wasGuaranteed) {
      state.accumulatedPrice = 0;
    }

    // 一般獎品直接入袋；盲盒要等玩家拆開才知道抽到什麼
    if (!prizeType.blind) {
      state.collection[prizeType.id] = (state.collection[prizeType.id] || 0) + 1;
    }
    state.lastWinBeat = state.beat;
    state.winBeats = [...state.winBeats, state.beat].slice(-6);
    const gain = TICKET_BY_RARITY[prizeType.rarity] || 1;
    state.tickets += gain;
    state.pendingGain = gain;
    state.pendingPrize = prizeType;
    saveGame();
    updateDisplays();
    window.clawAudio.playWinFanfare();

    showWinCard(prizeType, wasGuaranteed);
  };

  function rarityBadgeHTML(rarity) {
    const r = RARITY[rarity] || RARITY.N;
    return `<span class="rarity-chip" style="--rc:${r.color}">${rarity === 'SSR' ? '★ ' : ''}${r.label}</span>`;
  }

  function showWinCard(prizeType, wasGuaranteed) {
    state.winOpen = true;
    elWinCard.classList.remove('revealed', 'shaking');
    elWinTitle.textContent = prizeType.blind ? '夾到盲盒了！' : '恭喜出貨！';
    elWinPreview.innerHTML = `<img src="${getPrizeSprite(prizeType.id, 140)}" alt="${prizeType.name}">`;
    elWinPrizeName.textContent = prizeType.name;
    elWinRarity.innerHTML = rarityBadgeHTML(prizeType.rarity) + `<span class="size-chip">${state.pendingSize}尺寸</span>`;
    elWinDesc.textContent = prizeType.blind ? '到底會開出什麼呢？快拆開看看！' : prizeType.perk;
    elWinSpent.textContent = `累計投幣: ${state.totalCoinsInserted} 元`;
    elWinTag.textContent = (wasGuaranteed ? '👑 保夾出貨' : '🎯 技術取物') + `　🎫 +${state.pendingGain}`;
    elWinTag.style.background = wasGuaranteed ? '#ffd54a' : '#7be0c3';

    elBtnOpenBlind.classList.toggle('hidden', !prizeType.blind);
    elBtnCollectPrize.classList.toggle('hidden', !!prizeType.blind);
    elBtnCollectPrize.textContent = '放入背包';

    elWinOverlay.classList.remove('hidden');

    // 震動出貨門效果
    elChuteFlap.style.transform = 'perspective(300px) rotateX(35deg)';
    setTimeout(() => { elChuteFlap.style.transform = ''; }, 600);
  }

  // 清檯獎：把檯面上的獎品全部夾光 → 兌換券 +30、加送 5 局、黃金盲盒大獎，並自動補貨
  const CLEAR_REWARD = { tickets: 30, credits: 5, prizeId: 'ex_gold' };

  physics.onTableCleared = () => {
    state.tickets += CLEAR_REWARD.tickets;
    state.collection[CLEAR_REWARD.prizeId] = (state.collection[CLEAR_REWARD.prizeId] || 0) + 1;
    state.clearBonus = true;
    saveGame();
    updateDisplays();
  };

  function showClearCard() {
    const prize = PRIZE_TYPES.find(t => t.id === CLEAR_REWARD.prizeId);
    state.winOpen = true;
    state.clearBonus = false;
    elWinCard.classList.remove('shaking');
    elWinCard.classList.add('revealed');
    elWinTitle.textContent = '🎊 清檯獎！！';
    elWinPreview.innerHTML = `<img src="${getPrizeSprite(prize.id, 140)}" alt="${prize.name}">`;
    elWinPrizeName.textContent = prize.name;
    elWinRarity.innerHTML = rarityBadgeHTML('SSR');
    elWinDesc.textContent = `檯面全部夾光！兌換券 +${CLEAR_REWARD.tickets}、加送 ${CLEAR_REWARD.credits} 局`;
    elWinSpent.textContent = `累計投幣: ${state.totalCoinsInserted} 元`;
    elWinTag.textContent = '🧹 清檯成功';
    elWinTag.style.background = '#ffd54a';
    elBtnOpenBlind.classList.add('hidden');
    elBtnCollectPrize.classList.remove('hidden');
    elBtnCollectPrize.textContent = '收下並重新補貨';
    elWinOverlay.classList.remove('hidden');
    state.pendingPrize = null;
    state.afterClear = true;
    window.clawAudio.playReveal('SSR');
    physics.burst(physics.width / 2, physics.height / 2, 110);
  }

  // 拆盲盒：搖晃 → 閃光 → 揭曉公仔
  elBtnOpenBlind.addEventListener('click', () => {
    const box = state.pendingPrize;
    if (!box || !box.blind) return;
    elBtnOpenBlind.disabled = true;
    elWinCard.classList.add('shaking');
    window.clawAudio.playShake();

    setTimeout(() => {
      const fig = rollBlindBox(box.id);
      state.collection[fig.id] = (state.collection[fig.id] || 0) + 1;
      saveGame();
      updateDisplays();

      elWinCard.classList.remove('shaking');
      elWinCard.classList.add('revealed');
      elWinTitle.textContent = fig.rarity === 'SSR' ? '🎊 開出隱藏款！！' : '拆開囉！';
      elWinPreview.innerHTML = `<img src="${getPrizeSprite(fig.id, 140)}" alt="${fig.name}">`;
      elWinPrizeName.textContent = fig.name;
      elWinRarity.innerHTML = rarityBadgeHTML(fig.rarity);
      const isNew = state.collection[fig.id] === 1;
      elWinDesc.textContent = (isNew ? '🆕 新收藏！' : `已擁有 ${state.collection[fig.id]} 隻`) + '　' + (fig.series === 'blind_star' ? '星願精靈系列' : '甜點好朋友系列');
      window.clawAudio.playReveal(fig.rarity);
      physics.burst(physics.width / 2, physics.height / 2, fig.rarity === 'SSR' ? 90 : 36);

      elBtnOpenBlind.disabled = false;
      elBtnOpenBlind.classList.add('hidden');
      elBtnCollectPrize.classList.remove('hidden');
      state.pendingPrize = null;
    }, 900);
  });

  // 關閉獲勝卡片
  elBtnCollectPrize.addEventListener('click', closeWinCard);

  function closeWinCard() {
    elWinOverlay.classList.add('hidden');
    state.winOpen = false;
    window.clawAudio.playClick();

    if (state.afterClear) {
      // 清檯獎領完：補貨並加送局數
      state.afterClear = false;
      physics.initDolls();
      addCredits(CLEAR_REWARD.credits);
    } else if (state.clearBonus) {
      showClearCard();
    }
  }

  // 卡洞自取：特大獎品卡在鐵桿上，付 2 局 (20 元) 買走
  const btnTakeStuck = document.getElementById('btn-take-stuck');
  const TAKE_COST = 2;
  btnTakeStuck.addEventListener('click', () => {
    if (state.credits < TAKE_COST || state.winOpen) return;
    state.credits -= TAKE_COST;
    state.totalCoinsInserted += TAKE_COST * 10;
    if (physics.takeStuck()) window.clawAudio.playCoin();
    updateDisplays();
  });

  // 主更新循環 (RequestAnimationFrame)
  let lastTime = performance.now();

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // 1. 遊戲倒數計時
    if (state.mode === 'PLAYING' && !state.winOpen) {
      state.currentTimer -= dt;
      if (state.currentTimer <= 3 && state.currentTimer > 0) {
        if (Math.floor(state.currentTimer + dt) !== Math.floor(state.currentTimer)) {
          window.clawAudio.playCountTick();
        }
      }
      if (state.currentTimer <= 0) {
        // 時間到！強制自動下爪
        handleDropButton();
      }
      elDispTimer.textContent = String(Math.max(0, Math.ceil(state.currentTimer))).padStart(2, '0');
    }

    // 搬運途中爪子鬆緊跟著搬運電壓走 (電壓低會看到爪子鬆鬆的)
    if ((state.mode === 'ASCENDING' || state.mode === 'RETURNING') && physics.claw.holdingPrize) {
      physics.claw.openRatio = physics.carryOpenRatio();
    }

    // 2. 機台狀態機運作
    if (state.mode === 'DESCENDING') {
      // 爪子向下伸展
      physics.claw.cableLength += physics.claw.descendSpeed * dt;
      physics.claw.openRatio = 0.95; // 下降途中張大爪子

      // 觸底或撞擊娃娃堆判定
      let hitBottom = physics.claw.cableLength >= physics.claw.maxCableLength;
      
      // 檢測是否碰觸到任何娃娃頂部
      for (const doll of physics.dolls) {
        if (physics.touchesDoll(doll)) {
          hitBottom = true;
          break;
        }
      }

      if (hitBottom) {
        state.mode = 'GRABBING';
        triggerClawGrip();
      }

    } else if (state.mode === 'ASCENDING') {
      // 爪子縮回天車
      physics.claw.cableLength -= physics.claw.ascendSpeed * dt;

      // 檢查二段放爪/內丟 (當升至一半以上時)
      if (physics.claw.cableLength < physics.claw.maxCableLength * 0.6) {
        if (physics.checkDropPowerRelease()) {
          // 抖爪：電壓不穩，爪子突然鬆開
          elActionText.textContent = '⚡ 爪子抖了一下，鬆掉了！';
          physics.claw.openRatio = 0.9;
        }
      }

      // 上升至頂點 (恢復短鋼索)
      if (physics.claw.cableLength <= 70) {
        physics.claw.cableLength = 70;
        physics.checkDropPowerRelease(); // 頂點再次檢驗二段爪力
        state.mode = 'RETURNING';
        elActionText.textContent = '天車歸位出貨洞口...';
      }

    } else if (state.mode === 'RETURNING') {
      // 天車返回出貨洞口 (左前方)
      const targetX = physics.chute.x + physics.chute.width / 2;
      const targetDepth = 0.9; // 靠前

      const dx = targetX - physics.gantry.x;
      const dDepth = targetDepth - physics.gantry.depth;

      const stepX = 140 * dt;
      if (Math.abs(dx) > stepX) {
        physics.gantry.x += Math.sign(dx) * stepX;
        // 回程自然產生往洞口的甩盪
        physics.claw.angleVel += (-Math.sign(dx) * 2.5 * dt);
      } else {
        physics.gantry.x = targetX;
      }

      physics.gantry.depth += Math.sign(dDepth) * Math.min(Math.abs(dDepth), 0.5 * dt);

      // 到達洞口上方
      if (Math.abs(physics.gantry.x - targetX) < 2) {
        state.mode = 'RELEASING';
        elActionText.textContent = '開爪釋放！';
      }

    } else if (state.mode === 'RELEASING') {
      // 到達洞口正上方，完全張開爪子放貨
      physics.claw.openRatio = 0.85;

      if (physics.claw.holdingPrize) {
        const releasedDoll = physics.claw.holdingPrize;
        releasedDoll.isGrasped = false;
        releasedDoll.vy = 20;
        physics.claw.holdingPrize = null;
        window.clawAudio.playClawSnap();
      }

      // 等待 0.8 秒後結算並開啟下一局或待機 (只排程一次)
      if (!state.releaseScheduled) {
        state.releaseScheduled = true;
        setTimeout(() => {
          state.releaseScheduled = false;
          if (state.mode === 'RELEASING') {
            startNextRound();
          }
        }, 800);
      }
    }

    // 卡洞自取按鈕
    const stuck = physics.stuckDoll();
    btnTakeStuck.classList.toggle('hidden', !stuck || state.winOpen);
    if (stuck) btnTakeStuck.disabled = state.credits < TAKE_COST;

    // 3. 物理更新與天車馬達音效
    const isMoving = physics.update(dt, input, state.mode);
    if (isMoving && !state.isMotorSoundPlaying) {
      window.clawAudio.startMotor();
      state.isMotorSoundPlaying = true;
    } else if (!isMoving && state.isMotorSoundPlaying) {
      window.clawAudio.stopMotor();
      state.isMotorSoundPlaying = false;
    }

    // 4. 畫布繪製
    if (scene3d) scene3d.render(); else physics.render();

    requestAnimationFrame(gameLoop);
  }

  // 啟動循環
  requestAnimationFrame(gameLoop);

  // -------------------------------------------------------------
  // 控制器與按鈕事件監聽
  // -------------------------------------------------------------

  // 下爪按鈕
  elBtnDrop.addEventListener('click', () => {
    handleDropButton();
  });

  // 投幣按鈕
  elBtnCoin.addEventListener('click', () => insertCoin(10));
  elBtnCoin100.addEventListener('click', () => insertCoin(100));
  elCoinSlit.addEventListener('click', () => insertCoin(10));

  // 點擊取物門可查看背包
  elChuteFlap.addEventListener('click', () => {
    window.clawAudio.playClick();
    openCollectionModal();
  });

  // 鍵盤操作監聽
  window.addEventListener('keydown', (e) => {
    // 避免在輸入框打字時誤觸
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
        input.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = true;
        break;
      case 'KeyW':
      case 'ArrowUp':
        input.up = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.down = true;
        break;
      case 'Space':
      case 'Enter':
        e.preventDefault();
        if (state.winOpen) {
          // 出貨卡片開著時，空白鍵 = 拆盲盒 / 放入背包
          const btn = elBtnOpenBlind.classList.contains('hidden') ? elBtnCollectPrize : elBtnOpenBlind;
          if (!btn.disabled) btn.click();
        } else if (!elBtnDrop.disabled) {
          handleDropButton();
        }
        break;
      case 'KeyC':
        insertCoin(10);
        break;
      case 'KeyR':
        if (state.mode === 'PLAYING' || state.mode === 'IDLE') physics.initDolls();
        break;
    }
    updateJoystickVisual();
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
        input.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = false;
        break;
      case 'KeyW':
      case 'ArrowUp':
        input.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.down = false;
        break;
    }
    updateJoystickVisual();
  });

  // -------------------------------------------------------------
  // 實體搖桿手勢拖曳操作 (滑鼠與觸控)
  // -------------------------------------------------------------
  const joystickBase = document.getElementById('joystick-base');
  const joystickStick = document.getElementById('joystick-stick');
  let isDraggingJoy = false;
  let joyCenter = { x: 0, y: 0 };

  function handleJoyStart(clientX, clientY) {
    isDraggingJoy = true;
    const rect = joystickBase.getBoundingClientRect();
    joyCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    handleJoyMove(clientX, clientY);
    window.clawAudio.playClick();
  }

  function handleJoyMove(clientX, clientY) {
    if (!isDraggingJoy) return;
    const dx = clientX - joyCenter.x;
    const dy = clientY - joyCenter.y;
    const maxRadius = 38;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const nx = (clampedDist / maxRadius) * Math.cos(angle);
    const ny = (clampedDist / maxRadius) * Math.sin(angle);

    input.joyX = nx;
    input.joyY = ny;

    // 搖桿視覺傾斜
    const tiltX = ny * 24;
    const tiltY = -nx * 24;
    joystickStick.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
  }

  function handleJoyEnd() {
    isDraggingJoy = false;
    input.joyX = 0;
    input.joyY = 0;
    joystickStick.style.transform = `rotateX(0deg) rotateY(0deg)`;
  }

  joystickBase.addEventListener('mousedown', (e) => handleJoyStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => handleJoyMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', handleJoyEnd);

  joystickBase.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      handleJoyStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (isDraggingJoy && e.touches.length > 0) {
      handleJoyMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  window.addEventListener('touchend', handleJoyEnd);

  // 鍵盤觸發時亦連動搖桿外觀微調
  function updateJoystickVisual() {
    if (isDraggingJoy) return;
    let rx = 0;
    let ry = 0;
    if (input.up) rx -= 18;
    if (input.down) rx += 18;
    if (input.left) ry += 18;
    if (input.right) ry -= 18;
    joystickStick.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // -------------------------------------------------------------
  // 戰利品背包視窗 (Backpack / Trophy Collection)
  // -------------------------------------------------------------
  const btnCollection = document.getElementById('btn-collection');
  const btnCloseCollection = document.getElementById('btn-close-collection');
  const btnModalCloseColl = document.getElementById('btn-modal-close-coll');
  const collectionGrid = document.getElementById('collection-grid');
  const collectionSummary = document.getElementById('collection-summary');

  function openCollectionModal() {
    collectionGrid.innerHTML = '';
    const cats = Object.keys(CATEGORY_LABEL);
    let owned = 0;
    let totalItems = 0;

    cats.forEach(cat => {
      const items = COLLECTIBLES.filter(c => c.cat === cat);
      if (!items.length) return;
      const got = items.filter(c => state.collection[c.id]).length;
      const head = document.createElement('div');
      head.className = 'coll-head';
      head.innerHTML = `<span>${CATEGORY_LABEL[cat]}</span><span class="coll-progress">${got} / ${items.length}</span>`;
      collectionGrid.appendChild(head);

      items.forEach(item => {
        const count = state.collection[item.id] || 0;
        if (count) { owned++; totalItems += count; }
        const rar = RARITY[item.rarity] || RARITY.N;
        const card = document.createElement('div');
        card.className = 'collection-card' + (count ? '' : ' locked') + (item.rarity === 'SSR' ? ' ssr' : '');
        card.style.setProperty('--rc', rar.color);
        card.innerHTML = `
          <div class="collection-icon"><img src="${getPrizeSprite(item.id, 84)}" alt=""></div>
          <div class="collection-name">${count ? item.name : '？？？'}</div>
          <div class="collection-rarity">${rar.label}</div>
          <div class="collection-count">${count ? '擁有 ' + count + ' 隻' : '尚未收集'}</div>
        `;
        collectionGrid.appendChild(card);
      });
    });

    collectionSummary.textContent = `圖鑑 ${owned} / ${COLLECTIBLES.length}　共 ${totalItems} 件 (累計花費 ${state.totalCoinsInserted} 元)`;
    modalCollection.classList.remove('hidden');
    window.clawAudio.playClick();
  }

  btnCollection.addEventListener('click', openCollectionModal);
  btnCloseCollection.addEventListener('click', () => modalCollection.classList.add('hidden'));
  btnModalCloseColl.addEventListener('click', () => modalCollection.classList.add('hidden'));

  // -------------------------------------------------------------
  // 台主微調後台 (DIP Switch Owner Settings)
  // -------------------------------------------------------------
  const btnOwner = document.getElementById('btn-owner-mode');
  const btnCloseOwner = document.getElementById('btn-close-owner');
  const btnSaveOwner = document.getElementById('btn-save-owner');

  const setGuarantee = document.getElementById('set-guarantee');
  const valGuarantee = document.getElementById('val-guarantee');
  const setClawPower = document.getElementById('set-claw-power');
  const valClawPower = document.getElementById('val-claw-power');
  const setDropPower = document.getElementById('set-drop-power');
  const valDropPower = document.getElementById('val-drop-power');
  const setBaffleHeight = document.getElementById('set-baffle-height');
  const valBaffleHeight = document.getElementById('val-baffle-height');
  const optBeat = document.getElementById('opt-beat');
  const setBeatPeriod = document.getElementById('set-beat-period');
  const valBeatPeriod = document.getElementById('val-beat-period');
  const optCool = document.getElementById('opt-cool');
  const optJam = document.getElementById('opt-jam');
  const setRodGap = document.getElementById('set-rod-gap');
  const valRodGap = document.getElementById('val-rod-gap');
  const setTimerSec = document.getElementById('set-timer-sec');
  const valTimerSec = document.getElementById('val-timer-sec');

  const btnRefill = document.getElementById('btn-refill-dolls');
  const btnClear = document.getElementById('btn-clear-dolls');
  const btnResetAccum = document.getElementById('btn-reset-accumulated');

  // 電壓文字：同時標示強弱
  function voltageLabel(v) {
    const p = ClawPhysics.voltagePower(Number(v));
    const tag = p < 0.25 ? '偏弱' : p < 0.55 ? '中等' : p < 0.85 ? '偏強' : '超強';
    return `${v} V (${tag})`;
  }

  btnOwner.addEventListener('click', () => {
    // 帶入目前設定值
    setGuarantee.value = state.guaranteePrice;
    valGuarantee.textContent = `${state.guaranteePrice} 元`;

    setClawPower.value = physics.settings.grabVoltage;
    valClawPower.textContent = voltageLabel(setClawPower.value);

    setDropPower.value = physics.settings.carryVoltage;
    valDropPower.textContent = voltageLabel(setDropPower.value);

    setBaffleHeight.value = physics.settings.baffleHeight;
    valBaffleHeight.textContent = `${setBaffleHeight.value} px`;

    optBeat.checked = tricks.beatOn;
    setBeatPeriod.value = tricks.period;
    valBeatPeriod.textContent = `每 ${tricks.period} 拍`;
    optCool.checked = tricks.coolDown;
    optJam.checked = physics.tricks.jam;

    setRodGap.value = physics.rods.gap;
    valRodGap.textContent = `${setRodGap.value} mm`;

    setTimerSec.value = state.timerSeconds;
    valTimerSec.textContent = `${setTimerSec.value} 秒`;

    modalOwner.classList.remove('hidden');
    window.clawAudio.playClick();
  });

  setGuarantee.addEventListener('input', (e) => {
    valGuarantee.textContent = `${e.target.value} 元`;
  });
  setClawPower.addEventListener('input', (e) => {
    valClawPower.textContent = voltageLabel(e.target.value);
  });
  setDropPower.addEventListener('input', (e) => {
    valDropPower.textContent = voltageLabel(e.target.value);
  });
  setBaffleHeight.addEventListener('input', (e) => {
    valBaffleHeight.textContent = `${e.target.value} px`;
  });
  setBeatPeriod.addEventListener('input', (e) => {
    valBeatPeriod.textContent = `每 ${e.target.value} 拍`;
  });
  setRodGap.addEventListener('input', (e) => {
    valRodGap.textContent = `${e.target.value} mm`;
  });
  setTimerSec.addEventListener('input', (e) => {
    valTimerSec.textContent = `${e.target.value} 秒`;
  });

  btnSaveOwner.addEventListener('click', () => {
    state.guaranteePrice = parseInt(setGuarantee.value, 10);
    physics.settings.grabVoltage = parseInt(setClawPower.value, 10);
    physics.settings.carryVoltage = parseInt(setDropPower.value, 10);
    physics.settings.baffleHeight = parseInt(setBaffleHeight.value, 10);
    physics.chute.baffleHeight = physics.settings.baffleHeight;
    physics.rods.gap = parseInt(setRodGap.value, 10);
    tricks.beatOn = optBeat.checked;
    tricks.period = parseInt(setBeatPeriod.value, 10);
    tricks.coolDown = optCool.checked;
    physics.tricks.jam = optJam.checked;
    state.timerSeconds = parseInt(setTimerSec.value, 10);

    updateDisplays();
    modalOwner.classList.add('hidden');
    window.clawAudio.playClick();
  });

  btnCloseOwner.addEventListener('click', () => modalOwner.classList.add('hidden'));

  btnRefill.addEventListener('click', () => {
    physics.initDolls();
    window.clawAudio.playClick();
    alert('✅ 已重新鋪滿娃娃！');
  });

  btnClear.addEventListener('click', () => {
    physics.dolls = [];
    window.clawAudio.playClick();
  });

  document.getElementById('btn-clear-save').addEventListener('click', () => {
    if (!confirm('確定要清除所有戰利品與統計嗎？')) return;
    state.collection = {};
    state.totalCoinsInserted = 0;
    state.prizesWonCount = 0;
    state.tickets = 0;
    saveGame();
    updateDisplays();
  });

  btnResetAccum.addEventListener('click', () => {
    state.accumulatedPrice = 0;
    updateDisplays();
    window.clawAudio.playClick();
    alert('✅ 已歸零累積金額！');
  });

  // -------------------------------------------------------------
  // 操作指南秘笈視窗 (Help Modal)
  // -------------------------------------------------------------
  const btnHelp = document.getElementById('btn-help');
  const btnCloseHelp = document.getElementById('btn-close-help');
  const btnCloseHelpConfirm = document.getElementById('btn-close-help-confirm');

  btnHelp.addEventListener('click', () => {
    modalHelp.classList.remove('hidden');
    window.clawAudio.playClick();
  });
  btnCloseHelp.addEventListener('click', () => modalHelp.classList.add('hidden'));
  btnCloseHelpConfirm.addEventListener('click', () => modalHelp.classList.add('hidden'));

  // -------------------------------------------------------------
  // 聲音開關 (Sound Toggle)
  // -------------------------------------------------------------
  const btnSound = document.getElementById('btn-sound-toggle');
  btnSound.addEventListener('click', () => {
    const isEnabled = window.clawAudio.toggle();
    btnSound.textContent = isEnabled ? '🔊' : '🔇';
    btnSound.title = isEnabled ? '聲音開關 (目前開啟)' : '聲音開關 (目前靜音)';
  });

  // -------------------------------------------------------------
  // 夾換區 & 刮刮樂
  // -------------------------------------------------------------
  const modalExchange = document.getElementById('modal-exchange');
  const exchangeGrid = document.getElementById('exchange-grid');
  const exTicketCount = document.getElementById('ex-ticket-count');
  const exchangeItems = PRIZE_TYPES.filter(t => t.exchange);
  const SCRATCH_COST = 3;

  // 機頂夾換區展示：高價值的盒裝公仔、盲盒
  const shelfItems = document.getElementById('shelf-items');
  ['ex_console','ex_headphones','ex_brick','ex_speaker','ex_robot','ex_gold'].forEach((id, i) => {
    const type=PRIZE_TYPES.find(t=>t.id===id);
    const item=document.createElement('span');item.className='shelf-product';
    const img=document.createElement('img');img.src=getPrizeSprite(id,144);img.alt=type.name;
    const tag=document.createElement('span');tag.className='product-tag';tag.textContent=type.cost+' 券';
    item.append(img,tag);shelfItems.append(item);
  });

  function renderExchange() {
    exTicketCount.textContent = state.tickets;
    exchangeGrid.innerHTML = '';
    exchangeItems.forEach(item => {
      const owned = state.collection[item.id] || 0;
      const can = state.tickets >= item.cost;
      const card = document.createElement('div');
      card.className = 'exchange-card';
      card.style.setProperty('--rc', RARITY[item.rarity].color);
      card.innerHTML = `
        <img src="${getPrizeSprite(item.id, 84)}" alt="">
        <div class="ex-name">${item.name}</div>
        <div class="ex-owned">${owned ? '已擁有 ' + owned : item.perk}</div>
        <button class="btn-primary ex-btn" ${can ? '' : 'disabled'}>🎫 ${item.cost} 券 兌換</button>`;
      card.querySelector('button').addEventListener('click', () => {
        if (state.tickets < item.cost) return;
        state.tickets -= item.cost;
        state.collection[item.id] = (state.collection[item.id] || 0) + 1;
        saveGame();
        updateDisplays();
        window.clawAudio.playReveal(item.rarity);
        renderExchange();
      });
      exchangeGrid.appendChild(card);
    });
    document.getElementById('btn-scratch-buy').disabled = state.tickets < SCRATCH_COST || scratch.active;
  }

  function openExchange() {
    window.clawAudio.playClick();
    renderExchange();
    modalExchange.classList.remove('hidden');
  }
  document.getElementById('topper-shelf').addEventListener('click', openExchange);
  document.getElementById('scratch-rack').addEventListener('click', openExchange);
  document.getElementById('btn-close-exchange').addEventListener('click', () => modalExchange.classList.add('hidden'));
  document.getElementById('btn-exchange-close2').addEventListener('click', () => modalExchange.classList.add('hidden'));

  // 黑點刮刮卡：卡上有兩組中獎號碼(各對應一種獎項)，下面 12 個黑點各蓋著一個號碼，
  // 刮出的號碼和中獎號碼一樣就中獎 (實機最常見的刮法)
  function addCredits(n) {
    state.credits += n;
    updateDisplays();
    if (state.mode === 'IDLE') startNextRound();
  }

  function giveHiddenFigure() {
    const ssr = BLIND_FIGURES.filter(f => f.rarity === 'SSR');
    const fig = ssr[Math.floor(Math.random() * ssr.length)];
    state.collection[fig.id] = (state.collection[fig.id] || 0) + 1;
    return `隱藏款「${fig.name}」`;
  }

  const SMALL_REWARDS = [
    { w: 50, text: '加送 1 局', apply: () => { addCredits(1); } },
    { w: 35, text: '加送 3 局', apply: () => { addCredits(3); } },
    { w: 15, text: '保夾金額 +100', apply: () => { state.accumulatedPrice += 100; updateDisplays(); } }
  ];
  const BIG_REWARDS = [
    { w: 50, text: '加送 10 局', apply: () => { addCredits(10); } },
    { w: 30, text: '保夾金額 +200', apply: () => { state.accumulatedPrice += 200; updateDisplays(); } },
    { w: 20, text: '隱藏款公仔！', apply: () => giveHiddenFigure() }
  ];

  function pickWeighted(list) {
    const total = list.reduce((s, r) => s + r.w, 0);
    let roll = Math.random() * total;
    for (const r of list) { roll -= r.w; if (roll <= 0) return r; }
    return list[0];
  }

  const DOT_COUNT = 12;
  const dcWins = document.getElementById('dc-wins');
  const dcGrid = document.getElementById('dc-grid');
  const dcStatus = document.getElementById('dc-status');
  const btnScratchBuy = document.getElementById('btn-scratch-buy');
  const btnScratchAll = document.getElementById('btn-scratch-all');
  const scratch = { active: false, dots: [], wins: [], drawing: false };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function paintDot(canvas) {
    const c = canvas.getContext('2d');
    const S = canvas.width;
    c.globalCompositeOperation = 'source-over';
    const g = c.createRadialGradient(S * 0.36, S * 0.3, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#5a5a62'); g.addColorStop(0.45, '#1c1c20'); g.addColorStop(1, '#050507');
    c.fillStyle = g;
    c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.beginPath(); c.ellipse(S * 0.36, S * 0.28, S * 0.2, S * 0.1, -0.5, 0, Math.PI * 2); c.fill();
  }

  // 發牌：決定這張卡中不中、中哪個獎，再把號碼排進 12 個黑點
  function dealCard() {
    const nums = [];
    while (nums.length < DOT_COUNT + 2) {
      const n = 1 + Math.floor(Math.random() * 40);
      if (!nums.includes(n)) nums.push(n);
    }
    const winA = { num: nums[0], reward: pickWeighted(SMALL_REWARDS) };
    const winB = { num: nums[1], reward: pickWeighted(BIG_REWARDS) };
    const dotNums = nums.slice(2);

    const roll = Math.random();
    const hit = roll < 0.40 ? [] : roll < 0.80 ? [winA] : roll < 0.97 ? [winB] : [winA, winB];
    const slots = [...Array(DOT_COUNT).keys()].sort(() => Math.random() - 0.5);
    hit.forEach((w, i) => { dotNums[slots[i]] = w.num; });
    return { wins: [winA, winB], dotNums };
  }

  function renderCard(card) {
    dcWins.innerHTML = card.wins.map(w =>
      `<div class="dc-win"><b>${pad2(w.num)}</b><span>${w.reward.text}</span></div>`).join('');
    dcGrid.innerHTML = '';
    scratch.dots = card.dotNums.map((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'dc-cell';
      cell.innerHTML = `<span class="dc-num">${pad2(num)}</span>`;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      canvas.className = 'dc-coat';
      paintDot(canvas);
      cell.appendChild(canvas);
      dcGrid.appendChild(cell);
      return { num, cell, canvas, ctx: canvas.getContext('2d'), revealed: false };
    });
  }

  // 只計算圓形黑點「內部」被刮掉的比例 (方形畫布的四個角本來就是透明的)
  function dotCoverage(dot) {
    const S = dot.canvas.width, R = S / 2;
    const data = dot.ctx.getImageData(0, 0, S, S).data;
    let clear = 0, total = 0;
    for (let y = 1; y < S; y += 3) {
      for (let x = 1; x < S; x += 3) {
        if ((x - R) * (x - R) + (y - R) * (y - R) > R * R) continue;
        total++;
        if (data[(y * S + x) * 4 + 3] < 40) clear++;
      }
    }
    return clear / total;
  }

  function revealDot(dot, auto) {
    if (dot.revealed) return;
    dot.revealed = true;
    dot.canvas.classList.add('gone');
    const win = scratch.wins.find(w => w.num === dot.num && !w.claimed);
    if (win) {
      win.claimed = true;
      dot.cell.classList.add('hit');
      const msg = win.reward.apply();
      dcStatus.textContent = `🎉 刮中 ${pad2(win.num)}！${win.reward.text}${typeof msg === 'string' ? '（' + msg + '）' : ''}`;
      saveGame();
      updateDisplays();
      window.clawAudio.playReveal(win.reward.text.includes('隱藏') ? 'SSR' : 'R');
    } else if (!auto) {
      window.clawAudio.playClick();
    }
    if (scratch.dots.every(d => d.revealed)) finishCard();
  }

  function finishCard() {
    scratch.active = false;
    btnScratchAll.disabled = true;
    if (!scratch.wins.some(w => w.claimed)) dcStatus.textContent = '銘謝惠顧，再刮一張試試手氣！';
    renderExchange();
  }

  btnScratchBuy.addEventListener('click', () => {
    if (state.tickets < SCRATCH_COST || scratch.active) return;
    state.tickets -= SCRATCH_COST;
    saveGame();
    updateDisplays();
    const card = dealCard();
    scratch.wins = card.wins.map(w => ({ ...w, claimed: false }));
    scratch.active = true;
    renderCard(card);
    dcStatus.textContent = '用滑鼠／手指刮開黑點！';
    btnScratchAll.disabled = false;
    window.clawAudio.playClick();
    renderExchange();
  });

  btnScratchAll.addEventListener('click', () => {
    scratch.dots.forEach(d => revealDot(d, true));
  });

  // 刮除：用指標事件找出手指下方的黑點，在上面挖洞
  function scratchPoint(clientX, clientY) {
    if (!scratch.active) return;
    const el = document.elementFromPoint(clientX, clientY);
    const dot = scratch.dots.find(d => d.canvas === el);
    if (!dot || dot.revealed) return;
    const rect = dot.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (dot.canvas.width / rect.width);
    const y = (clientY - rect.top) * (dot.canvas.height / rect.height);
    dot.ctx.globalCompositeOperation = 'destination-out';
    dot.ctx.fillStyle = '#000'; // destination-out 依來源透明度擦除，必須用不透明色
    dot.ctx.beginPath();
    dot.ctx.arc(x, y, 11, 0, Math.PI * 2);
    dot.ctx.fill();
    dot.touched = true;
  }

  function scratchSettle() {
    scratch.dots.forEach(d => {
      if (d.touched && !d.revealed && dotCoverage(d) > 0.55) revealDot(d, false);
    });
  }

  dcGrid.addEventListener('pointerdown', (e) => {
    scratch.drawing = true;
    try { dcGrid.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件沒有作用中的指標 */ }
    scratchPoint(e.clientX, e.clientY);
    e.preventDefault();
  });
  dcGrid.addEventListener('pointermove', (e) => {
    if (!scratch.drawing) return;
    scratchPoint(e.clientX, e.clientY);
    scratchSettle();
  });
  const dcEnd = () => {
    if (!scratch.drawing) return;
    scratch.drawing = false;
    scratchSettle();
  };
  dcGrid.addEventListener('pointerup', dcEnd);
  dcGrid.addEventListener('pointercancel', dcEnd);

  // 開始前先畫一張「空白卡」(黑點不能刮)
  renderCard({ wins: [{ num: 7, reward: { text: '加送 3 局' } }, { num: 23, reward: { text: '大獎' } }], dotNums: [...Array(DOT_COUNT).keys()].map(i => i + 1) });
  scratch.dots = [];

  // -------------------------------------------------------------
  // 本機獎品跑馬展示條 + 背景漂浮裝飾
  // -------------------------------------------------------------
  const tickerTrack = document.getElementById('ticker-track');
  const tickerHTML = PRIZE_TYPES.filter(t => t.spawn > 0).map(t => {
    const r = RARITY[t.rarity];
    return `<div class="ticker-item" style="--rc:${r.color}" title="${t.name}">
      <img src="${getPrizeSprite(t.id, 56)}" alt="${t.name}">
      <span>${t.name}</span>
    </div>`;
  }).join('');
  tickerTrack.innerHTML = tickerHTML + tickerHTML; // 複製一份做無縫循環

  const ambient = document.querySelector('.ambient-lights');
  const deco = ['⭐', '💖', '✨', '🫧', '🍬', '🧸', '🌸'];
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('span');
    el.className = 'float-deco';
    el.textContent = deco[i % deco.length];
    el.style.left = `${(i * 97) % 100}%`;
    el.style.fontSize = `${14 + (i * 7) % 18}px`;
    el.style.animationDuration = `${14 + (i * 5) % 14}s`;
    el.style.animationDelay = `${-(i * 3) % 20}s`;
    ambient.appendChild(el);
  }

  // 開發除錯用：在 console 可用 clawDebug.physics / clawDebug.state 檢查機台
  window.clawDebug = { physics, state };

  // 初始化首次顯示
  updateDisplays();
});

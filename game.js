/**
 * 台灣飛絡力夾娃娃機 遊戲主邏輯控制器 (Game Controller)
 * 整合狀態機、投幣保夾邏輯、實體搖桿手感與二停下爪系統
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const physics = new ClawPhysics(canvas);

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
    } catch (e) { /* 無痕模式或資料損毀就當作新遊戲 */ }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        collection: state.collection,
        totalCoinsInserted: state.totalCoinsInserted,
        prizesWonCount: state.prizesWonCount
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
  const elActionText = document.getElementById('action-status-text');
  const elGuaranteeBulb = document.getElementById('guarantee-bulb');
  const elGuaranteePill = document.getElementById('marquee-guarantee-pill');

  // 統計列
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
    physics.claw.openRatio = 0.15; // 閉合
    window.clawAudio.playClawSnap();

    // 進行抓取碰撞判定
    const caught = physics.attemptGrab();
    elActionText.textContent = caught ? '🎯 抓到了！準備上升...' : '爪子閉合，未抓中！';

    // 爪子閉合後短暫停頓 0.35 秒開始上升
    setTimeout(() => {
      state.mode = 'ASCENDING';
      elBtnDrop.disabled = true;
      const cap = elBtnDrop.querySelector('.btn-text');
      if (cap) cap.textContent = '上升中';
      elActionText.textContent = '爪子上升中...';
    }, 350);
  }

  // 獲勝出貨事件監聽
  physics.onPrizeWon = (prizeType) => {
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
    elWinRarity.innerHTML = rarityBadgeHTML(prizeType.rarity);
    elWinDesc.textContent = prizeType.blind ? '到底會開出什麼呢？快拆開看看！' : prizeType.perk;
    elWinSpent.textContent = `累計投幣: ${state.totalCoinsInserted} 元`;
    elWinTag.textContent = wasGuaranteed ? '👑 保夾出貨' : '🎯 技術取物';
    elWinTag.style.background = wasGuaranteed ? '#ffd54a' : '#7be0c3';

    elBtnOpenBlind.classList.toggle('hidden', !prizeType.blind);
    elBtnCollectPrize.classList.toggle('hidden', !!prizeType.blind);
    elBtnCollectPrize.textContent = '放入背包';

    elWinOverlay.classList.remove('hidden');

    // 震動出貨門效果
    elChuteFlap.style.transform = 'perspective(300px) rotateX(35deg)';
    setTimeout(() => { elChuteFlap.style.transform = ''; }, 600);
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
  }

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
        physics.checkDropPowerRelease();
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
    physics.render();

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
  const setTimerSec = document.getElementById('set-timer-sec');
  const valTimerSec = document.getElementById('val-timer-sec');

  const btnRefill = document.getElementById('btn-refill-dolls');
  const btnClear = document.getElementById('btn-clear-dolls');
  const btnResetAccum = document.getElementById('btn-reset-accumulated');

  btnOwner.addEventListener('click', () => {
    // 帶入目前設定值
    setGuarantee.value = state.guaranteePrice;
    valGuarantee.textContent = `${state.guaranteePrice} 元`;

    setClawPower.value = Math.round(physics.settings.clawPower * 100);
    valClawPower.textContent = `${setClawPower.value}%`;

    setDropPower.value = Math.round(physics.settings.dropPower * 100);
    valDropPower.textContent = `${setDropPower.value}%`;

    setBaffleHeight.value = physics.settings.baffleHeight;
    valBaffleHeight.textContent = `${setBaffleHeight.value} px`;

    setTimerSec.value = state.timerSeconds;
    valTimerSec.textContent = `${setTimerSec.value} 秒`;

    modalOwner.classList.remove('hidden');
    window.clawAudio.playClick();
  });

  setGuarantee.addEventListener('input', (e) => {
    valGuarantee.textContent = `${e.target.value} 元`;
  });
  setClawPower.addEventListener('input', (e) => {
    valClawPower.textContent = `${e.target.value}%`;
  });
  setDropPower.addEventListener('input', (e) => {
    valDropPower.textContent = `${e.target.value}%`;
  });
  setBaffleHeight.addEventListener('input', (e) => {
    valBaffleHeight.textContent = `${e.target.value} px`;
  });
  setTimerSec.addEventListener('input', (e) => {
    valTimerSec.textContent = `${e.target.value} 秒`;
  });

  btnSaveOwner.addEventListener('click', () => {
    state.guaranteePrice = parseInt(setGuarantee.value, 10);
    physics.settings.clawPower = parseInt(setClawPower.value, 10) / 100;
    physics.settings.dropPower = parseInt(setDropPower.value, 10) / 100;
    physics.settings.baffleHeight = parseInt(setBaffleHeight.value, 10);
    physics.chute.baffleHeight = physics.settings.baffleHeight;
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
  // 本機獎品跑馬展示條 + 背景漂浮裝飾
  // -------------------------------------------------------------
  const tickerTrack = document.getElementById('ticker-track');
  const tickerHTML = PRIZE_TYPES.map(t => {
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

/**
 * 獎品圖鑑與手繪渲染 (Prize Catalog & Procedural Art)
 * - 全部獎品用 Canvas 立體漸層「畫」出來，不依賴外部圖檔
 * - 娃娃 / 食物抱枕 / 公仔盒 / 盲盒 / 扭蛋
 * - 盲盒開箱：依稀有度抽出盲盒公仔 (含隱藏款)
 */
(function () {
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------
  // 稀有度與分類
  // ------------------------------------------------------------------
  const RARITY = {
    N:   { label: '普通',   color: '#6fa8ff' },
    R:   { label: '稀有',   color: '#b57cff' },
    SR:  { label: '超稀有', color: '#ff7ab8' },
    SSR: { label: '隱藏款', color: '#ffb81f' }
  };

  const CATEGORY_LABEL = {
    snack: '🍿 山崩零食',
    plush: '🧸 療癒娃娃',
    pillow: '🍉 食物抱枕',
    figurebox: '📦 公仔盒',
    capsule: '🥚 扭蛋',
    exchange: '🎫 夾換限定',
    blindfig: '🎁 盲盒公仔'
  };

  // ------------------------------------------------------------------
  // 繪圖小工具
  // ------------------------------------------------------------------
  function parseHex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // amt: -1 (變黑) ~ 1 (變白)
  function shade(hex, amt) {
    const [r, g, b] = parseHex(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const f = v => Math.round((t - v) * p + v);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function sphere(ctx, x, y, r, color, hl = 0.5, dk = 0.3) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.02);
    g.addColorStop(0, shade(color, hl));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -dk));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // 立體橢圓 (拉伸的球)
  function ellG(ctx, x, y, rx, ry, color, rot = 0, hl = 0.45, dk = 0.28) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(rx, ry);
    sphere(ctx, 0, 0, 1, color, hl, dk);
    ctx.restore();
  }

  function ell(ctx, x, y, rx, ry, fill, rot = 0) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
  }

  function gloss(ctx, x, y, rx, ry, rot = -0.6, a = 0.5) {
    ell(ctx, x, y, rx, ry, `rgba(255,255,255,${a})`, rot);
  }

  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tri(ctx, pts, fill, round = 4) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineJoin = 'round';
    ctx.lineWidth = round;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function starPath(ctx, x, y, R, rIn, n = 5, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? rIn : R;
      const a = rot + (i * Math.PI) / n;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  }

  function sparkle(ctx, x, y, s, color = '#fff') {
    ctx.fillStyle = color;
    starPath(ctx, x, y, s, s * 0.28, 4, 0);
    ctx.fill();
  }

  const INK = '#3a2a3f';

  function eyes(ctx, y, spread, s) {
    for (const d of [-1, 1]) {
      ell(ctx, d * spread, y, s * 0.85, s * 1.1, INK);
      ell(ctx, d * spread - s * 0.3, y - s * 0.4, s * 0.36, s * 0.36, '#fff');
      ell(ctx, d * spread + s * 0.25, y + s * 0.35, s * 0.18, s * 0.18, 'rgba(255,255,255,.85)');
    }
  }

  function blush(ctx, y, spread, s) {
    for (const d of [-1, 1]) ell(ctx, d * spread, y, s * 1.25, s * 0.72, 'rgba(255,120,160,.5)');
  }

  // style: 'u' 小微笑 / 'w' 貓嘴 / 'o' 圓嘴
  function mouth(ctx, y, w, style = 'u') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, w * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (style === 'w') {
      ctx.moveTo(-w, y);
      ctx.quadraticCurveTo(-w * 0.5, y + w * 0.9, 0, y);
      ctx.quadraticCurveTo(w * 0.5, y + w * 0.9, w, y);
    } else if (style === 'o') {
      ctx.arc(0, y + w * 0.3, w * 0.45, 0, TAU);
    } else {
      ctx.moveTo(-w, y);
      ctx.quadraticCurveTo(0, y + w * 1.3, w, y);
    }
    ctx.stroke();
  }

  function bow(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    for (const d of [-1, 1]) {
      ctx.fillStyle = lg(ctx, 0, -s, 0, s, [shade(color, 0.35), color, shade(color, -0.25)]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(d * s * 0.9, -s * 1.1, d * s * 1.15, -s * 0.1);
      ctx.quadraticCurveTo(d * s * 0.9, s * 1.0, 0, 0);
      ctx.fill();
    }
    sphere(ctx, 0, 0, s * 0.32, color, 0.5, 0.3);
    ctx.restore();
  }

  function box3d(ctx, x0, y0, x1, y1, dx, dy, front, top, side) {
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(x1, y0); ctx.lineTo(x1 + dx, y0 + dy); ctx.lineTo(x1 + dx, y1 + dy); ctx.lineTo(x1, y1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.lineTo(x1 + dx, y0 + dy); ctx.lineTo(x1, y0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = front;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(60,30,80,.28)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.moveTo(x1, y0); ctx.lineTo(x1 + dx, y0 + dy); ctx.lineTo(x1 + dx, y1 + dy); ctx.lineTo(x1, y1);
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.lineTo(x1 + dx, y0 + dy);
    ctx.stroke();
  }

  // ------------------------------------------------------------------
  // Q 版小公仔 (盲盒公仔 / 公仔盒內的角色)
  // ------------------------------------------------------------------
  function hatBack(ctx, hr, hy, cfg) {
    const hc = cfg.hatColor || '#ffffff';
    const hat = cfg.hat;
    if (hat === 'bunny') {
      for (const d of [-1, 1]) {
        ctx.save(); ctx.translate(d * hr * 0.45, hy - hr * 1.1); ctx.rotate(d * 0.16);
        ellG(ctx, 0, 0, hr * 0.26, hr * 0.7, hc);
        ell(ctx, 0, hr * 0.05, hr * 0.13, hr * 0.5, '#ffb3cc');
        ctx.restore();
      }
    } else if (hat === 'cat') {
      for (const d of [-1, 1]) {
        tri(ctx, [[d * hr * 0.95, hy - hr * 0.1], [d * hr * 0.8, hy - hr * 1.1], [d * hr * 0.2, hy - hr * 0.8]], hc, hr * 0.14);
        tri(ctx, [[d * hr * 0.78, hy - hr * 0.4], [d * hr * 0.72, hy - hr * 0.85], [d * hr * 0.4, hy - hr * 0.7]], '#ffb0c4', hr * 0.06);
      }
    } else if (hat === 'bear') {
      for (const d of [-1, 1]) {
        sphere(ctx, d * hr * 0.78, hy - hr * 0.72, hr * 0.32, hc);
        ell(ctx, d * hr * 0.78, hy - hr * 0.72, hr * 0.17, hr * 0.17, '#ffc0cf');
      }
    } else if (hat === 'dog') {
      for (const d of [-1, 1]) ellG(ctx, d * hr * 1.0, hy + hr * 0.2, hr * 0.3, hr * 0.58, hc, d * 0.25);
    }
  }

  function hatFront(ctx, hr, hy, cfg) {
    const hc = cfg.hatColor || '#ffffff';
    switch (cfg.hat) {
      case 'unicorn': {
        tri(ctx, [[-hr * 0.17, hy - hr * 0.88], [0, hy - hr * 1.65], [hr * 0.17, hy - hr * 0.88]], '#ffd54a', hr * 0.06);
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-hr * 0.12, hy - hr * 1.1); ctx.lineTo(hr * 0.12, hy - hr * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-hr * 0.09, hy - hr * 1.3); ctx.lineTo(hr * 0.09, hy - hr * 1.4); ctx.stroke();
        for (const d of [-1, 1]) tri(ctx, [[d * hr * 0.6, hy - hr * 0.7], [d * hr * 0.85, hy - hr * 1.05], [d * hr * 0.35, hy - hr * 0.9]], '#ffe3f1', hr * 0.1);
        break;
      }
      case 'crown': {
        ctx.fillStyle = lg(ctx, 0, hy - hr * 1.4, 0, hy - hr * 0.8, ['#fff2a8', '#ffc21f', '#d79300']);
        ctx.strokeStyle = '#b87800'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-hr * 0.58, hy - hr * 0.78);
        ctx.lineTo(-hr * 0.66, hy - hr * 1.38);
        ctx.lineTo(-hr * 0.3, hy - hr * 1.08);
        ctx.lineTo(0, hy - hr * 1.5);
        ctx.lineTo(hr * 0.3, hy - hr * 1.08);
        ctx.lineTo(hr * 0.66, hy - hr * 1.38);
        ctx.lineTo(hr * 0.58, hy - hr * 0.78);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        sphere(ctx, 0, hy - hr * 0.95, hr * 0.1, '#ff4d8d');
        sphere(ctx, -hr * 0.34, hy - hr * 0.92, hr * 0.07, '#5ad1ff');
        sphere(ctx, hr * 0.34, hy - hr * 0.92, hr * 0.07, '#5ad1ff');
        break;
      }
      case 'strawberry': {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.55, hr * 1.0, hr * 0.8, 0, Math.PI, TAU); ctx.closePath();
        ctx.fillStyle = lg(ctx, -hr, hy - hr * 1.3, hr, hy - hr * 0.5, ['#ff9aa8', '#ff4d6a', '#d62849']);
        ctx.fill(); ctx.clip();
        ctx.fillStyle = '#ffe9a0';
        [[-0.55, -1.0], [-0.1, -1.2], [0.4, -1.05], [-0.3, -0.75], [0.2, -0.75], [0.65, -0.72], [-0.7, -0.7]].forEach(([sx, sy]) => ell(ctx, sx * hr, hy + sy * hr, hr * 0.05, hr * 0.08, '#ffe9a0'));
        ctx.restore();
        for (const d of [-1, 1]) ellG(ctx, d * hr * 0.2, hy - hr * 1.38, hr * 0.28, hr * 0.12, '#5cc46b', d * 0.5);
        break;
      }
      case 'boba': {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.5, hr * 1.0, hr * 0.78, 0, Math.PI, TAU); ctx.closePath();
        ctx.fillStyle = lg(ctx, -hr, hy - hr * 1.2, hr, hy, ['#e8c9a2', '#c79a6a', '#a47446']);
        ctx.fill(); ctx.clip();
        [[-0.6, -0.8], [-0.2, -1.05], [0.3, -0.95], [0.65, -0.7], [0.05, -0.65], [-0.5, -0.55]].forEach(([sx, sy]) => sphere(ctx, sx * hr, hy + sy * hr, hr * 0.14, '#3b2a22', 0.3, 0.2));
        ctx.restore();
        ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = hr * 0.16; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hr * 0.35, hy - hr * 1.0); ctx.lineTo(hr * 0.7, hy - hr * 1.6); ctx.stroke();
        break;
      }
      case 'chef': {
        ctx.fillStyle = lg(ctx, 0, hy - hr * 1.5, 0, hy - hr * 0.8, [shade(hc, 0.3), hc, shade(hc, -0.18)]);
        for (const [sx, sy, sr] of [[-0.5, -1.15, 0.42], [0.5, -1.15, 0.42], [0, -1.35, 0.5]]) sphere(ctx, sx * hr, hy + sy * hr, sr * hr, hc, 0.4, 0.15);
        rr(ctx, -hr * 0.7, hy - hr * 1.0, hr * 1.4, hr * 0.28, hr * 0.08);
        ctx.fillStyle = lg(ctx, 0, hy - hr, 0, hy - hr * 0.7, [shade(hc, 0.2), shade(hc, -0.12)]);
        ctx.fill();
        break;
      }
      case 'star': {
        ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#d99a00'; ctx.lineWidth = 1.2;
        starPath(ctx, 0, hy - hr * 1.15, hr * 0.5, hr * 0.22); ctx.fill(); ctx.stroke();
        break;
      }
      case 'dino': {
        ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.05, hr * 1.1, hr * 1.0, 0, Math.PI, TAU); ctx.closePath();
        ctx.fillStyle = lg(ctx, -hr, hy - hr, hr, hy, [shade(hc, 0.3), hc, shade(hc, -0.25)]);
        ctx.fill();
        for (const sx of [-0.45, 0, 0.45]) tri(ctx, [[sx * hr - hr * 0.16, hy - hr * 0.88], [sx * hr, hy - hr * 1.3], [sx * hr + hr * 0.16, hy - hr * 0.88]], '#ffb347', hr * 0.06);
        for (const d of [-1, 1]) { sphere(ctx, d * hr * 0.45, hy - hr * 0.5, hr * 0.18, '#fff'); ell(ctx, d * hr * 0.45, hy - hr * 0.48, hr * 0.07, hr * 0.09, INK); }
        break;
      }
    }
  }

  function drawRobot(ctx, r, cfg) {
    const c = cfg.outfit || '#4aa8ff';
    const acc = cfg.accent || '#ffd54a';
    // 腳與身體
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.2, r * 0.9, r * 0.17, r * 0.1, '#6b7a99');
    rr(ctx, -r * 0.36, r * 0.25, r * 0.72, r * 0.62, r * 0.14);
    ctx.fillStyle = lg(ctx, -r * 0.36, 0, r * 0.36, 0, [shade(c, 0.35), c, shade(c, -0.3)]); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,70,.35)'; ctx.lineWidth = 1; ctx.stroke();
    sphere(ctx, 0, r * 0.52, r * 0.13, acc, 0.5, 0.2);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.46, r * 0.55, r * 0.11, r * 0.2, '#c5cfe6', d * 0.15);
    // 頭
    ctx.strokeStyle = '#7d8aa8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r * 0.86); ctx.lineTo(0, -r * 1.12); ctx.stroke();
    sphere(ctx, 0, -r * 1.16, r * 0.1, '#ff4d6a', 0.5, 0.2);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.6, -r * 0.45, r * 0.1, r * 0.2, acc);
    rr(ctx, -r * 0.55, -r * 0.88, r * 1.1, r * 0.86, r * 0.22);
    ctx.fillStyle = lg(ctx, -r * 0.55, -r * 0.88, r * 0.55, 0, [shade(c, 0.5), c, shade(c, -0.25)]); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,70,.35)'; ctx.stroke();
    rr(ctx, -r * 0.42, -r * 0.7, r * 0.84, r * 0.42, r * 0.14);
    ctx.fillStyle = '#1b2440'; ctx.fill();
    for (const d of [-1, 1]) {
      ell(ctx, d * r * 0.18, -r * 0.49, r * 0.09, r * 0.11, '#6bf3ff');
      ell(ctx, d * r * 0.2, -r * 0.52, r * 0.03, r * 0.03, '#fff');
    }
    mouth(ctx, -r * 0.2, r * 0.07, 'u');
    gloss(ctx, -r * 0.3, -r * 0.8, r * 0.18, r * 0.07, -0.4, 0.55);
  }

  function drawChibi(ctx, r, cfg) {
    if (cfg.kind === 'robot') return drawRobot(ctx, r, cfg);
    const skin = cfg.skin || '#ffe3cf';
    const hair = cfg.hair || '#7a4b2a';
    const outfit = cfg.outfit || '#ff7aa8';
    const hy = -r * 0.22;
    const hr = r * 0.64;

    if (cfg.glow) {
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
      g.addColorStop(0, 'rgba(255,230,120,.55)');
      g.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill();
    }

    hatBack(ctx, hr, hy, cfg);

    // 身體
    rr(ctx, -r * 0.34, r * 0.32, r * 0.68, r * 0.56, r * 0.2);
    ctx.fillStyle = lg(ctx, -r * 0.34, 0, r * 0.34, 0, [shade(outfit, 0.35), outfit, shade(outfit, -0.28)]);
    ctx.fill();
    for (const d of [-1, 1]) {
      sphere(ctx, d * r * 0.42, r * 0.55, r * 0.11, skin, 0.3, 0.12);
      ellG(ctx, d * r * 0.17, r * 0.92, r * 0.16, r * 0.09, shade(outfit, -0.3));
    }

    // 後髮 + 頭
    ell(ctx, 0, hy + hr * 0.18, hr * 1.1, hr * 1.04, hair);
    sphere(ctx, 0, hy, hr, skin, 0.35, 0.12);

    // 瀏海
    ctx.fillStyle = lg(ctx, 0, hy - hr, 0, hy + hr * 0.3, [shade(hair, 0.25), hair]);
    ctx.beginPath();
    ctx.moveTo(-hr * 1.03, hy + hr * 0.05);
    ctx.arc(0, hy, hr * 1.03, Math.PI, TAU);
    ctx.lineTo(hr * 1.0, hy + hr * 0.1);
    ctx.quadraticCurveTo(hr * 0.72, hy + hr * 0.52, hr * 0.38, hy + hr * 0.14);
    ctx.quadraticCurveTo(hr * 0.1, hy + hr * 0.5, -hr * 0.2, hy + hr * 0.12);
    ctx.quadraticCurveTo(-hr * 0.5, hy + hr * 0.48, -hr * 0.76, hy + hr * 0.1);
    ctx.closePath();
    ctx.fill();

    // 臉
    eyes(ctx, hy + hr * 0.28, hr * 0.4, hr * 0.14);
    blush(ctx, hy + hr * 0.6, hr * 0.64, hr * 0.12);
    mouth(ctx, hy + hr * 0.62, hr * 0.12, 'u');

    hatFront(ctx, hr, hy, cfg);

    if (cfg.glow) {
      sparkle(ctx, -r * 0.95, -r * 0.9, r * 0.2, '#fff6b0');
      sparkle(ctx, r * 0.95, -r * 0.5, r * 0.15, '#fff6b0');
      sparkle(ctx, r * 0.8, r * 0.7, r * 0.12, '#fff');
    }
  }

  function drawPedestal(ctx, r, cfg) {
    ell(ctx, 0, r * 0.98, r * 0.85, r * 0.2, 'rgba(60,30,80,.18)');
    const g = lg(ctx, -r * 0.8, 0, r * 0.8, 0, ['#fff', cfg.base || '#ffd6ea', '#e7a4c8']);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.8, r * 0.18, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(0, -r * 0.05);
    ctx.scale(0.9, 0.9);
    drawChibi(ctx, r, cfg);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // 娃娃類
  // ------------------------------------------------------------------
  function drawBear(ctx, r) {
    const c = '#b98150';
    for (const d of [-1, 1]) { sphere(ctx, d * r * 0.66, -r * 0.7, r * 0.34, c); ell(ctx, d * r * 0.66, -r * 0.68, r * 0.18, r * 0.18, '#f6b3bb'); }
    sphere(ctx, 0, 0, r, c, 0.45, 0.32);
    ellG(ctx, 0, r * 0.3, r * 0.44, r * 0.34, '#f6dcbc', 0, 0.3, 0.12);
    ell(ctx, 0, r * 0.15, r * 0.11, r * 0.08, '#4b3126');
    eyes(ctx, -r * 0.15, r * 0.4, r * 0.1);
    mouth(ctx, r * 0.3, r * 0.1, 'w');
    blush(ctx, r * 0.12, r * 0.7, r * 0.1);
    bow(ctx, 0, r * 0.88, r * 0.3, '#ff5d8f');
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.13, -0.7, 0.4);
  }

  function drawBunny(ctx, r) {
    const c = '#ffe3ee';
    for (const d of [-1, 1]) {
      ctx.save(); ctx.translate(d * r * 0.4, -r * 1.05); ctx.rotate(d * 0.18);
      ellG(ctx, 0, 0, r * 0.25, r * 0.7, c, 0, 0.3, 0.18);
      ell(ctx, 0, r * 0.05, r * 0.12, r * 0.5, '#ffb3cc');
      ctx.restore();
    }
    sphere(ctx, 0, 0, r, c, 0.4, 0.2);
    eyes(ctx, -r * 0.05, r * 0.4, r * 0.1);
    ell(ctx, 0, r * 0.15, r * 0.08, r * 0.06, '#ff7fa6');
    mouth(ctx, r * 0.24, r * 0.09, 'w');
    blush(ctx, r * 0.22, r * 0.68, r * 0.1);
    bow(ctx, r * 0.55, -r * 0.72, r * 0.24, '#7ec8ff');
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.13, -0.7, 0.55);
  }

  function drawCapybara(ctx, r) {
    const c = '#a9744f';
    for (const d of [-1, 1]) sphere(ctx, d * r * 0.7, -r * 0.62, r * 0.2, '#8a5a3a');
    sphere(ctx, 0, 0, r, c, 0.4, 0.32);
    ellG(ctx, 0, r * 0.3, r * 0.58, r * 0.4, '#c99a73', 0, 0.3, 0.15);
    for (const d of [-1, 1]) ell(ctx, d * r * 0.17, r * 0.18, r * 0.07, r * 0.05, '#5a3a28');
    eyes(ctx, -r * 0.12, r * 0.52, r * 0.085);
    mouth(ctx, r * 0.45, r * 0.12, 'u');
    blush(ctx, r * 0.1, r * 0.8, r * 0.09);
    // 頭頂蜜柑
    sphere(ctx, 0, -r * 0.98, r * 0.3, '#ff9f1c', 0.5, 0.3);
    ellG(ctx, r * 0.1, -r * 1.3, r * 0.17, r * 0.08, '#4cb85a', -0.4);
    gloss(ctx, -r * 0.08, -r * 1.06, r * 0.1, r * 0.06, -0.6, 0.6);
    gloss(ctx, -r * 0.45, -r * 0.45, r * 0.24, r * 0.12, -0.7, 0.32);
  }

  function drawShiba(ctx, r) {
    const c = '#f0a04b';
    for (const d of [-1, 1]) {
      tri(ctx, [[d * r * 0.88, -r * 0.3], [d * r * 0.72, -r * 1.18], [d * r * 0.12, -r * 0.8]], shade(c, -0.08), r * 0.16);
      tri(ctx, [[d * r * 0.7, -r * 0.55], [d * r * 0.64, -r * 0.95], [d * r * 0.3, -r * 0.78]], '#ffc7b8', r * 0.06);
    }
    sphere(ctx, 0, 0, r, c, 0.4, 0.3);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.34, r * 0.3, r * 0.4, r * 0.32, '#fff2dc', 0, 0.2, 0.08);
    ellG(ctx, 0, r * 0.42, r * 0.3, r * 0.22, '#fff2dc', 0, 0.2, 0.08);
    for (const d of [-1, 1]) ell(ctx, d * r * 0.4, -r * 0.42, r * 0.09, r * 0.06, '#fff2dc');
    eyes(ctx, -r * 0.14, r * 0.4, r * 0.1);
    ell(ctx, 0, r * 0.2, r * 0.1, r * 0.075, INK);
    mouth(ctx, r * 0.36, r * 0.12, 'w');
    blush(ctx, r * 0.18, r * 0.72, r * 0.09);
    // 紅項圈
    ctx.strokeStyle = '#e8445a'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.93, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke();
    sphere(ctx, 0, r * 0.97, r * 0.11, '#ffd54a', 0.5, 0.2);
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.12, -0.7, 0.36);
  }

  function drawCat(ctx, r) {
    const c = '#fffaf2';
    for (const d of [-1, 1]) {
      tri(ctx, [[d * r * 0.9, -r * 0.2], [d * r * 0.78, -r * 1.12], [d * r * 0.15, -r * 0.8]], d < 0 ? '#f2a65a' : '#fff3e3', r * 0.16);
      tri(ctx, [[d * r * 0.72, -r * 0.5], [d * r * 0.68, -r * 0.9], [d * r * 0.34, -r * 0.76]], '#ffb0c4', r * 0.06);
    }
    sphere(ctx, 0, 0, r, c, 0.2, 0.2);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    sphere(ctx, r * 0.5, -r * 0.55, r * 0.42, '#f2a65a', 0.35, 0.2);
    sphere(ctx, -r * 0.62, r * 0.42, r * 0.3, '#ffc98a', 0.3, 0.15);
    ctx.restore();
    eyes(ctx, -r * 0.02, r * 0.4, r * 0.1);
    ell(ctx, 0, r * 0.18, r * 0.07, r * 0.05, '#ff7fa6');
    mouth(ctx, r * 0.27, r * 0.1, 'w');
    blush(ctx, r * 0.22, r * 0.7, r * 0.1);
    ctx.strokeStyle = 'rgba(60,40,60,.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (const d of [-1, 1]) for (const k of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(d * r * 0.62, r * 0.2 + k * r * 0.02); ctx.lineTo(d * r * 0.95, r * 0.12 + k * r * 0.14); ctx.stroke();
    }
    ctx.strokeStyle = '#e8445a'; ctx.lineWidth = r * 0.11;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.94, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke();
    sphere(ctx, 0, r * 0.98, r * 0.13, '#ffd54a', 0.55, 0.25);
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.12, -0.7, 0.5);
  }

  function drawPenguin(ctx, r) {
    const c = '#3f5f94';
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.98, r * 0.15, r * 0.2, r * 0.45, shade(c, -0.1), d * 0.4);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.42, r * 0.98, r * 0.27, r * 0.13, '#ffa94d');
    sphere(ctx, 0, 0, r, c, 0.4, 0.3);
    ellG(ctx, 0, r * 0.3, r * 0.68, r * 0.66, '#fffaf0', 0, 0.1, 0.12);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.3, -r * 0.1, r * 0.3, r * 0.28, '#fffaf0', 0, 0.1, 0.08);
    eyes(ctx, -r * 0.1, r * 0.3, r * 0.09);
    tri(ctx, [[-r * 0.14, r * 0.05], [r * 0.14, r * 0.05], [0, r * 0.26]], '#ffa94d', r * 0.08);
    blush(ctx, r * 0.1, r * 0.55, r * 0.08);
    // 粉色圍巾
    ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.88, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
    gloss(ctx, -r * 0.45, -r * 0.55, r * 0.24, r * 0.12, -0.7, 0.4);
  }

  function drawDino(ctx, r) {
    const c = '#6fcf97';
    for (const sx of [-0.55, 0, 0.55]) tri(ctx, [[sx * r - r * 0.22, -r * 0.82], [sx * r, -r * 1.3], [sx * r + r * 0.22, -r * 0.82]], '#ffb347', r * 0.1);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.95, r * 0.3, r * 0.18, r * 0.12, shade(c, -0.05), d * 0.5);
    sphere(ctx, 0, 0, r, c, 0.4, 0.3);
    ellG(ctx, 0, r * 0.4, r * 0.62, r * 0.5, '#e1f7cf', 0, 0.2, 0.1);
    for (const d of [-1, 1]) ell(ctx, d * r * 0.12, r * 0.05, r * 0.045, r * 0.03, '#2f7d52');
    eyes(ctx, -r * 0.2, r * 0.42, r * 0.1);
    mouth(ctx, r * 0.28, r * 0.15, 'u');
    for (const d of [-1, 1]) tri(ctx, [[d * r * 0.1 - r * 0.04, r * 0.34], [d * r * 0.1 + r * 0.04, r * 0.34], [d * r * 0.1, r * 0.42]], '#fff', 1);
    blush(ctx, r * 0.08, r * 0.76, r * 0.1);
    for (const [px, py] of [[-0.55, -0.45], [0.5, -0.5], [-0.7, 0.05]]) sphere(ctx, px * r, py * r, r * 0.09, '#4fb67f', 0.3, 0.2);
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.12, -0.7, 0.4);
  }

  function drawDuck(ctx, r) {
    const c = '#ffd84d';
    tri(ctx, [[-r * 0.1, -r * 0.95], [0, -r * 1.3], [r * 0.14, -r * 0.92]], c, r * 0.12);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.95, r * 0.25, r * 0.22, r * 0.4, shade(c, -0.05), d * 0.35);
    for (const d of [-1, 1]) ellG(ctx, d * r * 0.38, r * 0.98, r * 0.26, r * 0.12, '#ff9a3d');
    sphere(ctx, 0, 0, r, c, 0.5, 0.25);
    eyes(ctx, -r * 0.12, r * 0.42, r * 0.1);
    ellG(ctx, 0, r * 0.28, r * 0.38, r * 0.2, '#ff9a3d', 0, 0.35, 0.2);
    ctx.strokeStyle = 'rgba(150,60,0,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.28); ctx.lineTo(r * 0.3, r * 0.28); ctx.stroke();
    blush(ctx, r * 0.2, r * 0.7, r * 0.1);
    bow(ctx, 0, r * 0.88, r * 0.26, '#4db3ff');
    gloss(ctx, -r * 0.42, -r * 0.5, r * 0.26, r * 0.12, -0.7, 0.55);
  }

  // ------------------------------------------------------------------
  // 食物抱枕
  // ------------------------------------------------------------------
  function drawWatermelon(ctx, r) {
    ellG(ctx, r * 0.22, -r * 1.0, r * 0.3, r * 0.12, '#4cb85a', -0.4);
    sphere(ctx, 0, 0, r, '#3fae4a', 0.4, 0.35);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(15,90,40,.35)'; ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 6; i++) {
      const a = i * (TAU / 6) + 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); ctx.stroke();
    }
    ctx.restore();
    sphere(ctx, 0, 0, r * 0.9, '#f2f9d7', 0.2, 0.1);
    sphere(ctx, 0, 0, r * 0.8, '#ff5b6f', 0.35, 0.25);
    for (const [sx, sy, rot] of [[-0.5, -0.4, -0.5], [0.5, -0.4, 0.5], [-0.58, 0.18, -0.2], [0.58, 0.18, 0.2], [0, -0.62, 0]]) ell(ctx, sx * r, sy * r, r * 0.05, r * 0.09, '#3b2230', rot);
    eyes(ctx, -r * 0.02, r * 0.3, r * 0.09);
    blush(ctx, r * 0.15, r * 0.52, r * 0.09);
    mouth(ctx, r * 0.2, r * 0.1, 'u');
    gloss(ctx, -r * 0.4, -r * 0.5, r * 0.22, r * 0.1, -0.7, 0.4);
  }

  function drawBoba(ctx, r) {
    // 吸管
    ctx.save();
    ctx.translate(r * 0.15, -r * 0.7); ctx.rotate(0.28);
    ctx.fillStyle = lg(ctx, -r * 0.08, 0, r * 0.08, 0, ['#ff9bc2', '#ff5d99']);
    rr(ctx, -r * 0.08, -r * 0.85, r * 0.16, r * 0.9, r * 0.05); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-r * 0.08, -r * 0.8 + i * r * 0.2, r * 0.16, r * 0.07);
    ctx.restore();
    // 杯身
    ctx.beginPath();
    ctx.moveTo(-r * 0.74, -r * 0.5); ctx.lineTo(r * 0.74, -r * 0.5); ctx.lineTo(r * 0.52, r * 0.92);
    ctx.quadraticCurveTo(0, r * 1.05, -r * 0.52, r * 0.92); ctx.closePath();
    ctx.fillStyle = lg(ctx, -r * 0.7, 0, r * 0.7, 0, ['#f5dcb8', '#e6bd8a', '#c9955e']);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,20,.3)'; ctx.lineWidth = 1.2; ctx.stroke();
    // 珍珠
    for (const [px, py] of [[-0.3, 0.8], [0, 0.85], [0.3, 0.8], [-0.15, 0.66], [0.17, 0.66], [-0.4, 0.62], [0.4, 0.62]]) sphere(ctx, px * r, py * r, r * 0.12, '#3b2a22', 0.35, 0.2);
    // 蓋與奶蓋
    ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.7, r * 0.55, 0, Math.PI, TAU); ctx.closePath();
    ctx.fillStyle = lg(ctx, -r * 0.5, -r * 1.1, r * 0.5, -r * 0.5, ['#ffffff', '#ffeaf3', '#f4cfe0']);
    ctx.fill(); ctx.stroke();
    rr(ctx, -r * 0.8, -r * 0.6, r * 1.6, r * 0.2, r * 0.08);
    ctx.fillStyle = lg(ctx, 0, -r * 0.6, 0, -r * 0.4, ['#ffd0e2', '#ff9bc0']); ctx.fill();
    sphere(ctx, -r * 0.1, -r * 1.1, r * 0.13, '#ff4d6a', 0.5, 0.25);
    eyes(ctx, r * 0.15, r * 0.3, r * 0.09);
    blush(ctx, r * 0.35, r * 0.48, r * 0.09);
    mouth(ctx, r * 0.36, r * 0.1, 'u');
    gloss(ctx, -r * 0.5, r * 0.1, r * 0.08, r * 0.36, 0.1, 0.35);
  }

  function drawNoodles(ctx, r) {
    // 蒸氣
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const sx of [-0.35, 0.05, 0.4]) {
      ctx.beginPath(); ctx.moveTo(sx * r, -r * 0.55);
      ctx.bezierCurveTo((sx - 0.15) * r, -r * 0.8, (sx + 0.15) * r, -r * 0.95, sx * r, -r * 1.2); ctx.stroke();
    }
    // 筷子
    ctx.strokeStyle = '#c28a52'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.2); ctx.lineTo(r * 0.85, -r * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.2); ctx.lineTo(r * 1.05, -r * 0.95); ctx.stroke();
    // 碗身
    ctx.beginPath(); ctx.moveTo(-r * 0.98, -r * 0.18);
    ctx.bezierCurveTo(-r * 0.98, r * 0.75, -r * 0.4, r * 1.0, 0, r * 1.0);
    ctx.bezierCurveTo(r * 0.4, r * 1.0, r * 0.98, r * 0.75, r * 0.98, -r * 0.18); ctx.closePath();
    ctx.fillStyle = lg(ctx, -r, 0, r, 0, ['#ff8a7a', '#e8453c', '#b82b2b']); ctx.fill();
    ctx.strokeStyle = 'rgba(90,20,20,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // 花紋
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2;
    for (const k of [0.62, 0.8]) { ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.98, r * k * 1.2, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    // 湯面與麵
    ell(ctx, 0, -r * 0.2, r * 0.98, r * 0.3, '#f6b94f');
    ell(ctx, 0, -r * 0.24, r * 0.88, r * 0.24, '#ffd37a');
    ctx.strokeStyle = '#fff0b3'; ctx.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.22 - r * 0.1, -r * 0.3);
      ctx.bezierCurveTo(i * r * 0.22 + r * 0.1, -r * 0.4, i * r * 0.22 - r * 0.1, -r * 0.14, i * r * 0.22 + r * 0.1, -r * 0.2); ctx.stroke();
    }
    // 排骨 + 蔥花
    ellG(ctx, -r * 0.35, -r * 0.3, r * 0.3, r * 0.16, '#a8602f', -0.2);
    sphere(ctx, r * 0.4, -r * 0.3, r * 0.14, '#fffdf4', 0.1, 0.1);
    sphere(ctx, r * 0.4, -r * 0.3, r * 0.06, '#ffb81f', 0.4, 0.2);
    for (const [gx, gy] of [[0.05, -0.3], [-0.1, -0.2], [0.2, -0.18]]) ell(ctx, gx * r, gy * r, r * 0.06, r * 0.025, '#4cb85a', 0.5);
    eyes(ctx, r * 0.4, r * 0.3, r * 0.09);
    blush(ctx, r * 0.58, r * 0.5, r * 0.09);
    mouth(ctx, r * 0.6, r * 0.1, 'u');
    gloss(ctx, -r * 0.62, r * 0.35, r * 0.07, r * 0.28, 0.25, 0.4);
  }

  // ------------------------------------------------------------------
  // 公仔盒
  // ------------------------------------------------------------------
  // ---- 公仔盒內的小圖案 ----
  function drawTopIcon(ctx, R) {
    // 戰鬥陀螺
    sphere(ctx, 0, 0, R, '#cfd6e6', 0.5, 0.3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      tri(ctx, [[Math.cos(a - 0.2) * R * 0.95, Math.sin(a - 0.2) * R * 0.95], [Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3], [Math.cos(a + 0.2) * R * 0.95, Math.sin(a + 0.2) * R * 0.95]], '#7a4bd8', 2);
    }
    sphere(ctx, 0, 0, R * 0.72, '#7a4bd8', 0.4, 0.3);
    sphere(ctx, 0, 0, R * 0.4, '#ffd54a', 0.5, 0.2);
    ctx.fillStyle = '#fff'; starPath(ctx, 0, 0, R * 0.26, R * 0.1); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(0, 0, R * 1.45, k * 0.3 + 0.4, k * 0.3 + 1.0); ctx.stroke(); }
  }

  function drawFanIcon(ctx, R) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = R * 0.14;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate((i / 3) * TAU + 0.3); ctx.translate(R * 0.5, 0);
      ellG(ctx, 0, 0, R * 0.55, R * 0.3, '#8fd3ff', 0.4, 0.5, 0.2);
      ctx.restore();
    }
    sphere(ctx, 0, 0, R * 0.25, '#6a4be0', 0.5, 0.2);
  }

  function drawMonsterIcon(ctx, R) {
    for (const d of [-1, 1]) tri(ctx, [[d * R * 0.45, -R * 0.75], [d * R * 0.7, -R * 1.25], [d * R * 0.15, -R * 0.9]], '#ffd54a', 3);
    sphere(ctx, 0, 0, R, '#7be0a8', 0.45, 0.3);
    for (const d of [-1, 1]) { sphere(ctx, d * R * 0.35, -R * 0.15, R * 0.28, '#fff', 0.1, 0.1); ell(ctx, d * R * 0.38, -R * 0.12, R * 0.12, R * 0.16, INK); }
    ctx.fillStyle = '#3a2a3f'; ctx.beginPath(); ctx.ellipse(0, R * 0.45, R * 0.45, R * 0.28, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; for (const sx of [-0.25, 0, 0.25]) ctx.fillRect(sx * R - R * 0.07, R * 0.45, R * 0.14, R * 0.12);
    blush(ctx, R * 0.25, R * 0.62, R * 0.12);
  }

  // 公仔盒：可調比例 (w/h/dx)、圖案 (chibi 或自訂 icon)、收縮膜效果
  function drawFigureBox(ctx, r, o) {
    const w = r * (o.w || 1.5), h = r * (o.h || 1.95), dx = r * (o.dx || 0.36), dy = -dx;
    const x0 = -(w + dx) / 2, x1 = x0 + w;
    const y1 = (h - dy) / 2, y0 = y1 - h;

    // 吊卡掛孔
    if (!o.noHang) {
      rr(ctx, (x0 + x1) / 2 + dx / 2 - r * 0.2, y0 + dy - r * 0.16, r * 0.4, r * 0.2, r * 0.08);
      ctx.fillStyle = shade(o.c0, 0.2); ctx.fill();
      ell(ctx, (x0 + x1) / 2 + dx / 2, y0 + dy - r * 0.06, r * 0.06, r * 0.05, 'rgba(60,30,80,.6)');
    }

    box3d(ctx, x0, y0, x1, y1, dx, dy,
      lg(ctx, x0, y0, x1, y1, [shade(o.c0, 0.2), o.c0, o.c1]),
      shade(o.c0, 0.45), shade(o.c1, -0.25));

    // 頂部標題條 + 字樣
    const hh = h * 0.15;
    ctx.fillStyle = o.accent; ctx.fillRect(x0 + 1, y0 + 1, w - 2, hh);
    if (o.label) {
      ctx.font = `900 ${Math.round(hh * 0.62)}px "Changa One", "Noto Sans TC", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(o.label, x0 + w / 2, y0 + hh / 2 + 1, w - 6);
    } else {
      for (let i = 0; i < 3; i++) sparkle(ctx, x0 + w * (0.25 + i * 0.25), y0 + h * 0.08, r * 0.09, '#fff');
    }

    // 透明展示窗
    const wx = x0 + w * 0.1, wy = y0 + h * 0.2, ww = w * 0.8, wh = h * 0.56;
    ctx.save();
    rr(ctx, wx, wy, ww, wh, r * 0.12); ctx.clip();
    ctx.fillStyle = lg(ctx, 0, wy, 0, wy + wh, [o.bg0, o.bg1]); ctx.fillRect(wx, wy, ww, wh);
    sparkle(ctx, wx + ww * 0.18, wy + wh * 0.2, r * 0.09, '#fff');
    sparkle(ctx, wx + ww * 0.85, wy + wh * 0.35, r * 0.07, '#fff');
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    heartPath(ctx, wx + ww * 0.82, wy + wh * 0.12, r * 0.07); ctx.fill();
    ctx.save();
    ctx.translate(wx + ww / 2, wy + wh * 0.52);
    const R = Math.min(wh * 0.39, ww * 0.4);
    if (o.icon) o.icon(ctx, R * 0.9); else drawChibi(ctx, R, o.figure);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww * 0.55, wy); ctx.lineTo(wx, wy + wh * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
    rr(ctx, wx, wy, ww, wh, r * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.8; ctx.stroke();

    // 底部標籤條：愛心或條碼
    const by = y0 + h * 0.8, bh = h * 0.19;
    ctx.fillStyle = o.accent2; ctx.fillRect(x0 + 1, by, w - 2, bh);
    if (o.barcode) {
      ctx.fillStyle = '#fff'; ctx.fillRect(x0 + w * 0.12, by + bh * 0.15, w * 0.5, bh * 0.7);
      ctx.fillStyle = '#222';
      for (let i = 0; i < 16; i++) ctx.fillRect(x0 + w * 0.14 + i * (w * 0.46 / 16), by + bh * 0.22, (i % 3 + 1) * 0.7, bh * 0.56);
      ctx.fillStyle = '#ffd54a'; ctx.fillRect(x0 + w * 0.68, by + bh * 0.2, w * 0.2, bh * 0.6);
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        heartPath(ctx, x0 + w * (0.25 + i * 0.25), by + bh * 0.5, r * 0.075); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(x0 + 1, y0 + 1, w * 0.12, h - 2);

    // 透明收縮膜：斜向反光 + 皺褶 + 角落亮點
    if (o.wrap) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.moveTo(x0 + w * 0.35, y0); ctx.lineTo(x0 + w * 0.6, y0); ctx.lineTo(x0 + w * 0.1, y1); ctx.lineTo(x0 - w * 0.15, y1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.9;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(x1 - w * 0.05, y0 + h * (0.2 + i * 0.2)); ctx.lineTo(x1 - w * (0.25 + i * 0.02), y0 + h * (0.28 + i * 0.2)); ctx.stroke();
      }
      ctx.restore();
      sparkle(ctx, x1 - r * 0.12, y0 + r * 0.14, r * 0.12, 'rgba(255,255,255,.95)');
    }
  }

  // ------------------------------------------------------------------
  // 盲盒
  // ------------------------------------------------------------------
  function drawBlindBox(ctx, r, o) {
    const w = r * 1.55, h = r * 1.55, dx = r * 0.42, dy = -r * 0.42;
    const x0 = -(w + dx) / 2, x1 = x0 + w;
    const y1 = (h - dy) / 2, y0 = y1 - h;

    box3d(ctx, x0, y0, x1, y1, dx, dy,
      lg(ctx, x0, y0, x1, y1, [shade(o.c0, 0.25), o.c0, o.c1]),
      shade(o.c0, 0.5), shade(o.c1, -0.3));

    // 緞帶
    const rx = (x0 + x1) / 2;
    ctx.fillStyle = lg(ctx, rx - r * 0.12, 0, rx + r * 0.12, 0, [shade(o.ribbon, 0.3), o.ribbon, shade(o.ribbon, -0.2)]);
    ctx.fillRect(rx - r * 0.12, y0, r * 0.24, h);
    ctx.beginPath();
    ctx.moveTo(rx - r * 0.12, y0); ctx.lineTo(rx - r * 0.12 + dx, y0 + dy); ctx.lineTo(rx + r * 0.12 + dx, y0 + dy); ctx.lineTo(rx + r * 0.12, y0);
    ctx.closePath(); ctx.fillStyle = shade(o.ribbon, 0.3); ctx.fill();
    bow(ctx, rx + dx / 2, y0 + dy * 0.5 - r * 0.02, r * 0.32, o.ribbon);

    // 問號
    ctx.font = `900 ${Math.round(h * 0.62)}px "Changa One", "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const qx = rx + r * 0.38, qy = y0 + h * 0.58;
    ctx.lineWidth = r * 0.12; ctx.lineJoin = 'round';
    ctx.strokeStyle = o.ink; ctx.strokeText('?', qx, qy);
    ctx.fillStyle = '#fff'; ctx.fillText('?', qx, qy);

    sparkle(ctx, x0 + w * 0.12, y0 + h * 0.2, r * 0.13, '#fff');
    sparkle(ctx, x0 + w * 0.2, y1 - h * 0.15, r * 0.09, 'rgba(255,255,255,.9)');
    sparkle(ctx, x1 + dx * 0.4, y1 - h * 0.5, r * 0.1, 'rgba(255,255,255,.8)');
    if (o.gold) {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w * 0.5, y0); ctx.lineTo(x0, y0 + h * 0.5); ctx.closePath(); ctx.fill();
      starPath(ctx, x1 - r * 0.2, y0 + r * 0.22, r * 0.18, r * 0.07); ctx.fillStyle = '#fff6b0'; ctx.fill();
    }
  }

  // ------------------------------------------------------------------
  // 扭蛋
  // ------------------------------------------------------------------
  function drawCapsule(ctx, r) {
    const top = '#6ec6ff';
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    // 下半透明
    sphere(ctx, 0, 0, r, '#f4fbff', 0.2, 0.18);
    ctx.save(); ctx.translate(0, r * 0.35); ctx.scale(0.6, 0.6);
    drawChibi(ctx, r, { hat: 'bear', hatColor: '#ffd1a6', hair: '#8b5a3c', outfit: '#ff7aa8' });
    ctx.restore();
    // 上半不透明
    ctx.beginPath(); ctx.rect(-r, -r, r * 2, r);
    ctx.save(); ctx.clip(); sphere(ctx, 0, 0, r, top, 0.5, 0.32); ctx.restore();
    // 接縫
    ctx.fillStyle = lg(ctx, 0, -r * 0.12, 0, r * 0.12, ['#ffffff', '#c9d6e6']);
    ctx.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
    ctx.restore();
    gloss(ctx, -r * 0.4, -r * 0.5, r * 0.28, r * 0.13, -0.7, 0.65);
    gloss(ctx, r * 0.5, r * 0.45, r * 0.12, r * 0.06, -0.7, 0.4);
    ctx.strokeStyle = 'rgba(70,90,130,.3)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, r - 0.6, 0, TAU); ctx.stroke();
  }

  // ------------------------------------------------------------------
  // 盲盒公仔 (拆盒後的內容)
  // ------------------------------------------------------------------
  const BLIND_FIGURES = [
    { id: 'star_moon',  series: 'blind_star',  name: '月光兔兔',   rarity: 'N',   cfg: { hat: 'bunny', hatColor: '#ffffff', hair: '#c9b8ff', outfit: '#7c6bff', base: '#e4dcff' } },
    { id: 'star_cat',   series: 'blind_star',  name: '星星貓貓',   rarity: 'N',   cfg: { hat: 'cat', hatColor: '#ffd36b', hair: '#ffd36b', outfit: '#ffa23d', base: '#fff0c4' } },
    { id: 'star_cloud', series: 'blind_star',  name: '雲朵小熊',   rarity: 'N',   cfg: { hat: 'bear', hatColor: '#bfe3ff', hair: '#8ec9ff', outfit: '#4f9dff', base: '#d8eeff' } },
    { id: 'star_uni',   series: 'blind_star',  name: '彩虹獨角獸', rarity: 'R',   cfg: { hat: 'unicorn', hair: '#ff9ad5', outfit: '#b388ff', base: '#ffd6f0' } },
    { id: 'star_queen', series: 'blind_star',  name: '星空女王',   rarity: 'SSR', cfg: { hat: 'crown', hair: '#ffe08a', outfit: '#2f2d7a', glow: true, base: '#c9c4ff' } },
    { id: 'sw_straw',   series: 'blind_sweet', name: '草莓蛋糕妹', rarity: 'N',   cfg: { hat: 'strawberry', hair: '#ffb3c7', outfit: '#fff0f5', base: '#ffe0ea' } },
    { id: 'sw_matcha',  series: 'blind_sweet', name: '抹茶糰子',   rarity: 'N',   cfg: { hat: 'bear', hatColor: '#a8d672', hair: '#7fb85a', outfit: '#e6f5d0', base: '#e2f3cc' } },
    { id: 'sw_pudding', series: 'blind_sweet', name: '布丁小狗',   rarity: 'N',   cfg: { hat: 'dog', hatColor: '#b8753c', hair: '#ffd966', outfit: '#ffe9a8', base: '#fff0c4' } },
    { id: 'sw_boba',    series: 'blind_sweet', name: '珍奶精靈',   rarity: 'R',   cfg: { hat: 'boba', hair: '#7a4b2a', outfit: '#f3d9b8', base: '#f6e3cc' } },
    { id: 'sw_chef',    series: 'blind_sweet', name: '黃金甜點師', rarity: 'SSR', cfg: { hat: 'chef', hatColor: '#ffe08a', hair: '#ffcf4d', outfit: '#ffffff', glow: true, base: '#ffe9a8' } }
  ];

  // ------------------------------------------------------------------
  // 獎品總表
  // spawn: 補貨時出現的權重；radius/catchRadius/catchDifficulty: 物理與抓取手感
  // ------------------------------------------------------------------
  const FIG_MAGIC = { hat: 'star', hair: '#ff8fc8', outfit: '#ff5fa8', skin: '#ffe3cf' };
  const FIG_ROBOT = { kind: 'robot', outfit: '#4aa8ff', accent: '#ffd54a' };
  const FIG_DINO  = { hat: 'dino', hatColor: '#6fcf97', hair: '#6a4b2a', outfit: '#ffb347' };

  // Original fictional package designs shared by the shelf, collection and 3D textures.
  function drawPackage(ctx, r, cfg) {
    const w=r*1.6,h=r*2.0;
    ctx.save();
    ctx.fillStyle=cfg.color;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.3)';ctx.fillRect(-w/2+3,-h/2+3,w-6,5);ctx.fillRect(-w/2+3,h/2-8,w-6,5);
    ctx.fillStyle='#fff6de';ctx.beginPath();ctx.ellipse(0,5,w*.37,h*.22,0,0,TAU);ctx.fill();
    ctx.font=`${r*.65}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(cfg.icon,0,5);
    ctx.fillStyle=cfg.ink||'#ffffff';ctx.font=`900 ${r*.29}px sans-serif`;ctx.fillText(cfg.label,0,-h*.29);
    ctx.font=`700 ${r*.16}px sans-serif`;ctx.fillText(cfg.sub||'山崩限定',0,h*.35);
    ctx.restore();
  }
  const SNACKS = [
    ['chips','海苔洋芋片','#349361','🥔','洋芋片','厚切・海苔'],
    ['corn','濃起司玉米棒','#f3a823','🌽','玉米棒','濃起司'],
    ['cookies','巧克力夾心餅','#906047','🍪','夾心餅','CHOCO'],
    ['gummy','水果軟糖分享包','#ed638e','🍓','水果軟糖','綜合水果'],
    ['ramen','台式紅燒泡麵','#cf473d','🍜','紅燒牛肉麵','大滿足'],
    ['popcorn','焦糖爆米花','#589ec9','🍿','爆米花','焦糖派對'],
    ['marshmallow','彩虹棉花糖','#a287d5','☁️','棉花糖','RAINBOW'],
    ['chocolate','金裝巧克力禮盒','#b88b2d','🍫','金裝巧克力','GOLD BOX']
  ].map(([id,name,color,icon,label,sub])=>({id:'snack_'+id,cat:'snack',name,rarity:'N',radius:25,weight:.65,catchDifficulty:.3,catchRadius:34,spawn:10,perk:'輕巧包裝・挑山堆邊緣，帶動連鎖滑落',package:{color,icon,label,sub},draw:(c,r)=>drawPackage(c,r,{color,icon,label,sub})}));
  const EXTRAS = [
    ['headphones','無線耳機禮盒','#394b7b','🎧','無線耳機',18],
    ['speaker','藍牙喇叭禮盒','#e49a58','🔊','藍牙喇叭',22],
    ['console','掌上遊戲機禮盒','#66b9af','🎮','掌上遊戲機',35],
    ['brick','積木城堡大盒','#ba75ab','🏰','積木城堡',28]
  ].map(([id,name,color,icon,label,cost])=>({id:'ex_'+id,cat:'exchange',name,rarity:'SR',radius:31,weight:1,catchDifficulty:.5,catchRadius:34,spawn:0,exchange:true,cost,perk:'機頂夾換限定・使用遊戲兌換券',draw:(c,r)=>drawPackage(c,r,{color,icon,label,sub:'夾換限定'})}));

  const PRIZE_TYPES = [
    ...SNACKS, ...EXTRAS,
    { id: 'bear',       cat: 'plush',     name: '泰迪小熊',       rarity: 'N',  radius: 30, weight: 1.0,  catchDifficulty: 0.40, catchRadius: 36, spawn: 8, perk: '圓滾滾的大頭 好夾又好抱', draw: drawBear },
    { id: 'bunny',      cat: 'plush',     name: '長耳兔兔',       rarity: 'N',  radius: 28, weight: 0.9,  catchDifficulty: 0.35, catchRadius: 36, spawn: 8, perk: '長耳朵就是現成的抓點', draw: drawBunny },
    { id: 'capybara',   cat: 'plush',     name: '水豚君卡比巴拉', rarity: 'N',  radius: 30, weight: 1.0,  catchDifficulty: 0.50, catchRadius: 36, spawn: 8, perk: '頭頂蜜柑 圓潤好抓', draw: drawCapybara },
    { id: 'shiba',      cat: 'plush',     name: '呆萌柴犬',       rarity: 'N',  radius: 28, weight: 0.95, catchDifficulty: 0.45, catchRadius: 34, spawn: 8, perk: '立耳柴犬 微抓即起', draw: drawShiba },
    { id: 'cat',        cat: 'plush',     name: '招財貓咪',       rarity: 'N',  radius: 28, weight: 0.9,  catchDifficulty: 0.40, catchRadius: 34, spawn: 7, perk: '金鈴鐺項圈 好運旺旺', draw: drawCat },
    { id: 'penguin',    cat: 'plush',     name: '圍巾小企鵝',     rarity: 'N',  radius: 29, weight: 1.0,  catchDifficulty: 0.45, catchRadius: 35, spawn: 7, perk: '粉紅圍巾 超好勾', draw: drawPenguin },
    { id: 'dino',       cat: 'plush',     name: '背刺小恐龍',     rarity: 'N',  radius: 29, weight: 0.9,  catchDifficulty: 0.35, catchRadius: 38, spawn: 7, perk: '背刺多角 容易卡爪', draw: drawDino },
    { id: 'duck',       cat: 'plush',     name: '蝴蝶結小黃鴨',   rarity: 'N',  radius: 28, weight: 0.85, catchDifficulty: 0.40, catchRadius: 34, spawn: 7, perk: '頭頂呆毛 二停必中', draw: drawDuck },
    { id: 'watermelon', cat: 'pillow',    name: '大西瓜抱枕',     rarity: 'N',  radius: 34, weight: 1.3,  catchDifficulty: 0.75, catchRadius: 42, spawn: 5, perk: '體積偏大 表面較滑', draw: drawWatermelon },
    { id: 'boba',       cat: 'pillow',    name: '珍珠奶茶特大杯', rarity: 'N',  radius: 27, weight: 1.05, catchDifficulty: 0.40, catchRadius: 33, spawn: 5, perk: '吸管凸出 二停必中', draw: drawBoba },
    { id: 'noodles',    cat: 'pillow',    name: '台式排骨雞碗麵', rarity: 'N',  radius: 28, weight: 0.85, catchDifficulty: 0.50, catchRadius: 35, spawn: 5, perk: '扁平易翻 擋板剋星', draw: drawNoodles },
    { id: 'fig_magic',  cat: 'figurebox', name: '魔法星星公仔盒', rarity: 'R',  radius: 31, weight: 1.35, catchDifficulty: 0.70, catchRadius: 34, spawn: 4, perk: '方盒要夾邊角 用二停卡住', draw: (c, r) => drawFigureBox(c, r, { c0: '#ff8fc8', c1: '#e0489a', accent: '#ffd54a', accent2: '#c93a8e', bg0: '#ffe3f4', bg1: '#d9b8ff', figure: FIG_MAGIC }) },
    { id: 'fig_robot',  cat: 'figurebox', name: '機甲戰士公仔盒', rarity: 'R',  radius: 31, weight: 1.45, catchDifficulty: 0.75, catchRadius: 34, spawn: 4, perk: '硬殼重盒 考驗爪力', draw: (c, r) => drawFigureBox(c, r, { c0: '#5fb8ff', c1: '#2f7fe0', accent: '#ffd54a', accent2: '#2866c2', bg0: '#e0f4ff', bg1: '#a9d4ff', figure: FIG_ROBOT }) },
    { id: 'fig_dino',   cat: 'figurebox', name: '恐龍派對公仔盒', rarity: 'R',  radius: 31, weight: 1.35, catchDifficulty: 0.70, catchRadius: 34, spawn: 4, perk: '亮綠色盒身 最顯眼', draw: (c, r) => drawFigureBox(c, r, { c0: '#7fdc9f', c1: '#37b36b', accent: '#ff9a3d', accent2: '#2c9a5a', bg0: '#f0ffd9', bg1: '#b8f0c8', figure: FIG_DINO }) },
    // 實機常見的盒裝景品／公仔盒：比例各異、有的包收縮膜
    { id: 'fb_qposket', cat: 'figurebox', name: 'Q版少女景品盒', rarity: 'R', radius: 34, weight: 1.4, catchDifficulty: 0.70, catchRadius: 36, spawn: 4, perk: '高瘦盒身 夾上緣最穩', draw: (c, r) => drawFigureBox(c, r, { w: 1.25, h: 2.1, c0: '#ffd6ea', c1: '#ff8fc0', accent: '#ff5fa8', accent2: '#d93f87', bg0: '#fff0f8', bg1: '#ffc6e2', label: 'Qposket', wrap: true, figure: { hat: 'bunny', hatColor: '#fff', hair: '#ffb3d9', outfit: '#ff6fb0' } }) },
    { id: 'fb_hero', cat: 'figurebox', name: '英雄動漫景品盒', rarity: 'R', radius: 34, weight: 1.55, catchDifficulty: 0.78, catchRadius: 36, spawn: 4, perk: '深色重盒 要夾邊角', draw: (c, r) => drawFigureBox(c, r, { w: 1.6, h: 2.0, c0: '#4a5a9a', c1: '#1c2347', accent: '#e5301f', accent2: '#10142e', bg0: '#9fc0ff', bg1: '#4a6fd8', label: 'HERO', barcode: true, wrap: true, figure: { hair: '#ffb21f', outfit: '#e5301f', hat: 'star' } }) },
    { id: 'fb_top', cat: 'figurebox', name: '戰鬥陀螺盒', rarity: 'N', radius: 32, weight: 1.15, catchDifficulty: 0.55, catchRadius: 36, spawn: 5, perk: '扁平寬盒 好卡爪', draw: (c, r) => drawFigureBox(c, r, { w: 2.0, h: 1.4, dx: 0.4, c0: '#ffffff', c1: '#b9a8ee', accent: '#7a4bd8', accent2: '#3d2a8c', bg0: '#f2ecff', bg1: '#b9a3ff', label: 'BEYSUPER', barcode: true, wrap: true, noHang: true, icon: drawTopIcon }) },
    { id: 'fb_fan', cat: 'figurebox', name: '迷你風扇盒', rarity: 'N', radius: 30, weight: 1.1, catchDifficulty: 0.5, catchRadius: 34, spawn: 5, perk: '方正小盒 好夾好抓', draw: (c, r) => drawFigureBox(c, r, { w: 1.55, h: 1.6, c0: '#e3dcff', c1: '#9a87e8', accent: '#6a4be0', accent2: '#4a2fb0', bg0: '#f4f1ff', bg1: '#cdbfff', label: 'USB FAN', barcode: true, noHang: true, icon: drawFanIcon }) },
    { id: 'fb_monster', cat: 'figurebox', name: '潮玩小怪獸盒', rarity: 'R', radius: 32, weight: 1.3, catchDifficulty: 0.65, catchRadius: 35, spawn: 4, perk: '潮玩系列 顏色亮眼', draw: (c, r) => drawFigureBox(c, r, { w: 1.3, h: 1.85, c0: '#c9f5dc', c1: '#58c98f', accent: '#ff9a3d', accent2: '#2a9a66', bg0: '#fffbd9', bg1: '#b8f0c8', label: 'MONSTER', wrap: true, icon: drawMonsterIcon }) },
    { id: 'fb_mecha', cat: 'figurebox', name: '機器人模型盒', rarity: 'N', radius: 33, weight: 1.4, catchDifficulty: 0.7, catchRadius: 36, spawn: 4, perk: '長方模型盒 重心偏一邊', draw: (c, r) => drawFigureBox(c, r, { w: 1.75, h: 1.5, c0: '#cfe0f5', c1: '#6e90c4', accent: '#1f4fd6', accent2: '#16336e', bg0: '#e8f4ff', bg1: '#9ec4f0', label: 'MECHA', barcode: true, wrap: true, noHang: true, figure: FIG_ROBOT }) },
    { id: 'blind_star', cat: 'blindbox',  name: '星願精靈盲盒',   rarity: 'R',  radius: 29, weight: 1.2,  catchDifficulty: 0.60, catchRadius: 34, spawn: 6, perk: '拆開有機會抽到隱藏款', blind: true, draw: (c, r) => drawBlindBox(c, r, { c0: '#9b7bff', c1: '#6a4be0', ribbon: '#ffd54a', ink: '#4a2fb0' }) },
    { id: 'blind_sweet', cat: 'blindbox', name: '甜點好朋友盲盒', rarity: 'R',  radius: 29, weight: 1.2,  catchDifficulty: 0.60, catchRadius: 34, spawn: 6, perk: '拆開有機會抽到隱藏款', blind: true, draw: (c, r) => drawBlindBox(c, r, { c0: '#ff9fc4', c1: '#f0629a', ribbon: '#7be0c3', ink: '#b8346b' }) },
    { id: 'blind_gold', cat: 'blindbox',  name: '黃金限定盲盒',   rarity: 'SR', radius: 29, weight: 1.25, catchDifficulty: 0.65, catchRadius: 34, spawn: 2, perk: '稀有以上必中 隱藏款機率大增', blind: true, gold: true, draw: (c, r) => drawBlindBox(c, r, { c0: '#ffe27a', c1: '#f0a91a', ribbon: '#ff4d6a', ink: '#b86e00', gold: true }) },
    { id: 'capsule',    cat: 'capsule',   name: '夢幻扭蛋球',     rarity: 'N',  radius: 24, weight: 0.7,  catchDifficulty: 0.55, catchRadius: 30, spawn: 6, perk: '圓滾滾易滑 小心滑落', draw: drawCapsule },

    // 夾換限定：不會出現在機台裡，用兌換券在機頂的「夾換區」換取
    { id: 'ex_god',   cat: 'exchange', name: '招財神限定公仔盒', rarity: 'SR',  radius: 32, weight: 1.4, catchDifficulty: 0.7, catchRadius: 34, spawn: 0, cost: 15, perk: '夾換限定・財神爺送錢來', exchange: true,
      draw: (c, r) => drawFigureBox(c, r, { c0: '#ffd23f', c1: '#e08f00', accent: '#e5301f', accent2: '#b51d12', bg0: '#fff3c4', bg1: '#ffd36b', figure: { hat: 'crown', hair: '#4a3a2a', outfit: '#e5301f', glow: true } }) },
    { id: 'ex_robot', cat: 'exchange', name: '機甲戰士限定大盒', rarity: 'SR',  radius: 32, weight: 1.5, catchDifficulty: 0.75, catchRadius: 34, spawn: 0, cost: 25, perk: '夾換限定・閃亮電鍍版', exchange: true,
      draw: (c, r) => drawFigureBox(c, r, { c0: '#c9d3e6', c1: '#6b7a99', accent: '#e5301f', accent2: '#3b4660', bg0: '#e8f4ff', bg1: '#8fb4e8', figure: { kind: 'robot', outfit: '#e5301f', accent: '#ffd54a' } }) },
    { id: 'ex_gold',  cat: 'exchange', name: '黃金盲盒大獎', rarity: 'SSR', radius: 30, weight: 1.3, catchDifficulty: 0.65, catchRadius: 34, spawn: 0, cost: 40, perk: '夾換限定・最高等級', exchange: true,
      draw: (c, r) => drawBlindBox(c, r, { c0: '#fff0a0', c1: '#e8a200', ribbon: '#e5301f', ink: '#a86800', gold: true }) }
  ];

  // ------------------------------------------------------------------
  // 盲盒開箱抽選
  // ------------------------------------------------------------------
  function rollBlindBox(boxId) {
    const gold = boxId === 'blind_gold';
    const pool = gold ? BLIND_FIGURES : BLIND_FIGURES.filter(f => f.series === boxId);
    const roll = Math.random();
    let bucket;
    if (gold) bucket = roll < 0.4 ? 'SSR' : 'R';
    else bucket = roll < 0.08 ? 'SSR' : roll < 0.33 ? 'R' : 'N';
    const list = pool.filter(f => f.rarity === bucket);
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickPrizeType() {
    const total = PRIZE_TYPES.reduce((s, t) => s + t.spawn, 0);
    let roll = Math.random() * total;
    for (const t of PRIZE_TYPES) {
      roll -= t.spawn;
      if (roll <= 0) return t;
    }
    return PRIZE_TYPES[0];
  }

  // 圖鑑：可被收集的物品 (盲盒本身不收集，收集的是裡面的公仔)
  const COLLECTIBLES = [
    ...PRIZE_TYPES.filter(t => !t.blind).map(t => ({ id: t.id, cat: t.cat, name: t.name, rarity: t.rarity, perk: t.perk })),
    ...BLIND_FIGURES.map(f => ({ id: f.id, cat: 'blindfig', name: f.name, rarity: f.rarity, perk: f.series === 'blind_star' ? '星願精靈系列' : '甜點好朋友系列' }))
  ];

  function getCollectible(id) {
    return COLLECTIBLES.find(c => c.id === id) || null;
  }

  // ------------------------------------------------------------------
  // 點陣快取 (遊戲內 2x 解析度) 與 UI 縮圖 (dataURL)
  // ------------------------------------------------------------------
  const bitmapCache = {};
  function getBitmap(type) {
    if (bitmapCache[type.id]) return bitmapCache[type.id];
    const L = Math.ceil(type.radius * 3.6);
    const S = 3; // 遊戲內最大會放大到 1.45 倍，所以用 3x 解析度
    const canvas = document.createElement('canvas');
    canvas.width = L * S;
    canvas.height = L * S;
    const g = canvas.getContext('2d');
    g.scale(S, S);
    g.translate(L / 2, L / 2);
    type.draw(g, type.radius);
    return (bitmapCache[type.id] = { canvas, L });
  }

  const spriteCache = {};
  function getSpriteURL(id, px = 96) {
    const key = id + '@' + px;
    if (spriteCache[key]) return spriteCache[key];
    const canvas = document.createElement('canvas');
    canvas.width = px * 2;
    canvas.height = px * 2;
    const g = canvas.getContext('2d');
    g.scale(2, 2);
    g.translate(px / 2, px / 2);
    const type = PRIZE_TYPES.find(t => t.id === id);
    if (type) {
      const k = px / (type.radius * (type.package || type.id.startsWith('ex_') && type.cat === 'exchange' ? 2.3 : 3.3));
      g.scale(k, k);
      type.draw(g, type.radius);
    } else {
      const fig = BLIND_FIGURES.find(f => f.id === id);
      if (!fig) return '';
      const R = px * 0.3;
      g.translate(0, px * 0.02);
      drawPedestal(g, R, fig.cfg);
    }
    return (spriteCache[key] = canvas.toDataURL('image/png'));
  }

  window.PRIZE_TYPES = PRIZE_TYPES;
  window.BLIND_FIGURES = BLIND_FIGURES;
  window.COLLECTIBLES = COLLECTIBLES;
  window.RARITY = RARITY;
  window.CATEGORY_LABEL = CATEGORY_LABEL;
  window.pickPrizeType = pickPrizeType;
  window.rollBlindBox = rollBlindBox;
  window.getCollectible = getCollectible;
  window.getPrizeBitmap = getBitmap;
  window.getPrizeSprite = getSpriteURL;
  window.PrizeArt = { shade, sphere, ell, ellG, gloss, lg, rr, heartPath, starPath, sparkle, tri };
})();

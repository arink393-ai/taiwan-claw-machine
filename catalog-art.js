/* Original catalog illustrations, shared by storefront and playable prizes. */
(function () {
  const cache = new Map();
  function draw(ctx, machine) {
    const c = machine.art.color,
      id = machine.id;
    const box = (x, y, w, h, fill, r = 10) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    const ellipse = (x, y, rx, ry, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const text = (txt, x, y, size, color = "#fff") => {
      ctx.fillStyle = color;
      ctx.font = `700 ${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(txt, x, y);
    };
    ctx.save();
    ctx.lineJoin = "round";
    if (id === "tech-earbuds") {
      box(-60, -6, 120, 77, "#d9ded0", 25);
      box(-60, -10, 120, 25, "#eef0e6", 13);
      ctx.strokeStyle = "#a5b2a0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-51, 16);
      ctx.lineTo(51, 16);
      ctx.stroke();
      ellipse(0, 55, 3, 2, "#799679");
      for (const sign of [-1, 1]) {
        ctx.save();
        ctx.translate(sign * 29, -40);
        ctx.rotate(sign * 0.15);
        ellipse(0, 0, 17, 21, "#f6f5e9");
        box(-5, 1, 12, 42, "#d8dece", 6);
        ellipse(-3, -3, 7, 11, "#b6c1af");
        ctx.restore();
      }
    } else if (id === "tech-speaker") {
      box(-55, -68, 110, 143, "#b59c74", 25);
      const gr = ctx.createLinearGradient(-50, 0, 50, 0);
      gr.addColorStop(0, "#7e8672");
      gr.addColorStop(0.5, "#a4ad93");
      gr.addColorStop(1, "#6b7667");
      box(-51, -50, 102, 109, gr, 17);
      ctx.fillStyle = "#303f3440";
      for (let y = -42; y < 51; y += 5)
        for (let x = -43; x < 45; x += 5) ellipse(x, y, 1, 1, "#303f3455");
      box(-19, -63, 38, 6, "#e0d2b9", 3);
      text("SOUND", 0, 13, 11, "#e5e4d3");
    } else if (id === "toy-plush") {
      for (const sign of [-1, 1]) {
        ellipse(sign * 43, -66, 22, 24, "#ac764d");
        ellipse(sign * 43, -66, 12, 14, "#e4bd94");
        ellipse(sign * 45, 37, 20, 32, "#ad784d");
        ellipse(sign * 29, 70, 24, 19, "#b98557");
      }
      ellipse(0, 25, 48, 57, "#bd8a5d");
      ellipse(0, -27, 62, 54, "#c69466");
      ellipse(0, 35, 31, 37, "#e8caa6");
      ellipse(0, -6, 28, 18, "#f0d9b8");
      for (const sign of [-1, 1]) {
        ellipse(sign * 23, -33, 6, 8, "#342b29");
        ellipse(sign * 24 - 2, -36, 2, 2, "#fff");
      }
      ellipse(0, -12, 8, 5, "#4c3530");
      ctx.strokeStyle = "#4c3530";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 0);
      ctx.quadraticCurveTo(8, 8, 14, 1);
      ctx.stroke();
      box(-19, 13, 38, 12, "#486b58", 3);
      for (const sign of [-1, 1]) {
        ctx.save();
        ctx.translate(sign * 13, 18);
        ctx.rotate(sign * 0.25);
        box(-12, -9, 24, 18, "#41634f", 4);
        ctx.restore();
      }
    } else if (["beauty-shampoo", "life-detergent"].includes(id)) {
      const gradient = ctx.createLinearGradient(-45, 0, 50, 0);
      gradient.addColorStop(0, c);
      gradient.addColorStop(0.35, "#b4d9cc");
      gradient.addColorStop(0.65, c);
      gradient.addColorStop(1, "#315c51");
      box(-44, -43, 88, 119, gradient, 18);
      box(-21, -66, 42, 26, "#ece9dc", 5);
      box(-8, -80, 16, 22, "#dbdacd", 3);
      box(-10, -85, 52, 10, "#f8f5e9", 3);
      box(-35, -4, 70, 56, "#f8f5e9", 2);
      text(id === "beauty-shampoo" ? "BOTANIC" : "CLEAN DAY", 0, 15, 10, c);
      text(machine.art.label, 0, 36, 13, c);
      ellipse(-22, -38, 4, 27, "#ffffff33");
    } else if (id.includes("noodle")) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-65, -36);
      ctx.lineTo(-44, 68);
      ctx.quadraticCurveTo(0, 87, 44, 68);
      ctx.lineTo(65, -36);
      ctx.fill();
      ellipse(0, -36, 65, 20, "#f1d6a1");
      ellipse(0, -37, 56, 13, "#ac5034");
      ctx.strokeStyle = "#f7d899";
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 14 - 35, -37, 13, 7, i * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      box(-49, -5, 98, 53, "#fff2d2", 3);
      text(machine.art.label, 0, 18, 19, "#9e3729");
      text("TAIWAN NOODLES", 0, 35, 8, "#9e3729");
    } else if (id === "drink-milktea" || id === "drink-greentea") {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate((i - 1) * 45, (i % 2) * 9);
        box(-24, -51, 48, 121, i === 1 ? c : "#dddcc5", 3);
        ctx.fillStyle = "#eee9d9";
        ctx.beginPath();
        ctx.moveTo(-24, -51);
        ctx.lineTo(-13, -71);
        ctx.lineTo(14, -71);
        ctx.lineTo(24, -51);
        ctx.fill();
        box(-5, -83, 6, 38, "#f4f0e5", 1);
        ellipse(0, 3, 19, 22, "#f8f2db");
        text(i === 1 ? machine.art.label : "TEA", 0, 8, 11, c);
        text("6 PACK", 0, 45, 7, "#fff");
        ctx.restore();
      }
    } else if (id === "pet-cat") {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate((i - 1) * 37, i === 1 ? -18 : 22);
        box(-31, -20, 62, 63, c, 4);
        ellipse(0, -20, 31, 9, "#d6d7cf");
        ellipse(0, -21, 23, 5, "#a5a8a1");
        box(-26, -4, 52, 32, "#f6edda", 1);
        text("CAT MEAL", 0, 9, 8, c);
        ellipse(-8, 18, 3, 3, c);
        ellipse(8, 18, 3, 3, c);
        ctx.restore();
      }
    } else if (id === "life-tissue") {
      box(-72, -34, 144, 96, "#9bbdc1", 12);
      box(-70, -16, 140, 68, "#cfe2df", 7);
      ellipse(0, -31, 36, 8, "#4c7880");
      ctx.fillStyle = "#fffdf7";
      ctx.beginPath();
      ctx.moveTo(-29, -31);
      ctx.quadraticCurveTo(-42, -84, -8, -89);
      ctx.quadraticCurveTo(23, -53, 31, -31);
      ctx.fill();
      text("EVERYDAY", 0, 10, 15, "#4a7179");
      text("柔韌・親膚", 0, 32, 10, "#4a7179");
    } else {
      const wide = id === "toy-bricks" || id === "food-fruit",
        w = wide ? 142 : 108,
        h = wide ? 103 : 151;
      const gr = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      gr.addColorStop(0, c);
      gr.addColorStop(0.7, c);
      gr.addColorStop(1, "#454f43");
      box(-w / 2, -h / 2, w, h, gr, 5);
      box(-w / 2 + 4, -h / 2 + 5, w - 8, 7, "#ffffff45", 1);
      box(-w / 2 + 10, -h * 0.21, w - 20, h * 0.53, "#f6ebd1", 4);
      if (id.includes("chips")) {
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.translate(i * 12 - 24, (i % 2) * 13);
          ctx.rotate(i * 0.25);
          ellipse(0, 0, 17, 22, "#e8bc67");
          ctx.strokeStyle = "#c09244";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, 13, 18, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } else if (id.includes("cookies")) {
        for (let i = 0; i < 3; i++) {
          ellipse(i * 22 - 22, (i % 2) * 15, 20, 20, "#9b6648");
          for (let j = 0; j < 5; j++)
            ellipse(
              i * 22 - 32 + (j % 3) * 9,
              (i % 2) * 15 - 8 + Math.floor(j / 3) * 14,
              2.5,
              3,
              "#412d25",
            );
        }
      } else if (id === "toy-bricks") {
        for (let i = 0; i < 6; i++) {
          const x = (i % 3) * 24 - 33,
            y = 14 - Math.floor(i / 3) * 20;
          box(x, y, 23, 18, ["#d8a53a", "#699b89", "#d5786b"][i % 3], 2);
          box(x + 3, y - 3, 6, 4, "#ecd19e", 1);
          box(x + 14, y - 3, 6, 4, "#ecd19e", 1);
        }
      } else if (id === "food-fruit") {
        for (let i = 0; i < 4; i++) {
          ellipse(
            i * 25 - 38,
            0,
            18,
            20,
            ["#be6146", "#dfb658", "#a2b36c", "#b65f4c"][i],
          );
          ellipse(i * 25 - 33, -19, 7, 3, "#577a4c");
        }
      } else if (id === "beauty-mask") {
        ellipse(0, 5, 26, 35, "#dfc1b4");
        for (const side of [-1, 1]) ellipse(side * 10, -1, 5, 2, "#fff5ee");
        ellipse(0, 21, 8, 3, "#fff5ee");
      } else if (id === "pet-treat") {
        ctx.save();
        ctx.rotate(-0.35);
        box(-31, -5, 62, 15, "#c9a77c", 5);
        for (const x of [-28, 28])
          for (const y of [-7, 14]) ellipse(x, y, 10, 10, "#c9a77c");
        ctx.restore();
      } else {
        box(-24, -14, 48, 41, "#dfb76d", 3);
        box(-3, -15, 6, 43, "#ab6245", 1);
        box(-25, -3, 50, 6, "#ab6245", 1);
      }
      text(machine.art.label, 0, -h * 0.29, 15, "#fff9e9");
      text("FEILUOLI SELECT", 0, h * 0.4, 8, "#fff9e9");
    }
    ctx.restore();
  }
  window.CatalogArt = {
    draw,
    url(machine, size = 420) {
      const key = machine.id + "@" + size;
      if (cache.has(key)) return cache.get(key);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.translate(size / 2, size / 2);
      ctx.scale(size / 250, size / 250);
      ctx.shadowColor = "#253f2928";
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 10;
      draw(ctx, machine);
      const url = canvas.toDataURL("image/png");
      cache.set(key, url);
      return url;
    },
  };
})();

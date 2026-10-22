/**
 * 商城首頁：機台列表、分類篩選、搜尋、排序、分頁、機台詳情、我的獎品。
 * 資料來自 machines.js (之後可改由 Supabase 提供，渲染邏輯不變)。
 * 所有資料文字都用 textContent 寫入，避免把商品資料當 HTML 執行。
 */
(function () {
  const PAGE_SIZE = 12;
  const machines = window.MACHINES || [];
  const params = new URLSearchParams(location.search);
  const view = {
    type: ["free", "paid"].includes(params.get("type"))
      ? params.get("type")
      : "all",
    category: (window.MALL_CATEGORIES || []).includes(params.get("category"))
      ? params.get("category")
      : "all",
    query: params.get("q") || "",
    sort: ["new", "price"].includes(params.get("sort"))
      ? params.get("sort")
      : "hot",
    page: Math.max(1, parseInt(params.get("page")) || 1),
    favorites: params.get("saved") === "1",
  };
  const saved = lsGet("claw-favorites", []);
  const favorites = new Set(Array.isArray(saved) ? saved : []);
  const todayStr = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

  // ---------- 本機儲存 (遊戲頁共用) ----------
  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  const freeUsed = (m) => lsGet(`claw-free-${m.id}-${todayStr()}`, 0);
  const freeLeft = (m) => Math.max(0, m.freePlays - freeUsed(m));
  const playsOf = (m) => m.plays + lsGet(`claw-plays-${m.id}`, 0);
  const isFree = (m) => m.type === "free";
  const canPlay = (m) => !isFree(m) || freeLeft(m) > 0;

  // ---------- 小工具 ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function darken(hex, amt) {
    const n = parseInt(hex.replace("#", ""), 16);
    const f = (v) => Math.round(v * (1 - amt));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // 商品圖：有照片用照片，沒有就用「立體盒子 + 圖示」
  function artEl(m, extraTags) {
    const art = el("div", "card-art");
    art.style.setProperty("--c1", m.art.color);
    art.style.setProperty("--c2", darken(m.art.color, 0.35));
    art.style.setProperty(
      "--art-bg",
      m.art.background ||
        {
          食物: "#ede9d9",
          飲料: "#e8ecdf",
          泡麵: "#f0e5d7",
          生活用品: "#e5ebe7",
          美妝保養: "#eee4df",
          寵物用品: "#e9e6dc",
          玩具: "#eae7dd",
          "3C數位": "#e4e9df",
          其他: "#e9e4eb",
        }[m.category],
    );
    const img = document.createElement("img");
    img.src = m.image || CatalogArt.url(m);
    img.alt = m.product.name;
    img.width = 420;
    img.height = 420;
    img.loading = "lazy";
    img.decoding = "async";
    if (m.image)
      img.addEventListener(
        "error",
        () => {
          img.src = CatalogArt.url(m);
        },
        { once: true },
      );
    art.append(img);
    if (extraTags) {
      const row = el("div", "tag-row");
      if (m.featured) row.appendChild(el("span", "tag hot", "SELECTED"));
      row.appendChild(el("span", "tag cat", m.category));
      art.appendChild(row);
      const st = el(
        "span",
        "status" + (canPlay(m) ? "" : " off"),
        canPlay(m) ? "可開始挑戰" : "今日免費已用完",
      );
      art.appendChild(st);
    }
    return art;
  }

  // ---------- 篩選 / 排序 ----------
  function visibleMachines() {
    const q = view.query.trim().toLowerCase();
    let list = machines.filter((m) => {
      if (view.favorites && !favorites.has(m.id)) return false;
      if (view.type !== "all" && m.type !== view.type) return false;
      if (view.category !== "all" && m.category !== view.category) return false;
      if (
        q &&
        !`${m.name} ${m.product.name} ${m.category}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    const by = {
      hot: (a, b) =>
        playsOf(b) - playsOf(a) ||
        Number(!!b.featured) - Number(!!a.featured) ||
        b.addedAt.localeCompare(a.addedAt),
      new: (a, b) => b.addedAt.localeCompare(a.addedAt),
      price: (a, b) => a.product.price - b.product.price,
    }[view.sort];
    return list.sort(by);
  }

  // ---------- 渲染 ----------
  const grid = document.getElementById("machine-grid");
  const pager = document.getElementById("pager");
  const countEl = document.getElementById("result-count");

  function card(m) {
    const c = el("article", "card");
    const main = el("button", "card-main");
    main.type = "button";
    main.setAttribute("aria-label", m.name + "，查看規則與開始遊玩");
    main.addEventListener("click", () => openDetail(m));
    main.append(artEl(m, true));
    const favorite = el(
      "button",
      "favorite-button",
      favorites.has(m.id) ? "♥" : "♡",
    );
    favorite.type = "button";
    favorite.setAttribute("aria-pressed", String(favorites.has(m.id)));
    favorite.setAttribute(
      "aria-label",
      (favorites.has(m.id) ? "取消收藏" : "收藏") + m.name,
    );
    favorite.addEventListener("click", () => {
      favorites.has(m.id) ? favorites.delete(m.id) : favorites.add(m.id);
      try {
        localStorage.setItem("claw-favorites", JSON.stringify([...favorites]));
      } catch (_) {}
      render();
    });
    c.append(main, favorite);

    const body = el("div", "card-body");
    body.append(
      el(
        "span",
        "card-number",
        "NO. " +
          String(machines.indexOf(m) + 1).padStart(3, "0") +
          " / " +
          m.category,
      ),
      el("h3", "", m.name),
      el("div", "prod", m.product.spec + " · 展示商品"),
    );

    const meta = el("div", "card-meta");
    meta.append(el("span", "", `本機 ${playsOf(m).toLocaleString()} 次`));
    const price = isFree(m)
      ? el("span", "price free", `每日 ${m.freePlays} 次免費`)
      : el("span", "price", `${m.pricePerPlay} 試玩幣／次`);
    meta.appendChild(price);
    const cta = el("div", "card-cta", canPlay(m) ? "查看機台" : "查看今日紀錄");
    cta.append(el("span", "", "↗"));
    body.append(
      meta,
      el(
        "div",
        "guarantee-meta",
        isFree(m)
          ? `今日還有 ${freeLeft(m)} 次`
          : `保夾門檻 ${m.guarantee} 試玩幣`,
      ),
      cta,
    );
    main.appendChild(body);
    return c;
  }

  function render() {
    document.querySelectorAll("#type-tabs .tab").forEach((b) => {
      const active = b.dataset.type === view.type;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-category]").forEach((b) => {
      const active = b.dataset.category === view.category;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document
      .getElementById("btn-favorites")
      .setAttribute("aria-pressed", String(view.favorites));
    document.getElementById("category").value = view.category;
    document.getElementById("sort").value = view.sort;
    const url = new URL(location.href);
    url.search = "";
    if (view.type !== "all") url.searchParams.set("type", view.type);
    if (view.category !== "all")
      url.searchParams.set("category", view.category);
    if (view.query) url.searchParams.set("q", view.query);
    if (view.sort !== "hot") url.searchParams.set("sort", view.sort);
    if (view.favorites) url.searchParams.set("saved", "1");

    const list = visibleMachines();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    view.page = Math.min(view.page, pages);
    const slice = list.slice(
      (view.page - 1) * PAGE_SIZE,
      view.page * PAGE_SIZE,
    );

    if (view.page > 1) url.searchParams.set("page", view.page);
    history.replaceState(null, "", url);
    const typeLabel = { all: "全部", free: "免費", paid: "試玩幣" }[view.type];
    const catLabel = view.category === "all" ? "全部分類" : view.category;
    countEl.textContent = `${typeLabel} · ${list.length} 台機台`;

    grid.innerHTML = "";
    if (!slice.length) {
      const empty = el(
        "div",
        "empty",
        view.favorites
          ? "還沒有符合的收藏機台，點擊卡片上的愛心開始收藏。"
          : "沒有找到符合的機台，試試其他關鍵字。",
      );
      const reset = el("button", "", "重設篩選");
      reset.addEventListener("click", () => {
        Object.assign(view, {
          type: "all",
          category: "all",
          query: "",
          page: 1,
          favorites: false,
        });
        document.getElementById("search").value = "";
        render();
      });
      empty.append(reset);
      grid.append(empty);
    }
    slice.forEach((m) => grid.appendChild(card(m)));

    pager.innerHTML = "";
    if (pages > 1) {
      const mk = (label, page, opts = {}) => {
        const b = el("button", opts.active ? "active" : "", label);
        b.type = "button";
        b.disabled = !!opts.disabled;
        b.addEventListener("click", () => {
          view.page = page;
          render();
          document
            .getElementById("machines")
            .scrollIntoView({ behavior: "smooth" });
        });
        pager.appendChild(b);
      };
      mk("上一頁", view.page - 1, { disabled: view.page <= 1 });
      for (let p = 1; p <= pages; p++)
        mk(String(p), p, { active: p === view.page });
      mk("下一頁", view.page + 1, { disabled: view.page >= pages });
    }
  }

  // ---------- 機台詳情 ----------
  const modalDetail = document.getElementById("modal-detail");
  const detailBody = document.getElementById("detail-body");

  function row(label, value) {
    const r = el("div", "detail-row");
    r.append(el("span", "", label), el("b", "", value));
    return r;
  }

  function openDetail(m) {
    detailBody.innerHTML = "";
    detailBody.appendChild(artEl(m, true));
    detailBody.appendChild(el("h3", "", m.name));
    detailBody.appendChild(el("p", "muted", m.product.desc));

    const rows = el("div", "detail-rows");
    rows.append(
      row("獎品", m.product.name),
      row("參考市價", `NT$${m.product.price}（${m.product.spec}）`),
      row(
        "遊玩方式",
        isFree(m)
          ? `免費機台・每日 ${m.freePlays} 次（今日剩 ${freeLeft(m)} 次）`
          : `試玩幣機台・${m.pricePerPlay} 試玩幣／次`,
      ),
      row(
        "保證取物",
        isFree(m)
          ? "免費機台不適用"
          : `累計 ${m.guarantee} 試玩幣啟動強爪，仍需瞄準商品`,
      ),
      row("本裝置遊玩", `${playsOf(m).toLocaleString()} 次`),
    );
    detailBody.appendChild(rows);
    detailBody.appendChild(
      el(
        "p",
        "detail-note",
        "試玩模式：使用試玩幣，不會真的收款或出貨。正式收費前會公開機率與規則。",
      ),
    );

    const go = el(
      "a",
      "btn-primary wide",
      canPlay(m) ? "開始遊玩 →" : "今日免費次數已用完",
    );
    go.href = `play.html?m=${encodeURIComponent(m.id)}&v=20261022-2`;
    if (!canPlay(m)) {
      go.removeAttribute("href");
      go.style.opacity = 0.5;
      go.style.pointerEvents = "none";
    }
    go.style.textAlign = "center";
    detailBody.appendChild(go);

    modalDetail.classList.remove("hidden");
  }

  document
    .getElementById("btn-close-detail")
    .addEventListener("click", () => modalDetail.classList.add("hidden"));
  [modalDetail, document.getElementById("modal-myprizes")].forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.add("hidden");
    });
  });

  // ---------- 我的獎品 ----------
  const modalMy = document.getElementById("modal-myprizes");
  const myList = document.getElementById("myprizes-list");
  const myBadge = document.getElementById("myprizes-badge");
  const getMyPrizes = () => lsGet("claw-my-prizes", []);

  function renderMyPrizes() {
    const list = getMyPrizes();
    myBadge.textContent = list.length;
    myList.innerHTML = "";
    if (!list.length) {
      myList.appendChild(
        el("div", "empty", "還沒有夾中商品，去挑一台挑戰吧！"),
      );
      return;
    }
    list.forEach((p) => {
      const r = el("div", "myprize-row");
      const icon = el("span", "myprize-icon", p.icon);
      icon.style.background = p.color;
      const info = el("div");
      info.append(
        el("b", "", p.name),
        el(
          "small",
          "",
          `${new Date(p.ts).toLocaleString("zh-TW")}・${p.status}`,
        ),
      );
      r.append(icon, info);
      myList.appendChild(r);
    });
  }

  document.getElementById("btn-myprizes").addEventListener("click", () => {
    renderMyPrizes();
    modalMy.classList.remove("hidden");
  });
  document
    .getElementById("btn-close-myprizes")
    .addEventListener("click", () => modalMy.classList.add("hidden"));

  // ---------- 控制項 ----------
  const catSel = document.getElementById("category");
  (window.MALL_CATEGORIES || []).forEach((c) => {
    const o = el("option", "", c);
    o.value = c;
    catSel.appendChild(o);
  });

  function setType(t) {
    view.type = t;
    view.page = 1;
    document
      .querySelectorAll("#type-tabs .tab")
      .forEach((b) => b.classList.toggle("active", b.dataset.type === t));
    render();
  }
  document
    .querySelectorAll("#type-tabs .tab")
    .forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));
  document.getElementById("btn-free-only").addEventListener("click", () => {
    setType("free");
    document.getElementById("machines").scrollIntoView({ behavior: "smooth" });
  });
  catSel.addEventListener("change", () => {
    view.category = catSel.value;
    view.page = 1;
    render();
  });
  document.getElementById("sort").addEventListener("change", (e) => {
    view.sort = e.target.value;
    view.page = 1;
    render();
  });
  document.getElementById("search").addEventListener("input", (e) => {
    view.query = e.target.value;
    view.page = 1;
    render();
  });

  document.getElementById("search").value = view.query;
  document.getElementById("catalog-total").textContent =
    machines.length + " 台特色機台";
  const categoryChips = document.getElementById("category-chips");
  ["all", ...(window.MALL_CATEGORIES || [])].forEach((category) => {
    const button = el("button", "", category === "all" ? "全部商品" : category);
    button.type = "button";
    button.dataset.category = category;
    button.addEventListener("click", () => {
      view.category = category;
      view.page = 1;
      render();
    });
    categoryChips.append(button);
  });
  document.getElementById("btn-favorites").addEventListener("click", () => {
    view.favorites = !view.favorites;
    view.page = 1;
    render();
  });
  const last = lsGet("claw-last-machine", null),
    machine = machines.find((m) => m.id === last);
  if (machine) {
    const section = document.getElementById("continue-section");
    const text = el("div");
    text.append(
      el("span", "", "YOUR LAST VISIT"),
      el("b", "", "繼續挑戰 · " + machine.name),
    );
    const link = el("a", "", "返回機台 ↗");
    link.href = "play.html?m=" + encodeURIComponent(machine.id) + "&v=20261022-2";
    section.append(text, link);
    section.classList.remove("hidden");
  }
  renderMyPrizes();
  render();
})();

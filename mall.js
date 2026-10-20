/**
 * 商城首頁：機台列表、分類篩選、搜尋、排序、分頁、機台詳情、我的獎品。
 * 資料來自 machines.js (之後可改由 Supabase 提供，渲染邏輯不變)。
 * 所有資料文字都用 textContent 寫入，避免把商品資料當 HTML 執行。
 */
(function () {
  const PAGE_SIZE = 12;
  const machines = window.MACHINES || [];
  const view = { type: 'all', category: 'all', query: '', sort: 'hot', page: 1 };

  // ---------- 本機儲存 (遊戲頁共用) ----------
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  const todayStr = () => new Date().toLocaleDateString('sv-SE');
  const freeUsed = (m) => lsGet(`claw-free-${m.id}-${todayStr()}`, 0);
  const freeLeft = (m) => Math.max(0, m.freePlays - freeUsed(m));
  const playsOf = (m) => m.plays + lsGet(`claw-plays-${m.id}`, 0);
  const isFree = (m) => m.type === 'free';
  const canPlay = (m) => !isFree(m) || freeLeft(m) > 0;

  // ---------- 小工具 ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function darken(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const f = (v) => Math.round(v * (1 - amt));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // 商品圖：有照片用照片，沒有就用「立體盒子 + 圖示」
  function artEl(m, extraTags) {
    const art = el('div', 'card-art');
    art.style.setProperty('--c1', m.art.color);
    art.style.setProperty('--c2', darken(m.art.color, 0.35));
    if (m.image) {
      const img = document.createElement('img');
      img.src = m.image;
      img.alt = m.product.name;
      img.loading = 'lazy';
      art.appendChild(img);
    } else {
      const box = el('div', 'product-box');
      box.append(el('span', 'pi', m.art.icon), el('span', 'pl', m.art.label));
      art.appendChild(box);
    }
    if (extraTags) {
      const row = el('div', 'tag-row');
      if (m.featured) row.appendChild(el('span', 'tag hot', '人氣精選'));
      row.appendChild(el('span', 'tag cat', m.category));
      art.appendChild(row);
      const st = el('span', 'status' + (canPlay(m) ? '' : ' off'), canPlay(m) ? '可遊玩' : '今日已玩完');
      art.appendChild(st);
    }
    return art;
  }

  // ---------- 篩選 / 排序 ----------
  function visibleMachines() {
    const q = view.query.trim().toLowerCase();
    let list = machines.filter(m => {
      if (view.type !== 'all' && m.type !== view.type) return false;
      if (view.category !== 'all' && m.category !== view.category) return false;
      if (q && !(`${m.name} ${m.product.name} ${m.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const by = {
      hot: (a, b) => (playsOf(b) - playsOf(a)) || (Number(!!b.featured) - Number(!!a.featured)) || b.addedAt.localeCompare(a.addedAt),
      new: (a, b) => b.addedAt.localeCompare(a.addedAt),
      price: (a, b) => a.product.price - b.product.price
    }[view.sort];
    return list.sort(by);
  }

  // ---------- 渲染 ----------
  const grid = document.getElementById('machine-grid');
  const pager = document.getElementById('pager');
  const countEl = document.getElementById('result-count');

  function card(m) {
    const c = el('button', 'card');
    c.type = 'button';
    c.addEventListener('click', () => openDetail(m));
    c.appendChild(artEl(m, true));

    const body = el('div', 'card-body');
    body.append(el('h3', '', m.name), el('div', 'prod', m.product.name));

    const meta = el('div', 'card-meta');
    meta.append(el('span', '', `已遊玩 ${playsOf(m).toLocaleString()} 次`));
    const price = isFree(m)
      ? el('span', 'price free', `每日 ${m.freePlays} 次免費`)
      : el('span', 'price', `NT$${m.pricePerPlay}／次`);
    meta.appendChild(price);
    body.append(meta, el('div', 'card-cta', '查看'));
    c.appendChild(body);
    return c;
  }

  function render() {
    const list = visibleMachines();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    view.page = Math.min(view.page, pages);
    const slice = list.slice((view.page - 1) * PAGE_SIZE, view.page * PAGE_SIZE);

    const typeLabel = { all: '全部機台', free: '免費機台', paid: '付費機台' }[view.type];
    const catLabel = view.category === 'all' ? '全部分類' : view.category;
    countEl.textContent = `${typeLabel}・${catLabel}・${list.length} 台可遊玩機台`;

    grid.innerHTML = '';
    if (!slice.length) grid.appendChild(el('div', 'empty', '找不到符合的機台，換個關鍵字或分類試試。'));
    slice.forEach(m => grid.appendChild(card(m)));

    pager.innerHTML = '';
    if (pages > 1) {
      const mk = (label, page, opts = {}) => {
        const b = el('button', opts.active ? 'active' : '', label);
        b.type = 'button';
        b.disabled = !!opts.disabled;
        b.addEventListener('click', () => { view.page = page; render(); document.getElementById('machines').scrollIntoView({ behavior: 'smooth' }); });
        pager.appendChild(b);
      };
      mk('上一頁', view.page - 1, { disabled: view.page <= 1 });
      for (let p = 1; p <= pages; p++) mk(String(p), p, { active: p === view.page });
      mk('下一頁', view.page + 1, { disabled: view.page >= pages });
    }
  }

  // ---------- 機台詳情 ----------
  const modalDetail = document.getElementById('modal-detail');
  const detailBody = document.getElementById('detail-body');

  function row(label, value) {
    const r = el('div', 'detail-row');
    r.append(el('span', '', label), el('b', '', value));
    return r;
  }

  function openDetail(m) {
    detailBody.innerHTML = '';
    detailBody.appendChild(artEl(m, true));
    detailBody.appendChild(el('h3', '', m.name));
    detailBody.appendChild(el('p', 'muted', m.product.desc));

    const rows = el('div', 'detail-rows');
    rows.append(
      row('獎品', m.product.name),
      row('市價', `NT$${m.product.price}（${m.product.spec}）`),
      row('遊玩方式', isFree(m) ? `免費機台・每日 ${m.freePlays} 次（今日剩 ${freeLeft(m)} 次）` : `付費機台・NT$${m.pricePerPlay}／次`),
      row('保證取物', isFree(m) ? '免費機台不適用' : `累計投入 NT$${m.guarantee} 後，下一次必中`),
      row('累計遊玩', `${playsOf(m).toLocaleString()} 次`)
    );
    detailBody.appendChild(rows);
    detailBody.appendChild(el('p', 'detail-note', '試玩模式：使用試玩幣，不會真的收款或出貨。正式收費前會公開機率與規則。'));

    const go = el('a', 'btn-primary wide', canPlay(m) ? '開始遊玩 →' : '今日免費次數已用完');
    go.href = `play.html?m=${encodeURIComponent(m.id)}`;
    if (!canPlay(m)) { go.removeAttribute('href'); go.style.opacity = 0.5; go.style.pointerEvents = 'none'; }
    go.style.textAlign = 'center';
    detailBody.appendChild(go);

    modalDetail.classList.remove('hidden');
  }

  document.getElementById('btn-close-detail').addEventListener('click', () => modalDetail.classList.add('hidden'));
  [modalDetail, document.getElementById('modal-myprizes')].forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });

  // ---------- 我的獎品 ----------
  const modalMy = document.getElementById('modal-myprizes');
  const myList = document.getElementById('myprizes-list');
  const myBadge = document.getElementById('myprizes-badge');
  const getMyPrizes = () => lsGet('claw-my-prizes', []);

  function renderMyPrizes() {
    const list = getMyPrizes();
    myBadge.textContent = list.length;
    myList.innerHTML = '';
    if (!list.length) { myList.appendChild(el('div', 'empty', '還沒有夾中商品，去挑一台挑戰吧！')); return; }
    list.forEach(p => {
      const r = el('div', 'myprize-row');
      const icon = el('span', 'myprize-icon', p.icon);
      icon.style.background = p.color;
      const info = el('div');
      info.append(el('b', '', p.name), el('small', '', `${new Date(p.ts).toLocaleString('zh-TW')}・${p.status}`));
      r.append(icon, info);
      myList.appendChild(r);
    });
  }

  document.getElementById('btn-myprizes').addEventListener('click', () => { renderMyPrizes(); modalMy.classList.remove('hidden'); });
  document.getElementById('btn-close-myprizes').addEventListener('click', () => modalMy.classList.add('hidden'));

  // ---------- 控制項 ----------
  const catSel = document.getElementById('category');
  (window.MALL_CATEGORIES || []).forEach(c => {
    const o = el('option', '', c);
    o.value = c;
    catSel.appendChild(o);
  });

  function setType(t) {
    view.type = t; view.page = 1;
    document.querySelectorAll('#type-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.type === t));
    render();
  }
  document.querySelectorAll('#type-tabs .tab').forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));
  document.getElementById('btn-free-only').addEventListener('click', () => {
    setType('free');
    document.getElementById('machines').scrollIntoView({ behavior: 'smooth' });
  });
  catSel.addEventListener('change', () => { view.category = catSel.value; view.page = 1; render(); });
  document.getElementById('sort').addEventListener('change', (e) => { view.sort = e.target.value; view.page = 1; render(); });
  document.getElementById('search').addEventListener('input', (e) => { view.query = e.target.value; view.page = 1; render(); });

  // ---------- 遊玩提醒 (每次開啟瀏覽器分頁顯示一次) ----------
  const modalNotice = document.getElementById('modal-notice');
  let seen = false;
  try { seen = sessionStorage.getItem('claw-notice-ok') === '1'; } catch (e) { /* 無痕模式 */ }
  if (!seen) modalNotice.classList.remove('hidden');
  document.getElementById('btn-notice-ok').addEventListener('click', () => {
    modalNotice.classList.add('hidden');
    try { sessionStorage.setItem('claw-notice-ok', '1'); } catch (e) { /* 忽略 */ }
  });

  renderMyPrizes();
  render();
})();

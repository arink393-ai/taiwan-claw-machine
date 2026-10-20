/**
 * 遊戲頁啟動：依網址 ?m=<機台代號> 找出機台資料，並把該機台的商品登記成「機台裡的獎品」。
 * 沒有 ?m 就是一般娛樂模式 (沒有商品)。必須在 physics.js 之前載入 (補貨時就要抽得到商品)。
 */
(function () {
  const id = new URLSearchParams(location.search).get('m');
  const machine = id ? (window.MACHINES || []).find(m => m.id === id) : null;
  window.CLAW_MACHINE = machine || null;
  if (!machine) return;

  document.title = `${machine.name}｜飛絡力商城`;
  window.makeProductType(machine);
})();

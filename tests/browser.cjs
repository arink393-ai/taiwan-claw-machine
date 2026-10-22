const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert");
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.BASE_URL || "http://127.0.0.1:8844";
  await p.goto(base);
  assert.equal(await p.locator(".card").count(), 12);
  assert.equal(await p.locator("#catalog-total").innerText(), "19 台特色機台");
  assert(
    await p
      .locator(".hero-art img")
      .evaluate((i) => i.complete && i.naturalWidth === 1000),
  );
  await p.locator(".favorite-button").first().click();
  await p.locator("#btn-favorites").click();
  assert.equal(await p.locator(".card").count(), 1);
  await p.reload();
  assert.equal(await p.locator(".card").count(), 1);
  await p.locator(".card-main").first().click();
  assert(await p.locator("#modal-detail").isVisible());
  await p.keyboard.press("Escape");
  assert(await p.locator("#modal-detail").isHidden());
  await p.locator("#btn-favorites").click();
  await p.locator('[data-category="3C數位"]').click();
  assert.equal(await p.locator(".card").count(), 2);
  await p.locator("#search").fill("不存在的機台");
  assert.equal(await p.locator(".card").count(), 0);
  await p.locator(".empty button").click();
  assert.equal(await p.locator(".card").count(), 12);
  await p.locator("#pager button").filter({ hasText: "下一頁" }).click();
  assert.equal(await p.locator(".card").count(), 7);
  console.log(
    "PASS catalog: favorites, categories, URL state, search, reset, pagination, dialog",
  );
  await p.goto(base + "/play.html?m=tech-earbuds");
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => clawDebug.physics.machineMode), "tech");
  assert(await p.locator("[data-machine-mode=avalanche]").isDisabled());
  assert((await p.locator("#session-price").innerText()) === "20");
  await p.locator("#btn-insert-coin").click();
  let s = await p.evaluate(() => ({
    credits: clawDebug.state.credits,
    spent: clawDebug.state.accumulatedPrice,
    mode: clawDebug.state.mode,
  }));
  assert.equal(s.credits, 0);
  assert.equal(s.spent, 20);
  assert.equal(s.mode, "PLAYING");
  await p.locator("#btn-insert-100").click();
  assert.equal(await p.evaluate(() => clawDebug.state.credits), 10);
  assert.equal(await p.evaluate(() => clawDebug.state.accumulatedPrice), 220);
  await p.reload();
  assert.equal(await p.evaluate(() => clawDebug.state.credits), 10);
  assert.equal(await p.evaluate(() => clawDebug.state.accumulatedPrice), 220);
  await p.locator("#btn-help").click();
  const timer = await p.evaluate(() => clawDebug.state.currentTimer);
  await p.keyboard.press("c");
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => clawDebug.state.accumulatedPrice), 220);
  assert(
    Math.abs((await p.evaluate(() => clawDebug.state.currentTimer)) - timer) <
      0.15,
  );
  await p.keyboard.press("Escape");
  assert(await p.locator("#modal-help").isHidden());
  await p.locator("#btn-drop").click();
  await p.waitForTimeout(200);
  await p.locator("#btn-drop").click();
  console.log(
    "PASS 20-coin price, bulk deposit, per-machine persistence, modal pause/input blocking, second stop",
  );
  await p.goto(base + "/play.html?m=snack-chips");
  await p.locator("#btn-insert-coin").click();
  await p.locator("#btn-insert-coin").click();
  await p.locator("#btn-insert-coin").click();
  assert.equal(await p.evaluate(() => clawDebug.state.accumulatedPrice), 0);
  const credits = await p.evaluate(() => clawDebug.state.credits);
  await p.locator("#btn-insert-coin").click();
  assert.equal(await p.evaluate(() => clawDebug.state.credits), credits);
  assert((await p.locator("#btn-insert-coin").innerText()).includes("剩 0"));
  await p.reload();
  assert.equal(await p.evaluate(() => clawDebug.state.accumulatedPrice), 0);
  console.log("PASS free daily cap, no guarantee charge, refresh persistence");
  await p.goto(base + "/play.html");
  for (const mode of ["avalanche", "figure", "tech", "plush"]) {
    await p.locator("[data-machine-mode=" + mode + "]").click();
    await p.waitForTimeout(100);
    assert(await p.evaluate(() => clawDebug.physics.dolls.length > 0));
    for (const view of ["front", "side", "top"]) {
      await p.locator("[data-view=" + view + "]").click();
      await p.waitForTimeout(70);
    }
    await p
      .locator(".machine-showcase")
      .screenshot({ path: "/tmp/upgrade-view-" + mode + ".png" });
  }
  console.log("PASS four practice modes x three camera views");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator("#btn-focus").click();
  assert(
    (await p.locator("#btn-focus").getAttribute("aria-pressed")) === "true",
  );
  assert(
    !(await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
  );
  await p.screenshot({ path: "/tmp/upgrade-focused.png" });
  await p.keyboard.press("Escape");
  assert(
    (await p.locator("#btn-focus").getAttribute("aria-pressed")) === "false",
  );
  await p.goto(base + "/?type=free");
  assert.equal(await p.locator(".card").count(), 5);
  assert(
    !(await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
  );
  console.log(
    "PASS mobile focus, Escape, layout, persisted free exhaustion in storefront",
  );
  await p.goto(base + "/play.html?m=not-real");
  assert((await p.locator("#mb-name").innerText()).includes("找不到"));
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PASS invalid machine handling, zero runtime errors");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

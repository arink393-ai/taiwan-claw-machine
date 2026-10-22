const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.BASE_URL || "http://127.0.0.1:8844";
  await page.goto(base + "/play.html");
  for (const mode of ["avalanche", "figure", "tech", "plush"]) {
    await page.locator("[data-machine-mode=" + mode + "]").click();
    const result = await page.evaluate(() => {
      const p = clawDebug.physics;
      let awards = 0;
      const original = p.onPrizeWon;
      p.onPrizeWon = () => awards++;
      for (let i = 0; i < 1800; i++)
        p.update(
          1 / 60,
          {
            left: false,
            right: false,
            up: false,
            down: false,
            joyX: 0,
            joyY: 0,
          },
          "IDLE",
        );
      p.onPrizeWon = original;
      return { awards, count: p.dolls.length };
    });
    assert.equal(result.awards, 0);
    assert.ok(result.count > 0);
  }
  console.log(
    "PASS 30 simulated idle seconds in all four modes: no automatic awards",
  );
  await page.goto(base + "/play.html?m=tech-earbuds");
  await page.evaluate(() => {
    const p = clawDebug.physics;
    p.gantry.x = 115;
    p.gantry.depth = 0.45;
    p.claw.angle = p.claw.angleVel = 0;
    clawDebug.state.mode = "RETURNING";
  });
  await page.waitForFunction(() =>
    ["RELEASING", "IDLE"].includes(clawDebug.state.mode),
  );
  assert.ok(
    Math.abs(
      (await page.evaluate(() => clawDebug.physics.gantry.depth)) - 0.9,
    ) < 0.02,
  );
  console.log("PASS return carriage reaches chute depth before opening");
  await page.evaluate(() => {
    const p = clawDebug.physics,
      s = clawDebug.state;
    p.gantry.x = 115;
    p.gantry.depth = 0.9;
    p.claw.angle = p.claw.angleVel = 0;
    p.claw.cableLength = 70;
    const product = p.createDoll(window.PRODUCT_TYPE, 115, 200, 0.9, 1.2);
    product.isGrasped = true;
    product.guaranteedCarry = true;
    const extra = p.createDoll(
      PRIZE_TYPES.find((t) => t.id === "bear"),
      350,
      370,
      0.45,
      1,
    );
    p.dolls = [product, extra];
    p.claw.holdingPrize = product;
    p.settleTimer = p.graceTimer = 0;
    s.mode = "RETURNING";
    s.releaseScheduled = false;
    s.activeRound = true;
  });
  await page.waitForSelector("#win-overlay:not(.hidden)", { timeout: 12000 });
  assert.ok(
    (await page.locator("#win-prize-name").innerText()).includes("耳機"),
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("claw-my-prizes")).length,
    ),
    1,
  );
  await page.locator("#btn-collect-prize").click();
  console.log(
    "PASS actual large product release falls through rods, clears chute and enters inventory",
  );
  await page.screenshot({
    path: path.join(os.tmpdir(), "precision-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#btn-focus").click();
  await page.locator("[data-view=top]").click();
  await page.screenshot({
    path: path.join(os.tmpdir(), "precision-mobile.png"),
  });
  assert.ok(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PASS mobile cabinet, overhead view and no runtime errors");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

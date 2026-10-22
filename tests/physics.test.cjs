const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../prizes.js"), "utf8"),
    context,
  );
  Object.assign(context, context.window);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../physics.js"), "utf8") +
      ";globalThis.Physics=ClawPhysics;",
    context,
  );
  const physics = Object.create(context.Physics.prototype);
  Object.assign(physics, {
    width: 600,
    height: 480,
    machineMode: "avalanche",
    bounds: { maxX: 545, maxY: 410 },
    chute: { x: 60, width: 110 },
    gantry: { depth: 0.95 },
    depthTolerance: 0.17,
    rods: { gap: 66, r: 8 },
    tricks: { jam: false },
    settings: {
      baffleHeight: 45,
      isGuaranteed: true,
      grabVoltage: 26,
      carryVoltage: 16,
    },
    beatMod: { grab: 0, carry: 0 },
    claw: { x: 300, y: 200, swing: 0, holdingPrize: null },
  });
  return { context, physics };
}

test("Every mode restocks only its advertised prize categories", () => {
  const { context, physics } = setup();
  for (const [key, mode] of Object.entries(context.MACHINE_MODES)) {
    physics.machineMode = key;
    physics.initDolls();
    assert.ok(physics.dolls.length > 0);
    assert.ok(
      physics.dolls.every((d) => mode.filter(d.type)),
      key,
    );
  }
});

test("Contact and guaranteed grip agree for every prize at three scales", () => {
  const { context, physics } = setup();
  for (const type of context.PRIZE_TYPES.filter((t) => t.spawn > 0))
    for (const scale of [0.78, 1, 1.5]) {
      const doll = physics.createDoll(
        type,
        300,
        260 + type.radius * scale * 0.9,
        0.95,
        scale,
      );
      physics.dolls = [doll];
      physics.claw.holdingPrize = null;
      assert.ok(physics.touchesDoll(doll), type.id);
      assert.ok(physics.attemptGrab(), type.id);
      assert.equal(physics.claw.holdingPrize, doll);
    }
});

test("A large box resting against chute rods stops spinning", () => {
  const { context, physics } = setup();
  physics.settings.isGuaranteed = false;
  physics.settleTimer = physics.graceTimer = 0;
  const doll = physics.createDoll(
    context.PRIZE_TYPES.find((t) => t.id === "fb_hero"),
    110,
    315,
    0.95,
    1.5,
  );
  doll.rotVel = 1;
  doll.rotation = 0;
  physics.dolls = [doll];
  physics.triggerWin = () => assert.fail("Resting large box unexpectedly won");
  for (let i = 0; i < 900; i++) physics.updateDolls(1 / 60);
  const rotation = doll.rotation;
  for (let i = 0; i < 300; i++) physics.updateDolls(1 / 60);
  assert.ok(Math.abs(doll.rotation - rotation) < 0.1);
});

test("A small mall table always contains its corresponding product", () => {
  const { context, physics } = setup();
  const product = {
    id: "test-product",
    cat: "product",
    radius: 31,
    scale: 1,
    catchRadius: 35,
    spawn: 0,
  };
  context.window.PRODUCT_TYPE = product;
  physics.machineMode = "tech";
  for (let i = 0; i < 20; i++) {
    physics.initDolls();
    assert.ok(physics.dolls.some((d) => d.type === product));
  }
});

function retention({
  swing = 0.35,
  offset = 0,
  weight = 1,
  scale = 1,
  secondStop = false,
  guaranteed = false,
} = {}) {
  const { context, physics } = setup();
  let seed = 20261022;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  context.Math = math;
  physics.settings.isGuaranteed = guaranteed;
  physics.claw.swing = swing;
  physics.claw.secondStop = secondStop;
  const type = { radius: 30, catchRadius: 36, catchDifficulty: 0.5, weight };
  let kept = 0;
  for (let i = 0; i < 5000; i++) {
    physics.claw.holdingPrize = null;
    physics.claw.dropAttemptDone = false;
    physics.dolls = [physics.createDoll(type, 300 + offset, 260, 0.95, scale)];
    if (physics.attemptGrab()) {
      physics.checkReleaseOnLift();
      physics.checkDropPowerRelease();
      if (physics.claw.holdingPrize) kept++;
    }
  }
  return kept / 5000;
}

test("Precise grip beats an edge grip; heavy prizes are harder to carry", () => {
  const centered = retention(),
    edge = retention({ offset: 31 }),
    heavy = retention({ weight: 1.5, scale: 1.2 });
  assert.ok(centered > edge + 0.05, { centered, edge });
  assert.ok(centered > heavy + 0.05, { centered, heavy });
  assert.ok(centered > 0.15 && centered < 0.45, centered);
});

test("Maximum swing is not a near-certain carry; well-timed second stop helps", () => {
  const controlled = retention(),
    excessive = retention({ swing: 1 }),
    timed = retention({ secondStop: true });
  assert.ok(excessive < controlled, { excessive, controlled });
  assert.ok(excessive < 0.35, excessive);
  assert.ok(timed > controlled, { timed, controlled });
  assert.equal(retention({ guaranteed: true, weight: 1.5, scale: 1.2 }), 1);
});

test("Prizes must fully clear the chute, and idle settling cannot award a prize", () => {
  const { physics } = setup();
  physics.settleTimer = physics.graceTimer = 0;
  const type = { radius: 20, catchRadius: 28, weight: 1 };
  let wins = 0;
  physics.triggerWin = (_, i) => {
    wins++;
    physics.dolls.splice(i, 1);
  };
  physics.rewardWindow = 8;
  const doll = physics.createDoll(type, 115, 383, 0.95, 1);
  doll.vx = doll.vy = 0;
  physics.dolls = [doll];
  physics.updateDolls(0);
  assert.equal(wins, 0);
  doll.y = 445;
  physics.updateDolls(0);
  assert.equal(wins, 1);
  physics.rewardWindow = 0;
  const idleDoll = physics.createDoll(type, 115, 445, 0.95, 1);
  physics.dolls = [idleDoll];
  physics.updateDolls(0);
  assert.equal(wins, 1);
  assert.ok(idleDoll.x > physics.chute.x + physics.chute.width);
});

test("A guaranteed large prize can pass the chute rods", () => {
  const { context, physics } = setup();
  physics.settleTimer = physics.graceTimer = 0;
  physics.rewardWindow = 8;
  const doll = physics.createDoll(
    context.PRIZE_TYPES.find((t) => t.id === "fb_hero"),
    115,
    240,
    0.95,
    1.5,
  );
  doll.guaranteedCarry = true;
  doll.vx = doll.vy = 0;
  physics.dolls = [doll];
  let won = false;
  physics.triggerWin = (_, i) => {
    won = true;
    physics.dolls.splice(i, 1);
  };
  for (let i = 0; i < 600 && !won; i++) physics.updateDolls(1 / 60);
  assert.ok(won);
});

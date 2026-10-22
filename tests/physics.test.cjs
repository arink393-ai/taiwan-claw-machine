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

import test from "node:test";
import assert from "node:assert/strict";
import { calculateHealthScore, shouldBlock } from "../dist/policy.js";

test("health score applies canonical severity weights", () => {
  const score = calculateHealthScore({
    critical: 1,
    high: 2,
    medium: 3,
    low: 4
  });

  assert.equal(score, 41);
});

test("blocking policy fails on any critical issue", () => {
  assert.equal(shouldBlock({ critical: 1, high: 0, medium: 0, low: 0 }), true);
});

test("blocking policy fails when more than two high issues exist", () => {
  assert.equal(shouldBlock({ critical: 0, high: 2, medium: 0, low: 0 }), false);
  assert.equal(shouldBlock({ critical: 0, high: 3, medium: 0, low: 0 }), true);
});

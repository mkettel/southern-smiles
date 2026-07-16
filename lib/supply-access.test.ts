import assert from "node:assert/strict";
import test from "node:test";
import { isSupplyAccessPost } from "./supply-access";

test("allows the Division 3 Supplies Officer", () => {
  assert.equal(
    isSupplyAccessPost({
      title: "Supplies Officer",
      division: { number: 3 },
    }),
    true,
  );
});

test("allows the Division 4 Dental Supplies Officer", () => {
  assert.equal(
    isSupplyAccessPost({
      title: " Dental   Supplies Officer ",
      division: { number: 4 },
    }),
    true,
  );
});

test("does not grant access for the same title in another division", () => {
  assert.equal(
    isSupplyAccessPost({
      title: "Supplies Officer",
      division: { number: 4 },
    }),
    false,
  );
});

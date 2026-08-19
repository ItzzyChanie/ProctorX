import assert from "node:assert/strict";
import test from "node:test";
import { generateDefaultPassword } from "./password.util";

test("creates the documented password for a full name", () => {
  assert.equal(
    generateDefaultPassword(
      { firstName: "Jefferson", middleName: "Bernante", lastName: "Palceso" },
      2026,
    ),
    "Jbp@2026",
  );
});

test("omits a missing middle-name initial", () => {
  assert.equal(
    generateDefaultPassword({ firstName: "Alex", lastName: "Cruz" }, 2026),
    "Ac@2026",
  );
});

test("supports Unicode letters and rejects non-letter initials", () => {
  assert.equal(
    generateDefaultPassword({ firstName: "Élodie", lastName: "王" }, 2026),
    "É王@2026",
  );
  assert.throws(
    () => generateDefaultPassword({ firstName: "123", lastName: "Cruz" }, 2026),
    /First name must begin with a letter/,
  );
});

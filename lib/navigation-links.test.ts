import assert from "node:assert/strict";
import test from "node:test";
import { adminOnlyLinks } from "@/components/layout/navigation-links";

test("retired patient surveys are absent from admin navigation", () => {
  assert.equal(adminOnlyLinks.some((link) => link.href.startsWith("/admin/surveys")), false);
  assert.equal(adminOnlyLinks.some((link) => link.label === "Patient Surveys"), false);
});

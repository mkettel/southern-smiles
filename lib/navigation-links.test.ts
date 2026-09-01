import assert from "node:assert/strict";
import test from "node:test";
import { buildCommands } from "@/components/command-palette/commands";
import { adminOnlyLinks } from "@/components/layout/navigation-links";

test("retired patient surveys are absent from admin navigation", () => {
  assert.equal(adminOnlyLinks.some((link) => link.href.startsWith("/admin/surveys")), false);
  assert.equal(adminOnlyLinks.some((link) => link.label === "Patient Surveys"), false);
});

test("approved financing is absent from direct navigation shortcuts", () => {
  assert.equal(adminOnlyLinks.some((link) => link.href === "/admin/cherry-financing"), false);

  const adminCommands = buildCommands({ role: "admin" });
  assert.equal(adminCommands.some((command) => command.type === "navigate" && command.href === "/admin/cherry-financing"), false);
});

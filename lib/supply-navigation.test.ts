import assert from "node:assert/strict";
import test from "node:test";
import { buildCommands } from "@/components/command-palette/commands";

test("shows Supply Ordering once to an assigned employee", () => {
  const commands = buildCommands({
    role: "employee",
    canAccessSupplies: true,
  });

  assert.deepEqual(
    commands
      .filter((command) => command.id === "nav-admin-supplies")
      .map((command) => command.type === "navigate" && command.href),
    ["/admin/supplies"],
  );
  assert.equal(
    commands.some((command) => command.id === "nav-admin-bills"),
    false,
  );
});

test("combines Bills and Supply Ordering for an employee with both permissions", () => {
  const commands = buildCommands({
    role: "employee",
    canAccessBills: true,
    canAccessSupplies: true,
  });

  assert.deepEqual(
    commands
      .filter((command) =>
        ["nav-admin-bills", "nav-admin-supplies"].includes(command.id),
      )
      .map((command) => command.id)
      .sort(),
    ["nav-admin-bills", "nav-admin-supplies"],
  );
});

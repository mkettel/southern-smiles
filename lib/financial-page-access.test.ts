import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const pages = [
  "financial", "financial/spending", "financial/accounts", "financial/rules",
  "financial/reports", "financial-transactions", "financial-connections",
];

// Execute each page with isolated dependencies, without reading live financial data.
for (const page of pages) {
  for (const role of ["admin", "staff"]) {
    test(`${page} admits an authorized ${role} through the financial guard`, async () => {
      const calls: string[] = [];
      const render = loadPage(page, role, true, calls);
      await render();
      assert.equal(calls[0], "guard:financial");
      assert.ok(calls.includes("data"));
    });
  }

  test(`${page} denies an unassigned member before loading data`, async () => {
    const calls: string[] = [];
    const render = loadPage(page, "staff", false, calls);
    await assert.rejects(render, /access denied/);
    assert.deepEqual(calls, ["guard:financial"]);
  });
}

function loadPage(page: string, role: string, allowed: boolean, calls: string[]) {
  const source = readFileSync(new URL(`../app/(app)/admin/${page}/page.tsx`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { default?: () => Promise<unknown> } = {};
  runInNewContext(code, {
    exports,
    require(id: string) {
      if (id === "next/navigation") return { redirect: () => { throw new Error("redirected"); } };
      if (id === "@/actions/auth") return { getProfile: async () => ({ role }) };
      if (id === "@/actions/member-module-access") return {
        requireMemberModulePage: async (key: string) => {
          calls.push(`guard:${key}`);
          if (!allowed) throw new Error("access denied");
        },
      };
      if (id === "@/actions/workspace-access") return {
        getWorkspaceAccess: async () => ({ workspaceType: "household" }),
      };
      if (id.startsWith("@/actions/")) return new Proxy({}, {
        get: () => async () => { calls.push("data"); return {}; },
      });
      return new Proxy({}, { get: () => () => null });
    },
  });
  assert.ok(exports.default);
  return exports.default;
}

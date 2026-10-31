// Test-only: no deployment profile selects this entry or its unauthenticated harness routes.
import production from "../src/production-freeze-entry.js";
import { freezeStub } from "../src/production-freeze-binding.js";
import { createFreezeWorker } from "../src/production-freeze-worker.js";
export default {
  async fetch(r, env, ctx) {
    const u = new URL(r.url);
    if (u.pathname === "/open/config-invalid")
      return production.fetch(r, { ...env, FREEZE_RPC_TIMEOUT_MS: "bad" }, ctx);
    if (u.pathname === "/open/private")
      return env.OPERATOR_GATEWAY.fetch(
        new Request("https://control.invalid/current", r),
      );
    if (u.pathname === "/open/public")
      return env.PUBLIC_CONTROL.fetch(
        new Request("https://control.invalid/current", r),
      );
    const stub = await freezeStub(env);
    if (u.pathname === "/open/rpc") {
      const { method, args } = await r.json();
      if (
        ![
          "admit",
          "finish",
          "effectBegin",
          "effectEnd",
          "current",
          "control",
        ].includes(method)
      )
        return new Response(null, { status: 403 });
      try {
        return Response.json({ ok: true, value: await stub[method](...args) });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 409 });
      }
    }
    if (u.pathname.startsWith("/open/do/")) {
      const mode = u.pathname.split("/").pop(),
        fault = u.searchParams.get("fault");
      const coordinator = Object.fromEntries(
        ["admit", "finish", "effectBegin", "effectEnd"].map((method) => [
          method,
          async (...a) => {
            if (method === fault) {
              const result = await stub[method](...a);
              await new Promise((resolve) => setTimeout(resolve, 80));
              return result;
            }
            return stub[method](...a);
          },
        ]),
      );
      const d = {
        async fetch(_, e, c) {
          if (mode === "throw") throw Error("synthetic business rejection");
          if (mode === "select-throw") {
            await e.SYNC_DB.prepare("SELECT 1").first();
            throw Error("synthetic business rejection");
          }
          if (mode === "background-throw") {
            c.waitUntil(Promise.reject(Error("synthetic no-write background")));
            return new Response("queued");
          }
          const n = mode === "over-effect-budget" ? 5 : 1;
          for (let i = 0; i < n; i++)
            await e.SYNC_DB.prepare(
              "INSERT INTO synthetic_effects(value) VALUES(?)",
            )
              .bind(mode)
              .run();
          return new Response("saved");
        },
        scheduled() {},
      };
      return createFreezeWorker({
        delegate: d,
        coordinator,
        timeoutMs: 20,
      }).fetch(r, env, ctx);
    }
    return production.fetch(r, env, ctx);
  },
};

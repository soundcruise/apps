// Native fixture-only entry. Never selected by a production Wrangler config.
import { createFreezeGateway } from "../src/production-freeze-gateway.js";
import production from "../src/production-freeze-entry.js";
import legacy from "../src/studio-legacy-v137.mjs";
import { createFreezeWorker } from "../src/production-freeze-worker.js";
import { maintenanceDigest } from "../src/maintenance-bridge-v2.js";
export { ProductionFreezeCoordinator } from "../src/production-freeze-coordinator.js";
const barriers = new Map();
export default {
  async fetch(r, env, ctx) {
    const u = new URL(r.url),
      cfg = JSON.parse(env.FREEZE_CONFIG),
      stub = env.FREEZE_COORDINATOR.getByName(
        "source-" + (await maintenanceDigest(cfg.source)),
      );
    if (u.pathname === "/fixture/ready")
      return Response.json({ ready: barriers.has(u.searchParams.get("id")) });
    if (u.pathname === "/fixture/release") {
      if (!barriers.has(u.searchParams.get("id")))
        return new Response("missing", { status: 409 });
      barriers.delete(u.searchParams.get("id"));
      return new Response("released");
    }
    if (u.pathname === "/fixture/scheduled") {
      await production.scheduled({}, env, ctx);
      return new Response("scheduled");
    }
    if (u.pathname === "/fixture/delayed") {
      const id = u.searchParams.get("id"),
        d = {
          async fetch(req, e, c) {
            const target = new URL(req.url);
            target.pathname = "/v2/accounts/summary";
            target.search = "";
            const x = await legacy.fetch(new Request(target, req), e, c);
            barriers.set(id, true);
            while (barriers.has(id))
              await new Promise((resolve) => setTimeout(resolve, 2));
            return x;
          },
          scheduled() {},
        };
      return createFreezeWorker({ delegate: d, coordinator: stub }).fetch(
        r,
        env,
        ctx,
      );
    }
    if (u.pathname.startsWith("/fixture/gateway/")) {
      u.pathname = u.pathname.replace("/fixture/gateway", "");
      return createFreezeGateway({
        coordinator: stub,
        operatorPublicJwk: cfg.operatorPublicJwk,
        source: cfg.source,
      }).fetch(new Request(u, r));
    }
    if (u.pathname === "/fixture/rpc") {
      const { method, args } = await r.json();
      try {
        if (
          ![
            "admit",
            "effectBegin",
            "effectEnd",
            "finish",
            "control",
            "current",
          ].includes(method)
        )
          throw Error("fixture-method");
        return Response.json({ ok: true, value: await stub[method](...args) });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 409 });
      }
    }
    if (u.pathname === "/fixture/forged-name") {
      try {
        await env.FREEZE_COORDINATOR.getByName("forged").admit(
          "http",
          crypto.randomUUID(),
        );
        return new Response("BAD");
      } catch {
        return new Response("REJECTED", { status: 409 });
      }
    }
    if (u.pathname.startsWith("/fixture/effect/")) {
      const path = u.pathname;
      const delegate = {
        async fetch(req, e, c) {
          if (path.endsWith("/partial")) {
            await e.SYNC_ASSETS.delete("synthetic-victim");
            try {
              await e.SYNC_DB.prepare(
                "INSERT INTO missing_table VALUES(1)",
              ).run();
            } catch {}
            return Response.json({ caught: true });
          }
          if (path.endsWith("/background")) {
            c.waitUntil(
              e.SYNC_DB.prepare("INSERT INTO synthetic_effects(value)VALUES(?)")
                .bind("background")
                .run(),
            );
            return new Response("queued");
          }
          await e.SYNC_DB.prepare(
            "INSERT INTO synthetic_effects(value)VALUES(?)",
          )
            .bind("ordinary")
            .run();
          return new Response("saved");
        },
        scheduled() {},
      };
      return createFreezeWorker({ delegate, coordinator: stub }).fetch(
        r,
        env,
        ctx,
      );
    }
    if (u.pathname === "/fixture/scheduled-partial") {
      const d = {
        fetch() {},
        scheduled(t, e, c) {
          c.waitUntil(
            (async () => {
              await e.SYNC_ASSETS.delete("synthetic-scheduled-victim");
              await e.SYNC_DB.prepare(
                "INSERT INTO missing_table VALUES(1)",
              ).run();
            })(),
          );
        },
      };
      await createFreezeWorker({ delegate: d, coordinator: stub }).scheduled(
        {},
        env,
        ctx,
      );
      return new Response("queued");
    }
    if (u.pathname === "/fixture/old") {
      return legacy.fetch(
        new Request("https://fixture.invalid/health", r),
        env,
        ctx,
      );
    }
    return production.fetch(
      r,
      { ...env, SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) } },
      ctx,
    );
  },
  async scheduled(t, env, ctx) {
    return production.scheduled(t, env, ctx);
  },
};

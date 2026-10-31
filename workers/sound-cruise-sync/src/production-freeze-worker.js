import {
  boundedFreezeCoordinator,
  freezeUnavailable,
} from "./production-freeze-rpc.js";
// No fail-open path: Control failure can reduce availability, but cannot bypass a freeze.
export function createFreezeWorker({
  delegate,
  coordinator,
  timeoutMs = 2000,
  report = () => {},
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 20 || timeoutMs > 10000)
    throw Error("freeze-rpc-timeout-config");
  async function invoke(kind, run, env, ctx) {
    const id = crypto.randomUUID();
    let controlFailure = null;
    const control = boundedFreezeCoordinator(coordinator, {
      timeoutMs,
      onFailure(phase) {
        controlFailure = phase;
        report({ event: "freeze_control_unknown", phase, invocationId: id });
      },
    });
    let a;
    try {
      a = await control.admit(kind, id);
    } catch {
      return freezeUnavailable(id, controlFailure);
    }
    if (a.allowed !== true)
      return a.mode === "CAPACITY"
        ? freezeUnavailable(id, "capacity", "NOT_STARTED")
        : new Response(JSON.stringify({ code: "maintenance_freeze" }), {
            status: 423,
            headers: { "Cache-Control": "no-store" },
          });
    const jobs = [],
      effects = new Set();
    let failed = false,
      trackingUnknown = false,
      handlerOutcome = "RETURNED",
      mutationIntent = false;
    const ctx2 = {
      waitUntil(p) {
        const q = Promise.resolve(p);
        q.catch(() => {});
        jobs.push(q);
      },
      passThroughOnException() {
        throw Error("freeze-passthrough-forbidden");
      },
    };
    function effect(type, fn, mutating = true) {
      const p = (async () => {
        // Admission still covers the invocation; a single SELECT has no Source mutation.
        // Its Promise remains in effects until settled, so finish cannot outrun it.
        if (!mutating) return await fn();
        const eid = crypto.randomUUID();
        if (mutating) mutationIntent = true;
        await control.effectBegin(id, eid, type);
        let value;
        try {
          value = await fn();
          if (
            value?.success === false ||
            (Array.isArray(value) && value.some((x) => x?.success === false))
          )
            throw Error("native-effect-failed");
        } catch {
          failed = true;
          await control.effectEnd(id, eid, false);
          throw Error("freeze-effect-unknown");
        }
        try {
          await control.effectEnd(id, eid, true);
        } catch {
          // Native success is known: preserve the legacy result, but never certify tracking.
          trackingUnknown = true;
          report({
            event: "freeze_effect_ack_unknown",
            phase: "effectEnd",
            invocationId: id,
          });
        }
        return value;
      })();
      effects.add(p);
      p.then(
        () => effects.delete(p),
        () => {
          if (mutating) failed = true;
          else handlerOutcome = "HANDLER_ERROR";
          effects.delete(p);
        },
      );
      return p;
    }
    function database(db) {
      const native = new WeakMap();
      function stmt(s, mutating) {
        const w = {
          bind(...v) {
            return stmt(s.bind(...v), mutating);
          },
        };
        for (const k of ["run", "all", "first", "raw"])
          if (typeof s[k] === "function")
            w[k] = (...v) => effect("D1", () => s[k](...v), mutating);
        native.set(w, { statement: s, mutating });
        return Object.freeze(w);
      }
      return Object.freeze({
        prepare(sql) {
          // Only a single plain SELECT is known read-only. Everything else is conservative.
          return stmt(
            db.prepare(sql),
            !(
              typeof sql === "string" &&
              /^\s*SELECT\b/i.test(sql) &&
              !sql.includes(";")
            ),
          );
        },
        batch(ss) {
          const raw = ss.map((s) => {
            if (!native.has(s)) throw Error("foreign-statement");
            return native.get(s);
          });
          return effect(
            "D1",
            () => db.batch(raw.map((x) => x.statement)),
            raw.some((x) => x.mutating),
          );
        },
        withSession(...v) {
          return typeof db.withSession === "function"
            ? database(db.withSession(...v))
            : database(db);
        },
        getBookmark() {
          return db.getBookmark?.() ?? null;
        },
      });
    }
    const bucket = env.SYNC_ASSETS
      ? Object.freeze(
          Object.fromEntries(
            ["get", "head", "list", "put", "delete"].map((k) => [
              k,
              (...v) =>
                ["put", "delete"].includes(k)
                  ? effect("R2", () => env.SYNC_ASSETS[k](...v))
                  : env.SYNC_ASSETS[k](...v),
            ]),
          ),
        )
      : undefined;
    const guarded = {
      ...env,
      SYNC_DB: database(env.SYNC_DB),
      SYNC_ASSETS: bucket,
      STUDIO_RELEASE_ROUTE_ENABLED: "false",
    };
    async function finish() {
      let at = 0;
      while (at < jobs.length || effects.size) {
        const pending = [...jobs.slice(at), ...effects];
        at = jobs.length;
        const results = await Promise.allSettled(pending);
        if (results.some((x) => x.status === "rejected"))
          handlerOutcome = "BACKGROUND_ERROR";
      }
      await control.finish(
        id,
        !failed &&
          !trackingUnknown &&
          !controlFailure &&
          (handlerOutcome === "RETURNED" || !mutationIntent),
        handlerOutcome,
      );
    }
    function completeLater() {
      ctx.waitUntil(
        finish().catch(() => {
          report({
            event: "freeze_completion_unknown",
            phase: controlFailure ?? "finish",
            invocationId: id,
          });
        }),
      );
    }
    try {
      const value = await run(guarded, ctx2);
      completeLater();
      return failed ? freezeUnavailable(id, controlFailure ?? "effect") : value;
    } catch (e) {
      handlerOutcome = "HANDLER_ERROR";
      completeLater();
      return freezeUnavailable(
        id,
        controlFailure ?? "delegate",
        failed || controlFailure || mutationIntent
          ? "UNKNOWN"
          : "FAILED_NO_MUTATION",
      );
    }
  }
  return Object.freeze({
    fetch(request, env, ctx) {
      return invoke("http", (e, c) => delegate.fetch(request, e, c), env, ctx);
    },
    scheduled(event, env, ctx) {
      return invoke(
        "scheduled",
        (e, c) => delegate.scheduled(event, e, c),
        env,
        ctx,
      );
    },
  });
}

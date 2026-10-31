// Alternate entry factory only; no current Wrangler entry or Production binding is changed.
export function createFreezeWorker({ delegate, coordinator }) {
  async function invoke(kind, run, env, ctx) {
    const id = crypto.randomUUID(),
      a = await coordinator.admit(kind, id);
    if (a.allowed !== true)
      return new Response(JSON.stringify({ code: "maintenance_freeze" }), {
        status: 423,
      });
    const jobs = [],
      effects = new Set();
    let failed = false;
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
    function effect(type, fn) {
      const p = (async () => {
        const eid = crypto.randomUUID();
        await coordinator.effectBegin(id, eid, type);
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
          await coordinator.effectEnd(id, eid, false);
          throw Error("freeze-effect-unknown");
        }
        try {
          await coordinator.effectEnd(id, eid, true);
        } catch {
          failed = true;
          throw Error("freeze-effect-ack-unknown");
        }
        return value;
      })();
      effects.add(p);
      p.then(
        () => effects.delete(p),
        () => {
          failed = true;
          effects.delete(p);
        },
      );
      return p;
    }
    function database(db) {
      const native = new WeakMap();
      function stmt(s) {
        const w = {
          bind(...v) {
            return stmt(s.bind(...v));
          },
        };
        for (const k of ["run", "all", "first", "raw"])
          if (typeof s[k] === "function")
            w[k] = (...v) => effect("D1", () => s[k](...v));
        native.set(w, s);
        return Object.freeze(w);
      }
      return Object.freeze({
        prepare(sql) {
          return stmt(db.prepare(sql));
        },
        batch(ss) {
          const raw = ss.map((s) => {
            if (!native.has(s)) throw Error("foreign-statement");
            return native.get(s);
          });
          return effect("D1", () => db.batch(raw));
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
        if (results.some((x) => x.status === "rejected")) failed = true;
      }
      await coordinator.finish(id, !failed);
    }
    try {
      const value = await run(guarded, ctx2);
      ctx.waitUntil(finish());
      return value;
    } catch (e) {
      failed = true;
      ctx.waitUntil(finish());
      throw e;
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

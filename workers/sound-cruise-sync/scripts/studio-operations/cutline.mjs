import { digest, fail, same } from "./contracts.mjs";
// Independent signed observations, not local booleans or reconstructed legacy history.
export function cutlineProvider({
  authority,
  scope,
  inventory,
  operationId,
  readWitness,
}) {
  scope = structuredClone(scope);
  inventory = structuredClone(inventory);
  if (
    !Array.isArray(inventory) ||
    !inventory.length ||
    new Set(inventory.map((x) => x.id)).size !== inventory.length
  )
    fail("writer-inventory");
  const required = [
    "http",
    "workers-dev",
    "version-override",
    "service",
    "scheduled",
    "external-d1",
    "external-r2",
    "manual",
  ];
  if (required.some((x) => !inventory.some((y) => y.kind === x)))
    fail("writer-coverage");
  let pin;
  async function assertCutline() {
    const e = await readWitness(),
      p = authority.check(e, "freeze", scope);
    if (
      p.operationId !== operationId ||
      p.inventoryDigest !== digest(inventory) ||
      p.coverage !== "complete" ||
      p.registryCoverage !== "from-admission" ||
      p.legacyInflight !== "independently-resolved" ||
      !p.cutlineId ||
      !Array.isArray(p.writers)
    )
      fail("freeze-incomplete");
    same(
      p.writers.map((x) => x.id).sort(),
      inventory.map((x) => x.id).sort(),
      "freeze-writer-coverage",
    );
    for (const w of p.writers)
      if (
        !["STOPPED", "PROVEN_NO_PATH"].includes(w.admission) ||
        w.inflight !== 0 ||
        !w.effectReceiptHash ||
        w.partial !== false ||
        w.unknown !== false
      )
        fail("writer-not-drained");
    const identity = {
      id: p.id,
      sequence: p.sequence,
      cutlineId: p.cutlineId,
      evidenceDigest: digest(p),
    };
    if (!Number.isSafeInteger(p.sequence) || p.sequence < 1)
      fail("cutline-sequence");
    if (pin) same(identity, pin, "cutline-changed");
    else pin = identity;
    return Object.freeze({ ...identity, scope: digest(scope), operationId });
  }
  return Object.freeze({ assertCutline });
}
export function scheduledObserver({ emit }) {
  let r2Deletes = 0,
    r2Failures = 0,
    d1Failures = 0,
    used = false;
  const native = new WeakMap();
  return Object.freeze({
    db(db) {
      function wrap(s) {
        const w = {
          bind(...v) {
            return wrap(s.bind(...v));
          },
        };
        for (const k of ["run", "all", "first"])
          w[k] = async (...v) => {
            try {
              return await s[k](...v);
            } catch {
              d1Failures++;
              throw Error("observed-d1-failure");
            }
          };
        native.set(w, s);
        return w;
      }
      return {
        prepare: (sql) => wrap(db.prepare(sql)),
        batch: async (ss) => {
          try {
            return await db.batch(ss.map((s) => native.get(s) || s));
          } catch {
            d1Failures++;
            throw Error("observed-d1-batch-failure");
          }
        },
      };
    },

    bucket(b) {
      return {
        ...Object.fromEntries(
          ["head", "get", "put", "list"].map((k) => [k, b[k]?.bind(b)]),
        ),
        async delete(...v) {
          try {
            await b.delete(...v);
            r2Deletes++;
          } catch {
            r2Failures++;
            throw Error("observed-r2-unknown");
          }
        },
      };
    },
    async run(operationId, invoke) {
      if (used) fail("observer-reuse");
      used = true;
      emit({ type: "scheduled-start", operationId });
      try {
        const r = await invoke();
        const status = r?.status?.startsWith("HOLD")
          ? "HOLD"
          : d1Failures || r2Failures
            ? r2Deletes
              ? "PARTIAL_UNKNOWN"
              : "UNKNOWN"
            : "COMPLETED";
        const event = {
          type: "scheduled-end",
          operationId,
          status,
          r2Deletes,
          r2Failures,
          d1Failures,
        };
        emit(event);
        return event;
      } catch {
        const e = {
          type: "scheduled-end",
          operationId,
          status: r2Deletes ? "PARTIAL_UNKNOWN" : "UNKNOWN",
          r2Deletes,
          r2Failures,
          d1Failures,
        };
        emit(e);
        return e;
      }
    },
  });
}

import candidate from "./studio-production-entry.js";
import { createFreezeWorker } from "./production-freeze-worker.js";
import { freezeStub } from "./production-freeze-binding.js";
import { freezeUnavailable } from "./production-freeze-rpc.js";
export { ProductionFreezeCoordinator } from "./production-freeze-coordinator.js";
async function worker(env) {
  return createFreezeWorker({
    delegate: candidate,
    coordinator: await freezeStub(env),
    timeoutMs: Number(env.FREEZE_RPC_TIMEOUT_MS ?? 2000),
    report: (event) => console.warn(JSON.stringify(event)),
  });
}

export default {
  async fetch(r, e, c) {
    let configured;
    try {
      configured = await worker(e);
    } catch {
      return freezeUnavailable(
        crypto.randomUUID(),
        "configuration",
        "NOT_STARTED",
      );
    }
    return configured.fetch(r, e, c);
  },
  async scheduled(t, e, c) {
    let configured;
    try {
      configured = await worker(e);
    } catch {
      throw Error("freeze-scheduled-configuration-hold");
    }
    const result = await configured.scheduled(t, e, c);
    if (result instanceof Response && result.status >= 400)
      throw Error("freeze-scheduled-hold");
  },
};

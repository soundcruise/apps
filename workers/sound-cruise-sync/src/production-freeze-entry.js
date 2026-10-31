import candidate from "./studio-production-entry.js";
import { createFreezeWorker } from "./production-freeze-worker.js";
import { freezeStub } from "./production-freeze-binding.js";
export { ProductionFreezeCoordinator } from "./production-freeze-coordinator.js";
async function worker(env) {
  return createFreezeWorker({
    delegate: candidate,
    coordinator: await freezeStub(env),
  });
}

export default {
  async fetch(r, e, c) {
    return (await worker(e)).fetch(r, e, c);
  },
  async scheduled(t, e, c) {
    c.waitUntil((await worker(e)).scheduled(t, e, c));
  },
};

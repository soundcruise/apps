import { freezeStub } from "./production-freeze-binding.js";
import { createFreezeGateway } from "./production-freeze-gateway.js";
export { ProductionFreezeCoordinator } from "./production-freeze-coordinator.js";
// Not selected by any Wrangler config. No route/workers.dev/preview/cron is provisioned here.
export default {
  async fetch(r, e) {
    const cfg = JSON.parse(e.FREEZE_CONFIG);
    return createFreezeGateway({
      coordinator: await freezeStub(e),
      operatorPublicJwk: cfg.operatorPublicJwk,
      source: cfg.source,
    }).fetch(r);
  },
};

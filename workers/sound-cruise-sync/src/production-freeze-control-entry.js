import { WorkerEntrypoint } from "cloudflare:workers";
import { freezeStub } from "./production-freeze-binding.js";
import { createFreezeGateway } from "./production-freeze-gateway.js";
export { ProductionFreezeCoordinator } from "./production-freeze-coordinator.js";

// Only an explicitly approved service binding can reach this signed operator API.
export class FreezeOperatorGateway extends WorkerEntrypoint {
  async fetch(request) {
    try {
      const cfg = JSON.parse(this.env.FREEZE_CONFIG);
      return await createFreezeGateway({
        coordinator: await freezeStub(this.env),
        operatorPublicJwk: cfg.operatorPublicJwk,
        source: cfg.source,
        timeoutMs: Number(this.env.FREEZE_RPC_TIMEOUT_MS ?? 2000),
      }).fetch(request);
    } catch {
      return Response.json(
        { code: "freeze_operator_hold", outcome: "UNKNOWN" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
}
// Even accidentally enabled public Workers URLs do not expose the operator gateway.
export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};

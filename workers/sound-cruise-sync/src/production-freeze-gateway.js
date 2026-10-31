import {
  maintenanceCanonical as canonical,
  maintenanceDigest as digest,
} from "./maintenance-bridge-v2.js";
import { boundedFreezeCoordinator } from "./production-freeze-rpc.js";
// Dedicated, unconfigured operator gateway; expose only behind an approved private route.
export function createFreezeGateway({
  coordinator,
  operatorPublicJwk,
  source,
  timeoutMs = 2000,
}) {
  coordinator = boundedFreezeCoordinator(coordinator, { timeoutMs });
  return {
    async fetch(request) {
      try {
        if (
          request.method !== "POST" ||
          !["/control", "/current"].includes(new URL(request.url).pathname)
        )
          return new Response(null, { status: 404 });
        const parts = [];
        let size = 0;
        for await (const b of request.body || []) {
          size += b.length;
          if (size > 1024 * 1024) throw Error("bounded-control-body");
          parts.push(b);
        }
        const data = new Uint8Array(size);
        let i = 0;
        for (const p of parts) {
          data.set(p, i);
          i += p.length;
        }
        const x = JSON.parse(new TextDecoder().decode(data)),
          p = x.envelope?.payload;
        const kind =
          new URL(request.url).pathname === "/control"
            ? "freeze-control"
            : "freeze-current-read";
        if (
          p?.kind !== kind ||
          p.sourceDigest !== (await digest(source)) ||
          !Number.isSafeInteger(p.issued) ||
          !Number.isSafeInteger(p.expires) ||
          p.expires <= p.issued ||
          p.issued > Date.now() ||
          p.expires <= Date.now() ||
          p.expires - p.issued > 600000
        )
          throw Error("gateway-owner-scope");
        const key = await crypto.subtle.importKey(
          "jwk",
          operatorPublicJwk,
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        if (
          !(await crypto.subtle.verify(
            "Ed25519",
            key,
            Uint8Array.from(atob(x.envelope.signature), (c) => c.charCodeAt(0)),
            new TextEncoder().encode(canonical(p)),
          ))
        )
          throw Error("gateway-owner-signature");
        return Response.json(
          kind === "freeze-control"
            ? await coordinator.control(x.envelope, x.external ?? null)
            : await coordinator.current(p.nonce),
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (e) {
        const unknown = e.message === "freeze-control-unknown";
        return Response.json(
          {
            code: "freeze_gateway_hold",
            outcome: unknown ? "UNKNOWN" : "REJECTED",
          },
          {
            status: unknown ? 503 : 409,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    },
  };
}

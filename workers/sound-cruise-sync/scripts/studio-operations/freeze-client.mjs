import { freezeReaders } from "../../src/production-freeze-current.js";
// No credentials printed/saved, no retries. Endpoint and signing handle are explicit approved inputs.
export function freezeControlClient({
  endpoint,
  signRequest,
  fetchImpl = fetch,
}) {
  const url = new URL(endpoint);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.protocol !== "https:"
  )
    throw Error("private-freeze-endpoint");
  async function request(path, body) {
    const q = await fetchImpl(new URL(path, url), {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    let size = 0,
      parts = [];
    for await (const b of q.body) {
      size += b.length;
      if (size > 4 * 1024 * 1024) throw Error("current-response-budget");
      parts.push(b);
    }
    if (!q.ok) throw Error("freeze-control-result-unknown");
    const b = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      b.set(p, at);
      at += p.length;
    }
    return JSON.parse(new TextDecoder().decode(b));
  }
  return Object.freeze({
    current: async (nonce) =>
      request("/current", {
        envelope: await signRequest("freeze-current-read", { nonce }),
      }),
    control: (envelope, external) =>
      request("/control", { envelope, external }),
  });
}
export function authenticatedFreezeReaders({
  endpoint,
  signRequest,
  publicJwk,
  issuerPin,
  source,
  minimumRevision,
  fetchImpl,
}) {
  return freezeReaders({
    coordinator: freezeControlClient({ endpoint, signRequest, fetchImpl }),
    publicJwk,
    issuerPin,
    source,
    minimumRevision,
  });
}

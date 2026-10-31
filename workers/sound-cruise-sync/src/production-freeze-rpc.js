// A deadline bounds the caller. It does not cancel a remote mutation or authorize retry.
export function boundedFreezeCoordinator(
  stub,
  { timeoutMs = 2000, onFailure = () => {} } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 20 || timeoutMs > 10000)
    throw Error("freeze-rpc-timeout-config");
  const methods = [
    "admit",
    "effectBegin",
    "effectEnd",
    "finish",
    "current",
    "control",
  ];
  return Object.freeze(
    Object.fromEntries(
      methods.map((method) => [
        method,
        async (...args) => {
          let timer;
          try {
            return await Promise.race([
              Promise.resolve().then(() => stub[method](...args)),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(Error("freeze-rpc-deadline")),
                  timeoutMs,
                );
              }),
            ]);
          } catch {
            onFailure(method);
            throw Error("freeze-control-unknown");
          } finally {
            clearTimeout(timer);
          }
        },
      ]),
    ),
  );
}

export function freezeUnavailable(invocationId, phase, outcome = "UNKNOWN") {
  return Response.json(
    { code: "freeze_control_unavailable", invocationId, phase, outcome },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        ...(outcome === "NOT_STARTED" ? { "Retry-After": "5" } : {}),
      },
    },
  );
}

// Explicit stdin supplied operational scope. No credential discovery, CLI deploy or default resources.
import fs from "node:fs";
import { runApprovedOperation } from "./runner.mjs";
import { authority } from "./contracts.mjs";
import { openHost } from "./host.mjs";
import { connectResources } from "./transport.mjs";
import { runRestore, reconcileRestore } from "./operations.mjs";
import { preStudioValidator } from "./prestudio-validator.mjs";
import { digest } from "./contracts.mjs";
if (process.env.STUDIO_OPS_SYNTHETIC_CHILD === "1") {
  let input = "";
  for await (const p of process.stdin) input += p;
  const x = JSON.parse(input);
  if (x.mode !== "synthetic-fixture") throw Error("fixture-only-child");
  if (x.execution) {
    try {
      const result = await runApprovedOperation({
        authority: authority({
          publicKey: x.publicKey,
          rootHash: x.rootHash,
          synthetic: true,
        }),
        envelope: x.execution,
        scope: x.scope,
        hostEnvelope: x.host,
        resourceEnvelope: x.resources,
        keyEnvelope: x.keyEnvelope,
        archiveEnvelope: x.archive,
        fixture: x.fixture,
        observeFixture: async () => ({
          volumeUUID: "fixture-volume",
          encrypted: true,
          ...(x.host.payload.storageKind === "boot-fd-v1"
            ? { dev: x.host.payload.anchors.root[0] }
            : {}),
        }),
        readKeyFixture: async (ref) =>
          ref.service === "fixture-archive"
            ? x.key
            : ref.service === "fixture-s3"
              ? JSON.stringify({
                  accessKeyId: "fixture-access",
                  secretAccessKey: "fixture-secret",
                })
              : "fixture-read",
      });
      fs.writeFileSync(
        x.result,
        JSON.stringify({ status: result.status || result.state }),
      );
    } catch {
      fs.writeFileSync(x.result, JSON.stringify({ status: "HOLD" }));
      process.exitCode = 1;
    }
  } else {
    const a = authority({
        publicKey: x.publicKey,
        rootHash: x.rootHash,
        synthetic: true,
      }),
      h = await openHost({
        authority: a,
        envelope: x.host,
        scope: x.scope,
        root: x.root,
        keyHandle: async () => Buffer.from(x.key, "base64"),
        observeFixture: async () => ({
          volumeUUID: "fixture-volume",
          encrypted: true,
          ...(x.host.payload.storageKind === "boot-fd-v1"
            ? { dev: x.host.payload.anchors.root[0] }
            : {}),
        }),
      });
    const r = await connectResources({
      authority: a,
      envelope: x.resources,
      scope: x.scope,
      role: "restore",
      tokenHandle: async () => "fixture-read",
      s3Credentials: {
        accessKeyId: "fixture-access",
        secretAccessKey: "fixture-secret",
      },
      fixture: x.fixture,
    });
    try {
      const validator = preStudioValidator({
        bucket: r.bucket,
        expectedJournalHash: x.journalHash,
        hash: digest,
      });
      const result = x.reconcile
        ? await reconcileRestore({
            authority: a,
            archiveEnvelope: x.archive,
            scope: x.scope,
            host: h,
            resources: r,
            validator,
            operationId: x.op,
          })
        : await runRestore({
            authority: a,
            archiveEnvelope: x.archive,
            scope: x.scope,
            host: h,
            resources: r,
            validator,
            operationId: x.op,
          });
      fs.writeFileSync(
        x.result,
        JSON.stringify({ status: result.status || result.state }),
      );
    } catch (e) {
      fs.writeFileSync(
        x.result,
        JSON.stringify({
          status: "HOLD",
          reason: e.code || e.message,
          cause: e.cause?.message,
        }),
      );
      process.exitCode = 1;
    } finally {
      r.close();
    }
  }
}

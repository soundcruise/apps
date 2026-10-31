import { DurableObject } from "cloudflare:workers";
import {
  maintenanceCanonical as canonical,
  maintenanceDigest as digest,
} from "./maintenance-bridge-v2.js";
const WRITER_KINDS = [
  "http",
  "workers-dev",
  "version-override",
  "service",
  "scheduled",
  "r2-cleanup",
  "external-d1",
  "external-r2",
  "manual",
];
const hex = /^[a-f0-9]{64}$/,
  uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = (code) => {
  throw Error(code);
};
async function verify(envelope, key, kind, source) {
  const p = envelope?.payload;
  if (
    !p ||
    p.kind !== kind ||
    p.sourceDigest !== source ||
    !uuid.test(p.id || "") ||
    !Number.isSafeInteger(p.issued) ||
    !Number.isSafeInteger(p.expires) ||
    p.issued > Date.now() ||
    p.expires <= Date.now()
  )
    fail("freeze-proof-scope");
  const k = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const sig = Uint8Array.from(atob(envelope.signature), (c) => c.charCodeAt(0));
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      k,
      sig,
      new TextEncoder().encode(canonical(p)),
    ))
  )
    fail("freeze-proof-signature");
  return p;
}
// One coordination atom per exact shared D1/R2 Source. No public HTTP control API.
export class ProductionFreezeCoordinator extends DurableObject {
  #sql;
  #storage;
  #cfg;
  #source;
  #key;
  constructor(ctx, env) {
    super(ctx, env);
    this.#sql = ctx.storage.sql;
    this.#storage = ctx.storage;
    this.#cfg = JSON.parse(env.FREEZE_CONFIG);
    this.#key = JSON.parse(env.FREEZE_RECEIPT_PRIVATE_JWK);
    if (
      !["isolated", "production"].includes(this.#cfg.environment) ||
      typeof this.#cfg.source?.d1 !== "string" ||
      typeof this.#cfg.source?.r2 !== "string" ||
      !this.#cfg.source.d1 ||
      !this.#cfg.source.r2 ||
      !this.#cfg.ownerId ||
      !hex.test(this.#cfg.workerArtifactHash || "") ||
      !/^([a-f0-9]{32})$/.test(this.#cfg.namespaceId || "")
    )
      fail("freeze-config");
    this.#source = digest(this.#cfg.source).then((source) => {
      if (
        ctx.id.toString() !==
        env.FREEZE_COORDINATOR.idFromName("source-" + source).toString()
      )
        fail("freeze-coordinator-name");
      return source;
    });
    this.#sql.exec(
      "CREATE TABLE IF NOT EXISTS control(k INTEGER PRIMARY KEY,j TEXT NOT NULL)",
    );
    this.#sql.exec(
      "CREATE TABLE IF NOT EXISTS invocations(id TEXT PRIMARY KEY,epoch INTEGER,kind TEXT,state TEXT,started INTEGER,finished INTEGER)",
    );
    this.#sql.exec(
      "CREATE TABLE IF NOT EXISTS effects(id TEXT PRIMARY KEY,invocation TEXT,kind TEXT,state TEXT)",
    );
    this.#sql.exec(
      "CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,hash TEXT,j TEXT)",
    );
    if (!this.#sql.exec("SELECT k FROM control").toArray().length)
      this.#sql.exec(
        "INSERT INTO control VALUES(1,?)",
        canonical({
          mode: "OPEN",
          revision: 0,
          epoch: 1,
          source: this.#cfg.source,
        }),
      );
  }
  #state() {
    return JSON.parse(
      this.#sql.exec("SELECT j FROM control WHERE k=1").one().j,
    );
  }
  #set(s) {
    this.#sql.exec("UPDATE control SET j=? WHERE k=1", canonical(s));
  }
  async #sign(kind, body) {
    const payload = { kind, ...body };
    const k = await crypto.subtle.importKey(
      "jwk",
      this.#key,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const b = await crypto.subtle.sign(
      "Ed25519",
      k,
      new TextEncoder().encode(canonical(payload)),
    );
    return {
      payload,
      signature: btoa(String.fromCharCode(...new Uint8Array(b))),
    };
  }
  #scope(s) {
    return { ...this.#cfg.scope, operationId: s.operationId };
  }
  #common(s) {
    return {
      synthetic: this.#cfg.environment === "isolated",
      operationId: s.operationId ?? null,
      scope: null,
      sourceDigest: null,
      inventoryDigest: null,
      windowId: s.windowId ?? null,
      cutlineId: s.windowId ?? null,
      sequence: s.revision,
      id: crypto.randomUUID(),
      issued: Date.now(),
      expires: s.expires ?? Date.now() + 30000,
    };
  }
  async admit(kind, id) {
    await this.#source;
    if (!["http", "scheduled"].includes(kind) || !uuid.test(id || ""))
      fail("freeze-admission-scope");
    return this.#storage.transactionSync(() => {
      const s = this.#state();
      if (s.mode !== "OPEN") return { allowed: false, mode: s.mode };
      if (
        this.#sql.exec("SELECT id FROM invocations WHERE id=?", id).toArray()
          .length
      )
        fail("invocation-replay");
      if (
        this.#sql
          .exec(
            "SELECT count(*) n FROM invocations WHERE epoch=? AND state='ACTIVE'",
            s.epoch,
          )
          .one().n >= 2048
      )
        fail("freeze-epoch-budget");
      this.#sql.exec(
        "INSERT INTO invocations VALUES(?,?,?,'ACTIVE',?,NULL)",
        id,
        s.epoch,
        kind,
        Date.now(),
      );
      return { allowed: true, epoch: s.epoch, id };
    });
  }
  async effectBegin(invocation, id, kind) {
    await this.#source;
    if (!["D1", "R2"].includes(kind) || !uuid.test(id || ""))
      fail("freeze-effect-scope");
    return this.#storage.transactionSync(() => {
      const s = this.#state(),
        i = this.#sql
          .exec("SELECT * FROM invocations WHERE id=?", invocation)
          .toArray()[0];
      if (
        !i ||
        i.state !== "ACTIVE" ||
        i.epoch !== s.epoch ||
        !["OPEN", "CLOSING"].includes(s.mode)
      )
        fail("freeze-effect-no-admission");
      this.#sql.exec(
        "INSERT INTO effects VALUES(?,?,?,'STARTED')",
        id,
        invocation,
        kind,
      );
      return true;
    });
  }
  async effectEnd(invocation, id, confirmed) {
    await this.#source;
    this.#storage.transactionSync(() => {
      const e = this.#sql
        .exec(
          "SELECT * FROM effects WHERE id=? AND invocation=?",
          id,
          invocation,
        )
        .toArray()[0];
      if (!e || e.state !== "STARTED") fail("effect-result-replay");
      this.#sql.exec(
        "UPDATE effects SET state=? WHERE id=?",
        confirmed === true ? "CONFIRMED" : "UNKNOWN",
        id,
      );
    });
  }
  async finish(id, ok) {
    await this.#source;
    this.#storage.transactionSync(() => {
      const i = this.#sql
        .exec("SELECT * FROM invocations WHERE id=?", id)
        .toArray()[0];
      if (!i || i.state !== "ACTIVE") fail("invocation-result-replay");
      const pending = this.#sql
        .exec(
          "SELECT count(*) n FROM effects WHERE invocation=? AND state='STARTED'",
          id,
        )
        .one().n;
      if (pending) fail("effects-still-inflight");
      const unknown = this.#sql
        .exec(
          "SELECT count(*) n FROM effects WHERE invocation=? AND state='UNKNOWN'",
          id,
        )
        .one().n;
      this.#sql.exec(
        "UPDATE invocations SET state=?,finished=? WHERE id=?",
        ok === true && !unknown ? "COMPLETE" : "UNKNOWN",
        Date.now(),
        id,
      );
    });
  }
  async control(envelope, external = null) {
    const source = await this.#source,
      p = await verify(
        envelope,
        this.#cfg.operatorPublicJwk,
        "freeze-control",
        source,
      ),
      h = await digest(envelope);
    if (
      p.ownerId !== this.#cfg.ownerId ||
      !["close", "seal", "reopen", "cancel"].includes(p.action)
    )
      fail("freeze-control-owner");
    const old = this.#sql
      .exec("SELECT * FROM commands WHERE id=?", p.id)
      .toArray()[0];
    if (old) {
      if (old.hash !== h) fail("control-aba");
      return JSON.parse(old.j);
    }
    const s = this.#state();
    if (p.expectedRevision !== s.revision) fail("freeze-control-cas");
    if (p.action === "close") {
      if (
        s.mode !== "OPEN" ||
        !uuid.test(p.operationId || "") ||
        !hex.test(p.windowId || "")
      )
        fail("close-state");
      return this.#storage.transactionSync(() => {
        const current = this.#state();
        if (current.revision !== p.expectedRevision || current.mode !== "OPEN")
          fail("close-cas");
        const n = {
          ...current,
          mode: "CLOSING",
          revision: current.revision + 1,
          operationId: p.operationId,
          windowId: p.windowId,
          openedAt: Date.now(),
          pendingAtClose: this.#sql
            .exec(
              "SELECT id FROM invocations WHERE epoch=? AND state='ACTIVE' ORDER BY id",
              current.epoch,
            )
            .toArray()
            .map((x) => x.id),
          expires: p.expires,
        };
        this.#set(n);
        const r = { state: n.mode, revision: n.revision, windowId: n.windowId };
        this.#sql.exec(
          "INSERT INTO commands VALUES(?,?,?)",
          p.id,
          h,
          canonical(r),
        );
        return r;
      });
    }
    if (p.operationId !== s.operationId || p.windowId !== s.windowId)
      fail("control-window");
    if (p.action === "cancel") {
      if (s.mode !== "CLOSING") fail("cancel-state");
      const proof = await verify(
        external,
        this.#cfg.externalPublicJwk,
        "freeze-cancel",
        source,
      );
      if (
        proof.operationId !== s.operationId ||
        proof.windowId !== s.windowId ||
        proof.controlRevision !== s.revision ||
        proof.backupStopped !== true ||
        !hex.test(proof.exclusionReceiptHash || "")
      )
        fail("cancel-unproved");
      return this.#storage.transactionSync(() => {
        const c = this.#state();
        if (
          c.mode !== "CLOSING" ||
          c.revision !== s.revision ||
          this.#sql
            .exec(
              "SELECT count(*) n FROM invocations WHERE epoch=? AND state<>'COMPLETE'",
              c.epoch,
            )
            .one().n ||
          this.#sql
            .exec(
              "SELECT count(*) n FROM effects e JOIN invocations i ON i.id=e.invocation WHERE i.epoch=? AND e.state<>'CONFIRMED'",
              c.epoch,
            )
            .one().n
        )
          fail("cancel-unknown-or-inflight");
        const n = {
          mode: "OPEN",
          revision: c.revision + 1,
          epoch: c.epoch + 1,
          source: c.source,
        };
        this.#set(n);
        const r = {
          state: "OPEN",
          revision: n.revision,
          cancelledWindow: s.windowId,
        };
        this.#sql.exec(
          "INSERT INTO commands VALUES(?,?,?)",
          p.id,
          h,
          canonical(r),
        );
        return r;
      });
    }
    if (p.action === "seal") {
      if (s.mode !== "CLOSING") fail("seal-state");
      const proof = await verify(
        external,
        this.#cfg.externalPublicJwk,
        "freeze-external",
        source,
      );
      if (
        proof.environment !== this.#cfg.environment ||
        proof.namespaceId !== this.#cfg.namespaceId ||
        proof.workerArtifactHash !== this.#cfg.workerArtifactHash ||
        proof.windowId !== s.windowId ||
        proof.operationId !== s.operationId ||
        proof.controlRevision !== s.revision ||
        proof.expires < s.expires ||
        proof.legacyResolved !== true ||
        proof.partialResolved !== true ||
        proof.externalStopped !== true ||
        proof.manualStopped !== true ||
        proof.allEntrypointsInstrumented !== true ||
        ![
          "legacyEvidenceHash",
          "partialEvidenceHash",
          "externalEvidenceHash",
          "manualEvidenceHash",
          "deploymentEvidenceHash",
        ].every((k) => hex.test(proof[k] || ""))
      )
        fail("external-freeze-incomplete");
      const unresolved = this.#sql
          .exec(
            "SELECT count(*) n FROM invocations WHERE epoch=? AND state<>'COMPLETE'",
            s.epoch,
          )
          .one().n,
        unknownEffects = this.#sql
          .exec(
            "SELECT count(*) n FROM effects e JOIN invocations i ON i.id=e.invocation WHERE i.epoch=? AND e.state<>'CONFIRMED'",
            s.epoch,
          )
          .one().n;
      if (unresolved || unknownEffects) fail("drain-incomplete");
      const inv = this.#sql
          .exec(
            "SELECT * FROM invocations WHERE epoch=? AND id IN(SELECT value FROM json_each(?)) ORDER BY id",
            s.epoch,
            JSON.stringify(s.pendingAtClose),
          )
          .toArray(),
        effects = this.#sql
          .exec(
            "SELECT e.kind,count(*) n FROM effects e JOIN invocations i ON i.id=e.invocation WHERE i.epoch=? GROUP BY e.kind",
            s.epoch,
          )
          .toArray();
      const n = {
        ...s,
        mode: "SEALED",
        revision: s.revision + 1,
        proofHash: await digest(external),
      };
      const bundle = await this.#bundle(n, inv, effects, proof);
      return this.#storage.transactionSync(() => {
        const current = this.#state();
        if (
          current.mode !== "CLOSING" ||
          current.revision !== s.revision ||
          current.expires <= Date.now()
        )
          fail("seal-cas-or-expiry");
        this.#set({ ...n, bundle });
        const r = {
          state: "SEALED",
          revision: n.revision,
          windowHash: bundle.windowHash,
        };
        this.#sql.exec(
          "INSERT INTO commands VALUES(?,?,?)",
          p.id,
          h,
          canonical(r),
        );
        return r;
      });
    }
    if (s.mode !== "SEALED") fail("reopen-state");
    const proof = await verify(
      external,
      this.#cfg.externalPublicJwk,
      "freeze-reopen",
      source,
    );
    if (
      proof.windowHash !== s.bundle.windowHash ||
      proof.operationId !== s.operationId ||
      proof.windowId !== s.windowId ||
      proof.controlRevision !== s.revision ||
      !hex.test(proof.manifestHash || "") ||
      !hex.test(proof.encryptedCopyHash || "") ||
      proof.archiveVerified !== true
    )
      fail("reopen-archive-unproved");
    return this.#storage.transactionSync(() => {
      const c = this.#state();
      if (c.revision !== s.revision || c.mode !== "SEALED") fail("reopen-cas");
      const n = {
        mode: "OPEN",
        revision: s.revision + 1,
        epoch: s.epoch + 1,
        source: c.source,
      };
      this.#set(n);
      const r = { state: "OPEN", revision: n.revision };
      this.#sql.exec(
        "INSERT INTO commands VALUES(?,?,?)",
        p.id,
        h,
        canonical(r),
      );
      return r;
    });
  }
  async #bundle(s, inv, effects, proof) {
    const source = await this.#source,
      inventory = WRITER_KINDS.map((kind) => ({
        id: kind,
        kind,
        ownerId: this.#cfg.ownerId,
      })),
      inventoryDigest = await digest(inventory),
      scope = this.#scope(s),
      scopeHash = await digest(scope);
    const common = {
      ...this.#common(s),
      scope: scopeHash,
      sourceDigest: source,
      inventoryDigest,
    };
    const receipts = {},
      writers = [];
    for (const w of inventory) {
      const external = ["external-d1", "external-r2", "manual"].includes(
        w.kind,
      );
      const lane = external ? proof.lanes?.[w.kind] : null;
      if (
        external &&
        (!lane ||
          !Array.isArray(lane.startedOperationIds) ||
          !Array.isArray(lane.completedOperationIds) ||
          lane.startedOperationIds.some((x) => typeof x !== "string" || !x) ||
          lane.completedOperationIds.some((x) => typeof x !== "string" || !x) ||
          new Set(lane.startedOperationIds).size !==
            lane.startedOperationIds.length ||
          new Set(lane.completedOperationIds).size !==
            lane.completedOperationIds.length ||
          canonical([...lane.startedOperationIds].sort()) !==
            canonical([...lane.completedOperationIds].sort()) ||
          !["NONE", "CONFIRMED"].includes(lane.d1) ||
          !["NONE", "CONFIRMED"].includes(lane.r2) ||
          !hex.test(lane.receiptHash || ""))
      )
        fail("external-lane-unproved");
      const ids = external
        ? lane.startedOperationIds
        : inv
            .filter((i) =>
              w.kind === "r2-cleanup" || w.kind === "scheduled"
                ? i.kind === "scheduled"
                : i.kind === "http",
            )
            .map((i) => i.id);
      const a = await this.#sign("writer-admission", {
        ...common,
        id: crypto.randomUUID(),
        writerId: w.id,
        ownerId: w.ownerId,
        status: "STOPPED",
        closedAt: s.openedAt,
        mechanismEvidenceHash: ["external-d1", "external-r2"].includes(w.kind)
          ? proof.externalEvidenceHash
          : w.kind === "manual"
            ? proof.manualEvidenceHash
            : proof.deploymentEvidenceHash,
      });
      const ah = await digest(a);
      receipts[ah] = a;
      const observedAt = Date.now();
      const i = await this.#sign("writer-invocations", {
        ...common,
        id: crypto.randomUUID(),
        issued: observedAt,
        writerId: w.id,
        ownerId: w.ownerId,
        admissionReceiptHash: ah,
        observedThrough: observedAt,
        coverage: "complete-from-admission",
        legacyDisposition: "independently-resolved",
        legacyEvidenceHash: proof.legacyEvidenceHash,
        historyScope: "coordinator-genesis",
        historicalStartedCount: this.#sql
          .exec("SELECT count(*) n FROM invocations WHERE epoch=?", s.epoch)
          .one().n,
        historicalCompletedCount: this.#sql
          .exec(
            "SELECT count(*) n FROM invocations WHERE epoch=? AND state='COMPLETE'",
            s.epoch,
          )
          .one().n,
        closurePendingIdsOnly: !external,
        startedOperationIds: ids,
        completedOperationIds: ids,
      });
      const ih = await digest(i);
      receipts[ih] = i;
      const e = await this.#sign("writer-effects", {
        ...common,
        id: crypto.randomUUID(),
        issued: Date.now(),
        writerId: w.id,
        ownerId: w.ownerId,
        invocationReceiptHash: ih,
        state: "CONFIRMED",
        partial: false,
        unknown: false,
        d1: external
          ? lane.d1
          : effects.some((x) => x.kind === "D1")
            ? "CONFIRMED"
            : "NONE",
        r2: external
          ? lane.r2
          : effects.some((x) => x.kind === "R2")
            ? "CONFIRMED"
            : "NONE",
      });
      const eh = await digest(e);
      receipts[eh] = e;
      writers.push({
        id: w.id,
        admission: "STOPPED",
        inflight: 0,
        partial: false,
        unknown: false,
        admissionReceiptHash: ah,
        invocationReceiptHash: ih,
        effectReceiptHash: eh,
      });
    }
    const window = await this.#sign("freeze-window", {
        ...common,
        id: crypto.randomUUID(),
        issued: Date.now(),
        environment: "production",
        state: "CLOSED",
        openedAt: s.openedAt,
        coverage: "complete",
        registryCoverage: "from-admission",
        legacyInflight: "independently-resolved",
      }),
      windowHash = await digest(window);
    const freeze = await this.#sign("freeze", {
      ...common,
      id: crypto.randomUUID(),
      issued: Date.now(),
      windowHash,
      coverage: "complete",
      registryCoverage: "from-admission",
      legacyInflight: "independently-resolved",
      writers,
    });
    return {
      scope,
      inventory,
      source: this.#cfg.source,
      window,
      windowHash,
      freeze,
      receipts,
    };
  }
  async current(nonce) {
    if (!hex.test(nonce || "")) fail("current-challenge");
    const s = this.#state(),
      source = await this.#source;
    const result = {
      ...this.#common(s),
      id: crypto.randomUUID(),
      issued: Date.now(),
      expires: Math.min(Date.now() + 30000, s.expires ?? Infinity),
      sourceDigest: source,
      nonce,
      revision: s.revision,
      state: s.expires && s.expires <= Date.now() ? "EXPIRED" : s.mode,
      windowHash: s.bundle?.windowHash ?? null,
    };
    const receipt = await this.#sign("freeze-current", result);
    if (this.#state().revision !== s.revision) fail("current-race");
    return { receipt, bundle: s.mode === "SEALED" ? s.bundle : null };
  }
}

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { assertFixed, SQL_HASH } from "./ddl-plan.mjs";
import { canonical, digest, fail, same } from "./contracts.mjs";
const specs = new WeakMap(),
  UUID = /^[0-9a-f-]{36}$/,
  ACCOUNT = /^[0-9a-f]{32}$/;
async function readJSON(r) {
  if (!r.ok) fail("transport-http-" + r.status);
  let size = 0,
    parts = [];
  for await (const p of r.body) {
    size += p.length;
    if (size > 16 * 1024 * 1024) fail("transport-response-budget");
    parts.push(p);
  }
  try {
    return JSON.parse(Buffer.concat(parts));
  } catch {
    fail("transport-response-format");
  }
}
function readSQL(sql) {
  let clean = "",
    i = 0;
  for (; i < sql.length; ) {
    const c = sql[i],
      n = sql[i + 1];
    if (c === "-" && n === "-") {
      i = sql.indexOf("\n", i + 2);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) fail("sql-comment");
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "[") {
      const q = c === "[" ? "]" : c;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) fail("sql-quote");
      clean += " ? ";
      continue;
    }
    clean += c;
    i++;
  }
  if (
    !/^\s*(SELECT|WITH|PRAGMA)\b/i.test(clean) ||
    /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|ATTACH|DETACH|VACUUM|BEGIN|COMMIT|ROLLBACK|REINDEX)\b/i.test(
      clean,
    ) ||
    /;\s*\S/.test(clean)
  )
    fail("source-sql-write");
  if (
    /^\s*PRAGMA/i.test(clean) &&
    (!/^\s*PRAGMA\s+(table_info|foreign_key_list|foreign_key_check)\b/i.test(
      clean,
    ) ||
      /=/.test(clean))
  )
    fail("source-pragma");
}
function bindingDB(query, readOnly) {
  function stmt(sql, values = []) {
    if (readOnly) readSQL(sql);
    const s = {
      bind(...v) {
        return stmt(sql, v);
      },
      async all() {
        return (await query([{ sql, params: values }]))[0];
      },
      async run() {
        return (await query([{ sql, params: values }]))[0];
      },
      async first(column) {
        const row = (await s.all()).results?.[0] ?? null;
        return column === undefined || !row ? row : row[column];
      },
    };
    specs.set(s, { sql, params: values });
    return s;
  }
  return Object.freeze({
    prepare: (sql) => stmt(sql),
    async batch(ss) {
      const qs = ss.map((s) => {
        const p = specs.get(s);
        if (!p) fail("foreign-statement");
        if (readOnly) readSQL(p.sql);
        return p;
      });
      return query(qs);
    },
  });
}
export async function connectResources({
  authority,
  envelope,
  scope,
  role,
  tokenHandle,
  s3Credentials,
  fetchImpl = fetch,
  fixture,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  const p = authority.check(envelope, "resources", scope),
    r = p.resources;
  if (!authority.synthetic && fetchImpl !== globalThis.fetch)
    fail("production-transport-injection");
  if (
    !s3Credentials ||
    !(
      typeof s3Credentials === "function" ||
      (typeof s3Credentials.accessKeyId === "string" &&
        typeof s3Credentials.secretAccessKey === "string")
    )
  )
    fail("s3-credentials-required");
  if (!authority.synthetic && role !== "restore" && !p.worker)
    fail("worker-readback-required");
  if (
    !r ||
    p.role !== role ||
    !ACCOUNT.test(r.account) ||
    !UUID.test(r.d1) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r.r2?.name || "") ||
    !r.r2.created ||
    !["source", "restore", "ddl"].includes(role)
  )
    fail("resource-approval");
  if (
    role !== "source" &&
    (!Array.isArray(p.productionDenylist) || !p.productionDenylist.length)
  )
    fail("production-denylist");
  for (const x of p.productionDenylist || [])
    if (
      role === "restore" &&
      (x.d1 === r.d1 ||
        ((typeof x.r2 === "string" ? x.r2 : x.r2?.name) === r.r2.name &&
          x.account === r.account))
    )
      fail("production-target");
  if (
    role === "restore" &&
    (p.source?.d1 === r.d1 ||
      (p.source?.r2?.name === r.r2.name && p.source?.account === r.account))
  )
    fail("source-target-alias");
  if (!authority.synthetic && fixture) fail("fixture-in-production");
  const api = authority.synthetic
    ? fixture.api
    : "https://api.cloudflare.com/client/v4";
  const endpoint = authority.synthetic
    ? fixture.s3
    : "https://" +
      r.account +
      (r.r2.jurisdiction ? "." + r.r2.jurisdiction : "") +
      ".r2.cloudflarestorage.com";
  async function request(suffix, body) {
    authority.check(envelope, "resources", scope);
    let token;
    try {
      token = await tokenHandle();
      if (typeof token !== "string" || !token) fail("token-unavailable");
      const response = await fetchImpl(
        api + "/accounts/" + r.account + suffix,
        {
          method: body ? "POST" : "GET",
          redirect: "error",
          headers: {
            Authorization: "Bearer " + token,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30000),
        },
      );
      const x = await readJSON(response);
      if (x.success !== true) fail("transport-api-failure");
      return x.result;
    } catch (e) {
      if (e.code) throw e;
      fail("transport-unknown");
    } finally {
      token = null;
    }
  }
  async function verifyIdentity() {
    if (p.worker) {
      if (!/^[a-zA-Z0-9_-]+$/.test(p.worker.name)) fail("worker-identity");
      const d = await request(
          "/workers/scripts/" + p.worker.name + "/deployments",
        ),
        s = await request("/workers/scripts/" + p.worker.name + "/settings"),
        v = d.deployments?.[0];
      if (
        v?.id !== p.worker.deployment ||
        v?.versions?.length !== 1 ||
        v.versions[0].version_id !== p.worker.version ||
        v.versions[0].percentage !== 100 ||
        !s.bindings?.some(
          (b) =>
            b.name === "STUDIO_RELEASE_ROUTE_ENABLED" &&
            b.type === "plain_text" &&
            b.text === "false",
        )
      )
        fail("worker-drift");
    }

    const [db, b] = await Promise.all([
      request("/d1/database/" + r.d1),
      request("/r2/buckets/" + encodeURIComponent(r.r2.name)),
    ]);
    if (
      db.uuid !== r.d1 ||
      b.name !== r.r2.name ||
      b.creation_date !== r.r2.created ||
      (b.jurisdiction || "") !== (r.r2.jurisdiction || "")
    )
      fail("physical-resource-mismatch");
    return {
      d1: r.account + "/" + db.uuid,
      r2:
        r.account +
        "/" +
        (b.jurisdiction || "") +
        "/" +
        b.name +
        "/" +
        b.creation_date,
    };
  }
  const identity = await verifyIdentity();
  async function query(batch) {
    authority.check(envelope, "resources", scope);
    try {
      const x = await request("/d1/database/" + r.d1 + "/query", {
        batch: batch.map((s) => ({
          sql: s.sql,
          params: s.params.map((v) =>
            v instanceof Uint8Array ? Array.from(v) : v,
          ),
        })),
      });
      if (
        !Array.isArray(x) ||
        x.length !== batch.length ||
        x.some((v) => v.success !== true)
      )
        fail("d1-batch-failed");
      return x;
    } catch (e) {
      if (role === "source") throw e;
      fail("d1-write-unknown");
    }
  }
  const db = bindingDB(query, role !== "restore"),
    client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: s3Credentials,
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  async function send(C, args) {
    authority.check(envelope, "resources", scope);
    try {
      return await client.send(new C({ Bucket: r.r2.name, ...args }));
    } catch (e) {
      if (e.$metadata?.httpStatusCode === 404) return null;
      fail(role === "source" ? "r2-read-failed" : "r2-write-or-read-unknown");
    }
  }
  let currentKey, currentVersion, nextCursor, lastListedKey;
  function meta(x) {
    return {
      size: x.ContentLength,
      httpMetadata: {
        ...(x.ContentType ? { contentType: x.ContentType } : {}),
        ...(x.CacheControl ? { cacheControl: x.CacheControl } : {}),
        ...(x.ContentDisposition
          ? { contentDisposition: x.ContentDisposition }
          : {}),
        ...(x.ContentEncoding ? { contentEncoding: x.ContentEncoding } : {}),
        ...(x.ContentLanguage ? { contentLanguage: x.ContentLanguage } : {}),
        ...(x.Expires ? { cacheExpiry: x.Expires } : {}),
      },
      customMetadata: x.Metadata || {},
      etag: x.ETag,
    };
  }
  const bucket = {
    async list({ limit = 32, cursor } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32)
        fail("r2-list-budget");
      if (cursor === undefined) {
        nextCursor = undefined;
        lastListedKey = undefined;
      } else if (cursor !== nextCursor) fail("r2-cursor-order");
      const x = await send(ListObjectsV2Command, {
        MaxKeys: limit,
        ContinuationToken: cursor,
      });
      if (!x) fail("r2-list");
      const objects = x.Contents || [];
      if (objects.length > limit) fail("r2-list-budget");
      for (const o of objects) {
        if (
          typeof o.Key !== "string" ||
          !Number.isSafeInteger(o.Size) ||
          o.Size < 0 ||
          (lastListedKey !== undefined &&
            Buffer.compare(Buffer.from(o.Key), Buffer.from(lastListedKey)) <= 0)
        )
          fail("r2-list-order");
        lastListedKey = o.Key;
      }
      if (
        x.IsTruncated &&
        (!objects.length ||
          !x.NextContinuationToken ||
          x.NextContinuationToken === cursor)
      )
        fail("r2-cursor-drift");
      nextCursor = x.IsTruncated ? x.NextContinuationToken : undefined;
      return {
        objects: (x.Contents || []).map((o) => ({ key: o.Key, size: o.Size })),
        truncated: x.IsTruncated === true,
        cursor: x.NextContinuationToken,
      };
    },
    async head(key) {
      const x = await send(HeadObjectCommand, { Key: key });
      if (!x) return null;
      const m = meta(x),
        v = digest(m);
      if (currentKey === key && currentVersion !== v) fail("r2-version-drift");
      currentKey = key;
      currentVersion = v;
      return m;
    },
    async get(key, { range } = {}) {
      if (!range || range.length > 65536 || range.offset < 0)
        fail("r2-range-budget");
      const h = await bucket.head(key);
      if (!h) return null;
      const x = await send(GetObjectCommand, {
        Key: key,
        Range:
          "bytes=" + range.offset + "-" + (range.offset + range.length - 1),
        IfMatch: h.etag,
      });
      if (!x) return null;
      const pieces = [];
      let size = 0;
      for await (const part of x.Body) {
        size += part.length;
        if (size > range.length) fail("r2-body-budget");
        pieces.push(part);
      }
      const b = Buffer.concat(pieces);
      return { arrayBuffer: async () => b };
    },
  };
  function options(o) {
    return {
      ContentType: o.httpMetadata?.contentType,
      CacheControl: o.httpMetadata?.cacheControl,
      ContentDisposition: o.httpMetadata?.contentDisposition,
      ContentEncoding: o.httpMetadata?.contentEncoding,
      ContentLanguage: o.httpMetadata?.contentLanguage,
      Expires: o.httpMetadata?.cacheExpiry,
      Metadata: o.customMetadata,
    };
  }
  if (role === "restore") {
    bucket.put = async (k, b, o = {}) => {
      currentKey = undefined;
      if (b.length > 5 * 1024 * 1024) fail("r2-put-budget");
      const x = await send(PutObjectCommand, {
        Key: k,
        Body: b,
        ...options(o),
      });
      if (!x) fail("r2-put");
      return x;
    };
    bucket.createMultipartUpload = async (k, o = {}) => {
      currentKey = undefined;
      const x = await send(CreateMultipartUploadCommand, {
        Key: k,
        ...options(o),
      });
      if (!x?.UploadId) fail("r2-multipart-unknown");
      return {
        async uploadPart(n, b) {
          if (b.length > 5 * 1024 * 1024) fail("r2-part-budget");
          const z = await send(UploadPartCommand, {
            Key: k,
            UploadId: x.UploadId,
            PartNumber: n,
            Body: b,
          });
          if (!z?.ETag) fail("r2-part-unknown");
          return { partNumber: n, etag: z.ETag };
        },
        async complete(parts) {
          const z = await send(CompleteMultipartUploadCommand, {
            Key: k,
            UploadId: x.UploadId,
            MultipartUpload: {
              Parts: parts.map((p) => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
              })),
            },
          });
          if (!z) fail("r2-complete-unknown");
          return z;
        },
      };
    };
  }
  return Object.freeze({
    db,
    bucket: Object.freeze(bucket),
    identity,
    verifyIdentity,
    role,
    operationId: p.operationId,
    source: p.source,
    productionDenylist: p.productionDenylist,
    grantId: p.id,
    async ddlBatch(batch, restoreEvidence) {
      if (role !== "ddl" || p.sqlHash !== SQL_HASH) fail("ddl-role");
      assertFixed(batch);
      const witness = authority.check(
        restoreEvidence,
        "restore-accepted",
        scope,
      );
      if (
        digest(restoreEvidence) !== p.restoreEvidenceHash ||
        witness.sourceIdentity?.d1 !== identity.d1 ||
        witness.sourceIdentity?.r2 !== identity.r2 ||
        witness.fullCoverage !== true ||
        witness.preProfile !== "production102-noStudio"
      )
        fail("ddl-restore-evidence");
      return query(batch);
    },
    close: () => client.destroy(),
  });
}

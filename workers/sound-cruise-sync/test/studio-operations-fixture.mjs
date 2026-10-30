// Local-only HTTP fixture: native D1/R2 under the actual operational REST/S3 clients.
import http from "node:http";
import { randomUUID } from "node:crypto";
const xml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export async function gateway(resources) {
  const state = {
    dropDDL: false,
    failDDL: false,
    wrongIdentity: false,
    d1Writes: 0,
    s3Writes: 0,
    requests: 0,
  };
  const uploads = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      state.requests++;
      const u = new URL(req.url, "http://fixture.invalid"),
        p = u.pathname;
      if (p.startsWith("/api/")) {
        if (!req.headers.authorization?.startsWith("Bearer fixture-")) {
          res.statusCode = 403;
          return res.end("{}");
        }
        const id = p.split("/d1/database/")[1]?.split("/")[0],
          r = [...resources.values()].find((x) => x.id === id);
        const json = (x) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(x));
        };
        if (p.includes("/workers/scripts/") && p.endsWith("/deployments"))
          return json({
            success: true,
            result: {
              deployments: [
                {
                  id: state.workerDrift
                    ? "unexpected-deployment"
                    : "fixture-deployment",
                  versions: [
                    { version_id: "fixture-version", percentage: 100 },
                  ],
                },
              ],
            },
          });
        if (p.includes("/workers/scripts/") && p.endsWith("/settings"))
          return json({
            success: true,
            result: {
              bindings: [
                {
                  type: "plain_text",
                  name: "STUDIO_RELEASE_ROUTE_ENABLED",
                  text: state.workerFlag ? "true" : "false",
                },
              ],
            },
          });
        if (id && !p.endsWith("/query"))
          return json({
            success: true,
            result: { uuid: state.wrongIdentity ? randomUUID() : id },
          });
        if (p.includes("/r2/buckets/")) {
          const name = decodeURIComponent(p.split("/r2/buckets/")[1]),
            v = resources.get(name);
          return json({
            success: true,
            result: { name, creation_date: v.created, jurisdiction: "" },
          });
        }
        if (!r) throw Error("fixture-resource");
        const parts = [];
        for await (const b of req) parts.push(b);
        const body = JSON.parse(Buffer.concat(parts));
        if (!Array.isArray(body.batch)) throw Error("batch-shape");
        const isDDL = body.batch.length === 88;
        if (body.batch.some((x) => !/^\s*(SELECT|PRAGMA|WITH)\b/i.test(x.sql)))
          state.d1Writes++;
        try {
          const ss = body.batch.map((x) =>
            r.db
              .prepare(x.sql)
              .bind(
                ...x.params.map((v) =>
                  Array.isArray(v) ? new Uint8Array(v) : v,
                ),
              ),
          );
          if (isDDL && state.failDDL)
            ss.push(
              r.db.prepare("SELECT json_extract('forced_failure','$.abort')"),
            );
          const result = await r.db.batch(ss);
          if (isDDL && state.dropDDL) {
            state.dropDDL = false;
            req.socket.destroy();
            return;
          }
          return json({
            success: true,
            result: result.slice(0, body.batch.length),
          });
        } catch {
          return json({ success: false, errors: [{ code: 7500 }] });
        }
      }
      if (!p.startsWith("/s3/")) throw Error("fixture-path");
      if (!req.headers.authorization?.startsWith("AWS4-HMAC-SHA256 "))
        throw Error("s3-signature-absent");
      const seg = p.slice(4).split("/"),
        name = decodeURIComponent(seg.shift()),
        key = seg.map(decodeURIComponent).join("/"),
        r = resources.get(name);
      if (!r) throw Error("fixture-bucket");
      const b = r.bucket,
        sendXML = (s) => {
          res.setHeader("Content-Type", "application/xml");
          res.end(s);
        };
      if (req.method === "GET" && u.searchParams.get("list-type") === "2") {
        const x = await b.list({
          limit: Number(u.searchParams.get("max-keys") || 32),
          cursor: u.searchParams.get("continuation-token") || undefined,
        });
        return sendXML(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>' +
            name +
            "</Name><IsTruncated>" +
            x.truncated +
            "</IsTruncated>" +
            (x.truncated
              ? "<NextContinuationToken>" +
                xml(x.cursor) +
                "</NextContinuationToken>"
              : "") +
            x.objects
              .map(
                (o) =>
                  "<Contents><Key>" +
                  xml(o.key) +
                  "</Key><Size>" +
                  o.size +
                  "</Size></Contents>",
              )
              .join("") +
            "</ListBucketResult>",
        );
      }
      if (req.method === "HEAD" || req.method === "GET") {
        if (req.method === "GET" && state.failR2Read) {
          state.failR2Read = false;
          res.statusCode = 500;
          return res.end("injected-read-error");
        }
        const h = await b.head(key);
        if (!h) {
          res.writeHead(404);
          return res.end();
        }
        const etag = '"' + h.etag + '"';
        if (req.headers["if-match"] && req.headers["if-match"] !== etag) {
          res.writeHead(412);
          return res.end();
        }
        const hm = h.httpMetadata || {};
        res.setHeader("ETag", etag);
        res.setHeader(
          "Content-Type",
          hm.contentType || "application/octet-stream",
        );
        for (const [k, v] of Object.entries(h.customMetadata || {}))
          res.setHeader("x-amz-meta-" + k, v);
        for (const [k, v] of Object.entries({
          cacheControl: "Cache-Control",
          contentDisposition: "Content-Disposition",
          contentEncoding: "Content-Encoding",
          contentLanguage: "Content-Language",
        }))
          if (hm[k]) res.setHeader(v, hm[k]);
        if (req.method === "HEAD") {
          res.setHeader("Content-Length", h.size);
          return res.end();
        }
        const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || "");
        const range = m
          ? { offset: +m[1], length: +m[2] - m[1] + 1 }
          : undefined;
        const o = await b.get(key, range ? { range } : {}),
          data = Buffer.from(await o.arrayBuffer());
        if (range) res.statusCode = 206;
        res.setHeader("Content-Length", data.length);
        return res.end(data);
      }
      state.s3Writes++;
      const parts = [];
      for await (const d of req) parts.push(d);
      const data = Buffer.concat(parts),
        meta = {};
      for (const [k, v] of Object.entries(req.headers))
        if (k.startsWith("x-amz-meta-")) meta[k.slice(11)] = v;
      const options = {
        httpMetadata: {
          contentType:
            req.headers["content-type"] || "application/octet-stream",
          ...(req.headers["cache-control"]
            ? { cacheControl: req.headers["cache-control"] }
            : {}),
          ...(req.headers["content-disposition"]
            ? { contentDisposition: req.headers["content-disposition"] }
            : {}),
          ...(req.headers["content-language"]
            ? { contentLanguage: req.headers["content-language"] }
            : {}),
          ...(req.headers["content-encoding"]
            ? { contentEncoding: req.headers["content-encoding"] }
            : {}),
        },
        customMetadata: meta,
      };
      if (req.method === "POST" && u.searchParams.has("uploads")) {
        const upload = await b.createMultipartUpload(key, options);
        uploads.set(upload.uploadId, upload);
        return sendXML(
          "<InitiateMultipartUploadResult><Bucket>" +
            name +
            "</Bucket><Key>" +
            xml(key) +
            "</Key><UploadId>" +
            upload.uploadId +
            "</UploadId></InitiateMultipartUploadResult>",
        );
      }
      if (req.method === "PUT" && u.searchParams.has("uploadId")) {
        const x = await uploads
          .get(u.searchParams.get("uploadId"))
          .uploadPart(+u.searchParams.get("partNumber"), data);
        res.setHeader("ETag", x.etag);
        return res.end();
      }
      if (req.method === "POST" && u.searchParams.has("uploadId")) {
        const ss = [
          ...data.toString().matchAll(/<Part>([\s\S]*?)<\/Part>/g),
        ].map((x) => ({
          partNumber: +/<PartNumber>(\d+)<\/PartNumber>/.exec(x[1])[1],
          etag: /<ETag>(.*?)<\/ETag>/.exec(x[1])[1].replaceAll("&quot;", '"'),
        }));
        await uploads.get(u.searchParams.get("uploadId")).complete(ss);
        if (state.dropR2Complete) {
          state.dropR2Complete = false;
          req.socket.destroy();
          return;
        }
        return sendXML(
          '<CompleteMultipartUploadResult><ETag>"done"</ETag></CompleteMultipartUploadResult>',
        );
      }
      if (req.method === "PUT") {
        const x = await b.put(key, data, options);
        res.setHeader("ETag", x.etag);
        return res.end();
      }
      throw Error("fixture-method");
    } catch {
      res.statusCode = 500;
      res.end("fixture-error");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    resources,
    state,
    api: base + "/api",
    s3: base + "/s3",
    close: () => new Promise((r) => server.close(r)),
  };
}

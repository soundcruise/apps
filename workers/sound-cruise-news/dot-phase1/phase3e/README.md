# Phase 3E isolated Cloud Run smoke job

This is an un-deployed experiment. It reads only the fixed fictional 002 notice and target from the existing isolated Drive folder using a Cloud Run metadata-server service identity; there is no key, user OAuth, HTTP listener, scheduler, production NEWS access or persistent storage. The target candidate ID is fixed to `fictional-moon-guitar-m1-001`. Unknown documents, invalid Docs structure, missing files, untrusted notices, mismatches and errors fail closed. Docs text is reconstructed from text runs per paragraph, removing only each Google Docs paragraph terminator and joining paragraphs by LF; no candidate text is otherwise transformed. No candidate bodies, identities, or tokens are printed. Reuses PR #53 relay and PR #64 notice parsing, schema and policy. A `created` result is an ephemeral local SQLite write and is NOT a durable receipt or production candidate. No automatic retries; do not infer restart or parallel idempotency from ephemeral SQLite.

## Before execution

Require explicit approval to link a billing account, enable required APIs, create image repository/build resources and deploy a Cloud Run Job. Check the billing account, quota and budgets; budget alerts do not cap spend. Do not enable Cloud Scheduler. Do not log or export the fictional document or token. Recheck folder ACL and user `iam.serviceAccounts.actAs`; no new Editor/Owner grants. Docs/Drive and IAM Credentials are already enabled; Run, Cloud Build and Artifact Registry were not enabled at the latest audit. Default service agents or build identities may need separately reviewed permissions; do not grant broad roles automatically.

Target region: `asia-northeast1`; one task, parallelism 1, 1 vCPU, 512 MiB, 120-second timeout, zero retries; no public endpoint. Job logs contain only status/count/ready/persistent and errors, not the source text. Default logging retention may be 30 days; setting a shorter custom retention can require logging configuration changes and separate approval. Even 1-minute minimum billing and shared free-tier consumption matter.

## Proposed commands — not executed

Run in `workers/sound-cruise-news`, after explicit approval, with `gcloud` configured for the isolation account/project. This creates a minimal build context and must not include credentials or arbitrary working-tree files:

```sh
ctx="$(mktemp -d)"
mkdir -p "$ctx/dot-phase1/phase2e" "$ctx/dot-phase1/phase3b" "$ctx/dot-phase1/phase3d" "$ctx/dot-phase1/phase3e" "$ctx/dot-phase1/phase3f"
cp dot-phase1/package.json dot-phase1/package-lock.json dot-phase1/engine.mjs dot-phase1/candidate.schema.json "$ctx/dot-phase1/"
cp dot-phase1/phase2e/store.mjs "$ctx/dot-phase1/phase2e/"
cp dot-phase1/phase3b/drive-provider.mjs dot-phase1/phase3b/relay.mjs "$ctx/dot-phase1/phase3b/"
cp dot-phase1/phase3d/notice.mjs "$ctx/dot-phase1/phase3d/"
cp dot-phase1/phase3e/job.mjs "$ctx/dot-phase1/phase3e/"
cp dot-phase1/phase3f/firestore-store.mjs "$ctx/dot-phase1/phase3f/"
cp dot-phase1/phase3e/Dockerfile "$ctx/Dockerfile"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=cruise-news-drive-isolation
gcloud artifacts repositories create news-dot-isolation --repository-format=docker --location=asia-northeast1 --project=cruise-news-drive-isolation
gcloud builds submit "$ctx" --tag=asia-northeast1-docker.pkg.dev/cruise-news-drive-isolation/news-dot-isolation/smoke:phase3e --project=cruise-news-drive-isolation
gcloud run jobs deploy news-dot-isolation-smoke --image=asia-northeast1-docker.pkg.dev/cruise-news-drive-isolation/news-dot-isolation/smoke:phase3e --region=asia-northeast1 --project=cruise-news-drive-isolation --service-account=cruise-news-drive-test-reader@cruise-news-drive-isolation.iam.gserviceaccount.com --cpu=1 --memory=512Mi --tasks=1 --parallelism=1 --task-timeout=120s --max-retries=0
gcloud run jobs execute news-dot-isolation-smoke --region=asia-northeast1 --project=cruise-news-drive-isolation --wait
```

Inspect the build context before upload and remove it afterward using a deliberate temporary-directory cleanup appropriate to the environment. Check the job result in Cloud Logging with an ID-scoped filter; never include bearer tokens, document text, user OAuth data or personal data. An API denial, unexpected new IAM/service-account requirement, billing prompt, changed folder permissions, changed expected IDs, mismatched hash/version, validation failure, or unexpected cost stops execution. This is not an authorization to publish, merge or change NEWS.

## Durable staging later

Cloud Run files are ephemeral; an object with conditional creation in a dedicated isolated Cloud Storage bucket can persist an immutable payload and idempotency receipt, but atomic cross-object multi-record commits and deletion/reconciliation need a deliberate design. Firestore transactions can coordinate records at the cost of another database, IAM and pricing. Either requires separately approved configuration and tests; neither is implemented here. No production-staging result can be inferred from a local smoke test.

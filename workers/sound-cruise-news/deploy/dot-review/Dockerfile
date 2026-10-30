FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY deploy/dot-review/package.json deploy/dot-review/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY dot-phase1/package.json dot-phase1/package-lock.json ./dot-phase1/
RUN cd dot-phase1 && npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY dot-phase1/engine.mjs dot-phase1/candidate.schema.json ./dot-phase1/
COPY dot-phase1/phase2e/similarity.mjs dot-phase1/phase2e/existing.mjs ./dot-phase1/phase2e/
COPY dot-phase1/fixtures/phase2b-minimal.json ./dot-phase1/fixtures/
COPY dot-phase1/phase4a/firestore-reader.mjs dot-phase1/phase4a/preview.mjs dot-phase1/phase4a/cloudrun-api.mjs dot-phase1/phase4a/cloudrun-server.mjs ./dot-phase1/phase4a/
USER node
CMD ["node", "dot-phase1/phase4a/cloudrun-server.mjs"]

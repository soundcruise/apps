FROM node:24-bookworm-slim
WORKDIR /app
COPY dot-phase1/package.json dot-phase1/package-lock.json ./dot-phase1/
RUN cd dot-phase1 && npm ci --omit=dev
COPY dot-phase1/ ./dot-phase1/
USER node
CMD ["node", "dot-phase1/phase3e/job.mjs"]

# Physics Lens: bridge + built glasses Web App in one container.
# Build context = Meta_Challenge/app (after `npm run build` in glasses/).
FROM node:24-alpine
WORKDIR /app
COPY shared ./shared
COPY glasses/dist ./glasses/dist
COPY bridge/package.json bridge/package-lock.json ./bridge/
RUN cd bridge && npm ci --omit=dev
# Every top-level module: an explicit list missed model3d.js and the container crash-looped (14 Nov).
COPY bridge/*.js ./bridge/
COPY bridge/fixtures ./bridge/fixtures
COPY bridge/public ./bridge/public
# Exported stills and clips (glasses: npm run export:media). The folder always exists (.gitkeep).
COPY bridge/media ./bridge/media
WORKDIR /app/bridge
ENV PORT=8787 LATENCY_LOG=/data/latency.jsonl
EXPOSE 8787
CMD ["node", "--env-file-if-exists=/data/.env", "server.js"]

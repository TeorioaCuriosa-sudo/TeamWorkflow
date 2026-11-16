FROM node:24-alpine

ENV NODE_ENV=production \
    TZ=Europe/Lisbon \
    APP_TZ=Europe/Lisbon \
    DATA_DIR=/data \
    PORT=3000

RUN apk add --no-cache tzdata

WORKDIR /app

# Só a dependência de envio de emails (nodemailer). Instala-se antes do código para aproveitar a cache.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY lib ./lib
COPY public ./public

# A base de dados, as cópias diárias e os ficheiros anexados (uploads) ficam em /data (montar como volume).
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]

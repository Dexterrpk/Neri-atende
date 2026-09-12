FROM node:22-bookworm-slim
WORKDIR /app
COPY whatsapp-web/package.json whatsapp-web/package-lock.json ./
RUN npm ci --omit=dev
COPY whatsapp-web/server.mjs ./server.mjs
RUN mkdir -p /data/auth
EXPOSE 3002
CMD ["node", "server.mjs"]

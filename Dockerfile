# Tek katmanlı, bağımlılığı tek paket (ws) olan küçük imaj.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY server ./server
COPY public ./public

# Barındırma sağlayıcıları PORT'u kendisi verir; burası yalnızca yerel varsayılan.
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server/index.js"]

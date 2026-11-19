# ---- build the React client ----
FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime: Express API + static client ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./server/
RUN npm --prefix server ci --omit=dev
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
EXPOSE 4000
CMD ["node", "server/index.js"]

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* di-inline ke bundel BROWSER saat build, TIDAK dibaca saat runtime.
# Jadi nilainya harus URL yang bisa dijangkau browser pengguna — BUKAN
# http://backend:8000 (nama itu cuma ada di jaringan internal Docker).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# output: "standalone" menghasilkan server.js + node_modules minimal di sini.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# public/ TIDAK ikut terbundel ke .next/standalone — tanpa baris ini aset statis
# (mis. foto latar halaman login) jalan di `next dev` tapi 404 di container.
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

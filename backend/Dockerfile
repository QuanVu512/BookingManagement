# Booking Project — Backend production image (NestJS + Prisma).
#
# Build context là thư mục gốc của repository:
#   docker build -f backend/Dockerfile .
# Container đọc cấu hình lúc chạy qua env_file backend/.env.prod
# (DATABASE_URL trỏ Neon, SMTP trỏ Mắt Bão), không nhúng secret vào image.
# Lúc khởi động, container tự chạy `prisma migrate deploy` rồi mới mở API.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Cài đầy đủ dependency (gồm Prisma CLI và Nest CLI) để dùng cho cả
# stage build lẫn migrate lúc khởi động. Image to hơn bản prune nhưng
# chạy migrate đáng tin cậy, không phụ thuộc bước ngoài.
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Sinh Prisma client rồi biên dịch TypeScript ra backend/dist/.
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/prisma.config.ts ./backend/prisma.config.ts
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('net').connect(process.env.PORT || 4000, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy --config backend/prisma.config.ts && node backend/dist/main.js"]

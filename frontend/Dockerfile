# Booking Project — Frontend production image (Next.js standalone).
#
# Build context là thư mục gốc của repository:
#   docker build -f frontend/Dockerfile .
# Yêu cầu frontend/next.config.mjs bật `output: 'standalone'`.
# Các biến NEXT_PUBLIC_* được nhúng vào bundle lúc build từ
# frontend/.env.prod (file public, không chứa secret).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nhúng các biến cấu hình công khai cho frontend lúc Next build
ENV NEXT_PUBLIC_API_URL=https://smashpickleball.id.vn/api \
    NEXT_PUBLIC_SITE_ORIGIN=https://smashpickleball.id.vn \
    NEXT_PUBLIC_COURT_DETAILS_ENABLED=true \
    NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true \
    NEXT_PUBLIC_PAYMENT_SIMULATION_ENABLED=false
RUN npm run build:web

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Bản standalone chỉ gồm file thực sự chạy (server.js + node_modules đã lọc).
COPY --from=builder /app/frontend/.next/standalone ./
# Tài nguyên tĩnh và ảnh public không nằm trong standalone, chép thủ công.
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('net').connect(process.env.PORT || 3000, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"
CMD ["node", "server.js"]

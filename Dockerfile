FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    TZ=Asia/Tokyo

# Puppeteer/Chromium 実行に必要なライブラリ
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-ipafont-gothic \
    fonts-ipafont-mincho \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係を先にコピーしてキャッシュを効かせる
COPY package*.json ./
RUN npm ci --omit=dev

# アプリ本体
COPY . .

# Docker では headless 実行が基本
ENV HEADLESS=true

CMD ["node", "index.js"]

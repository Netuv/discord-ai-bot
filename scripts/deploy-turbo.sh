#!/bin/bash
# 🚀 Hybrid Render Turbo Layer — Deployment Script
# Jalanin ini dari laptop kamu setelah setup Render!
#
# Cara pakai:
#   1. ./scripts/deploy-turbo.sh render    — Deploy Render (via API)
#   2. ./scripts/deploy-turbo.sh secret    — Set Cloudflare secrets
#   3. ./scripts/deploy-turbo.sh worker    — Deploy Cloudflare Worker
#   4. ./scripts/deploy-turbo.sh all       — Lakukan semua langkah
#   5. ./scripts/deploy-turbo.sh guide     — Tampilkan panduan lengkap

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   🚀 Hybrid Render Turbo Layer — Deployment Script  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Konfigurasi ──────────────────────────────────────────
RENDER_SERVICE_NAME="discord-turbo-layer"
RENDER_REPO="https://github.com/Netuv/discord-ai-bot"
RENDER_ROOT_DIR="render-server"
RENDER_BUILD_CMD="npm install"
RENDER_START_CMD="npm start"
RENDER_PLAN="free"
RENDER_REGION="singapore"  # Bisa: frankfurt, oregon, singapore, virginia

# ════════════════════════════════════════════════════════════
# FUNGSI: Deploy ke Render via API
# ════════════════════════════════════════════════════════════
deploy_render() {
  echo -e "${BOLD}📡 Langkah 1: Deploy ke Render.com${NC}"
  echo ""

  if [ -z "$RENDER_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  RENDER_API_KEY tidak di-set.${NC}"
    echo ""
    echo -e "${BOLD}📋 Cara Manual — Deploy via Web UI:${NC}"
    echo "  1. Buka https://dashboard.render.com"
    echo "  2. Klik 'New +' > 'Web Service'"
    echo "  3. Connect GitHub repo: Netuv/discord-ai-bot"
    echo "  4. Isi konfigurasi:"
    echo "     • Name: ${RENDER_SERVICE_NAME}"
    echo "     • Root Directory: ${RENDER_ROOT_DIR}"
    echo "     • Build Command: ${RENDER_BUILD_CMD}"
    echo "     • Start Command: ${RENDER_START_CMD}"
    echo "     • Plan: ${RENDER_PLAN}"
    echo "     • Region: ${RENDER_REGION}"
    echo "  5. Set Environment Variables (optional):"
    echo "     • OPENROUTER_API_KEY = <key kamu>"
    echo "     • NVIDIA_API_KEY = <key kamu>"
    echo "  6. Klik 'Create Web Service'"
    echo ""
    echo -e "${YELLOW}⏳ Tunggu 2-3 menit sampai deploy selesai.${NC}"
    echo -e "${YELLOW}📝 Catet URL-nya, misal: https://discord-turbo-layer.onrender.com${NC}"
    echo ""
    return 0
  fi

  # Deploy via Render API (kalau ada API key)
  echo "🔄 Deploying to Render via API..."
  
  # Cek apakah service sudah ada
  EXISTING=$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services?name=${RENDER_SERVICE_NAME}" 2>/dev/null)

  SERVICE_ID=$(echo "$EXISTING" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$SERVICE_ID" ]; then
    echo "✅ Service sudah ada (ID: $SERVICE_ID). Trigger deploy..."
    curl -s -X POST \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      "https://api.render.com/v1/services/$SERVICE_ID/deploys" > /dev/null
    echo "🚀 Deploy triggered! Cek dashboard Render untuk progress."
  else
    echo "🆕 Membuat service baru..."
    echo -e "${YELLOW}⚠️  Buat dulu via Web UI, atau pastikan API key punya akses create.${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Set Cloudflare Secret
# ════════════════════════════════════════════════════════════
set_secret() {
  echo -e "${BOLD}🔐 Langkah 2: Set Cloudflare Secret${NC}"
  echo ""

  if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠️  Masukkan URL Render service kamu.${NC}"
    echo ""
    read -p "   Masukkan Render URL (contoh: https://discord-turbo-layer.onrender.com): " RENDER_URL
  else
    RENDER_URL="$1"
  fi

  if [ -z "$RENDER_URL" ]; then
    echo -e "${RED}❌ URL Render diperlukan. Skip...${NC}"
    echo -e "${YELLOW}   Nanti jalanin: ./scripts/deploy-turbo.sh secret <url>${NC}"
    return 1
  fi

  echo "🔧 Set RENDER_SERVICE_URL = $RENDER_URL"
  echo ""

  # Set secret via wrangler
  npx wrangler secret put RENDER_SERVICE_URL <<< "$RENDER_URL"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Secret RENDER_SERVICE_URL berhasil di-set!${NC}"
  else
    echo -e "${RED}❌ Gagal set secret. Pastikan kamu sudah login: npx wrangler login${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Deploy Worker
# ════════════════════════════════════════════════════════════
deploy_worker() {
  echo -e "${BOLD}🌤️  Langkah 3: Deploy Cloudflare Worker${NC}"
  echo ""

  echo "🔧 Deploy Worker ke Cloudflare..."
  echo ""
  npx wrangler deploy

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Worker berhasil di-deploy!${NC}"
    echo ""
    echo "📡 Endpoints:"
    echo "  • MCP: https://discord-ai-bot.luminary-bot.workers.dev/mcp"
    echo "  • Interactions: https://discord-ai-bot.luminary-bot.workers.dev/interactions"
  else
    echo -e "${RED}❌ Gagal deploy. Pastikan sudah login: npx wrangler login${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Tampilkan Guide Lengkap
# ════════════════════════════════════════════════════════════
show_guide() {
  echo -e "${BOLD}📖 HYBRID RENDER TURBO LAYER — DEPLOYMENT GUIDE${NC}"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📋 Prasyarat:${NC}"
  echo "  ✅ Kode sudah di-push ke GitHub"
  echo "  ✅ Akun Render.com (daftar gratis di https://dashboard.render.com)"
  echo "  ✅ Akun Cloudflare dengan Workers"
  echo "  ✅ wrangler sudah login (npx wrangler login)"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📡 STEP 1: Deploy ke Render.com${NC}"
  echo ""
  echo "  1️⃣  Buka https://dashboard.render.com"
  echo "  2️⃣  Klik 'New +' > 'Web Service'"
  echo "  3️⃣  Pilih 'Build and deploy from a Git repository'"
  echo "  4️⃣  Connect GitHub → pilih 'Netuv/discord-ai-bot'"
  echo "  5️⃣  Isi konfigurasi:"
  echo "      ┌─────────────────────────────────────────────┐"
  echo "      │ Name:           discord-turbo-layer         │"
  echo "      │ Region:         Singapore                   │"
  echo "      │ Branch:         master                      │"
  echo "      │ Root Directory: render-server               │"
  echo "      │ Build Command:  npm install                 │"
  echo "      │ Start Command:  npm start                   │"
  echo "      │ Plan:           Free                        │"
  echo "      └─────────────────────────────────────────────┘"
  echo "  6️⃣  Tambah Environment Variables (optional):"
  echo "      • OPENROUTER_API_KEY = <key dari openrouter.ai>"
  echo "      • NVIDIA_API_KEY = <key dari build.nvidia.com>"
  echo "      (Kalau gak diisi, Render tetap jalan dan return fallback)"
  echo ""
  echo "  7️⃣  Klik 'Deploy Web Service'"
  echo "  8️⃣  ⏳ Tunggu ~3 menit sampai status 'Live'"
  echo "  9️⃣  Catet URL: https://discord-turbo-layer.onrender.com"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}🔐 STEP 2: Set Cloudflare Secret${NC}"
  echo ""
  echo "  npx wrangler secret put RENDER_SERVICE_URL"
  echo "  # Paste URL: https://discord-turbo-layer.onrender.com"
  echo ""
  echo "  Atau:"
  echo "  ./scripts/deploy-turbo.sh secret https://discord-turbo-layer.onrender.com"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}🌤️  STEP 3: Deploy Worker${NC}"
  echo ""
  echo "  npx wrangler deploy"
  echo ""
  echo "  Atau:"
  echo "  ./scripts/deploy-turbo.sh worker"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}🧪 STEP 4: Testing${NC}"
  echo ""
  echo "  1️⃣  Test health Render:"
  echo "      curl https://discord-turbo-layer.onrender.com/health"
  echo ""
  echo "  2️⃣  Test /ask di Discord:"
  echo "      /ask Halo! — harus responsif cepat"
  echo ""
  echo "  3️⃣  Test prompt panjang:"
  echo "      /ask [200+ kata] — harus loading dulu, lalu jawaban masuk"
  echo ""
  echo "  4️⃣  Test failover (matikan Render):"
  echo "      Stop service di dashboard Render"
  echo "      /ask Halo — bot harus tetap jawab via Worker fallback"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📊 Monitoring${NC}"
  echo ""
  echo "  • Render logs: https://dashboard.render.com → Services → Logs"
  echo "  • Worker logs: https://dash.cloudflare.com → Workers & Pages → discord-ai-bot → Logs"
  echo "  • Cron logs: via /cron/logs endpoint"
  echo ""
  echo -e "${BOLD}⛔ Rollback${NC}"
  echo ""
  echo "  Kalau ada masalah:"
  echo "  npx wrangler secret delete RENDER_SERVICE_URL"
  echo "  npx wrangler deploy  # deploy ulang tanpa Render"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${GREEN}✨ Selamat! Render Turbo Layer siap mempercepat bot kamu!${NC}"
}

# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════
case "${1:-guide}" in
  render)
    deploy_render
    ;;
  secret)
    set_secret "$2"
    ;;
  worker)
    deploy_worker
    ;;
  all)
    echo -e "${BOLD}🚀 Hybrid Render Turbo Layer — Full Deployment${NC}"
    echo "================================================"
    echo ""
    echo -e "${YELLOW}⚠️  Untuk 'all', kamu perlu:${NC}"
    echo "  • Render API Key (set RENDER_API_KEY)"
    echo "  • Cloudflare login aktif"
    echo ""
    echo "Better jalanin step by step pake guide:"
    echo "  ./scripts/deploy-turbo.sh guide"
    deploy_render
    echo ""
    echo -e "${YELLOW}⚠️  Set secret manual dulu ya:${NC}"
    echo "  ./scripts/deploy-turbo.sh secret <url>"
    echo ""
    deploy_worker
    ;;
  guide|--help|-h|*)
    show_guide
    ;;
esac

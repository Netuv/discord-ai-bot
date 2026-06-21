#!/bin/bash
# 🚀 Hybrid Turbo Layer — Deployment Script (Koyeb)
# Jalanin dari laptop kamu setelah Turbo Layer siap!
#
# Cara pakai:
#   1. ./scripts/deploy-turbo.sh koyeb-install   — Install Koyeb CLI
#   2. ./scripts/deploy-turbo.sh koyeb-deploy    — Deploy via Koyeb CLI
#   3. ./scripts/deploy-turbo.sh secret <url>    — Set Cloudflare secrets
#   4. ./scripts/deploy-turbo.sh worker           — Deploy Cloudflare Worker
#   5. ./scripts/deploy-turbo.sh guide            — Tampilkan panduan lengkap
#   6. ./scripts/deploy-turbo.sh test <url>       — Test service

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   🚀 Hybrid Turbo Layer — Deployment Script (Koyeb) ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ════════════════════════════════════════════════════════════
# FUNGSI: Install Koyeb CLI
# ════════════════════════════════════════════════════════════
install_koyeb_cli() {
  echo -e "${BOLD}📦 Install Koyeb CLI${NC}"
  echo ""

  if command -v koyeb &> /dev/null; then
    echo "✅ Koyeb CLI sudah terinstall: $(koyeb version 2>/dev/null || echo 'ok')"
    return 0
  fi

  echo "⬇️  Downloading Koyeb CLI..."
  curl -fsSL https://cli.koyeb.com/install.sh | sh

  if command -v koyeb &> /dev/null; then
    echo -e "${GREEN}✅ Koyeb CLI berhasil diinstall!${NC}"
    echo ""
    echo "🔐 Login dulu:"
    echo "  koyeb login"
    echo ""
    echo "📋 Buka link yang muncul di browser, login, lalu paste token."
  else
    echo -e "${RED}❌ Gagal install. Coba manual: https://cli.koyeb.com/${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Deploy ke Koyeb via CLI
# ════════════════════════════════════════════════════════════
deploy_koyeb() {
  echo -e "${BOLD}📡 Langkah 1: Deploy ke Koyeb${NC}"
  echo ""

  if ! command -v koyeb &> /dev/null; then
    echo -e "${YELLOW}⚠️  Koyeb CLI belum terinstall.${NC}"
    echo "   Jalanin dulu: ./scripts/deploy-turbo.sh koyeb-install"
    echo ""
    echo -e "${BOLD}📋 Atau deploy manual via Web UI:${NC}"
    koyeb_manual_guide
    return 0
  fi

  # Cek login
  if ! koyeb app list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Koyeb CLI belum login.${NC}"
    echo "   Jalanin: koyeb login"
    echo ""
    koyeb_manual_guide
    return 0
  fi

  echo "🚀 Deploying to Koyeb via CLI..."
  echo ""

  koyeb app init discord-turbo-layer \
    --git github.com/Netuv/discord-ai-bot \
    --git-branch master \
    --git-builder docker \
    --ports 3000:http \
    --routes /:3000

  echo ""
  echo -e "${GREEN}✅ App 'discord-turbo-layer' dibuat di Koyeb!${NC}"
  echo ""
  echo "⏳ Tunggu build selesai:"
  echo "  koyeb service logs discord-turbo-layer/turbo-layer -t build"
  echo ""
  echo "📝 Cek URL setelah deploy:"
  echo "  koyeb app get discord-turbo-layer"
  echo ""
  echo "📡 Setelah dapat URL, set secret:"
  echo "  ./scripts/deploy-turbo.sh secret https://discord-turbo-layer-xxx.koyeb.app"
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Panduan Manual Deploy via Web UI Koyeb
# ════════════════════════════════════════════════════════════
koyeb_manual_guide() {
  echo ""
  echo -e "${BOLD}📋 Langkah Manual — Deploy via Web UI Koyeb:${NC}"
  echo "  1️⃣  Buka https://app.koyeb.com/"
  echo "  2️⃣  Daftar gratis — TIDAK PERLU CREDIT CARD! 🎉"
  echo "  3️⃣  Klik 'Create Web Service'"
  echo "  4️⃣  Pilih 'GitHub' sebagai deployment method"
  echo "  5️⃣  Connect GitHub → pilih repo 'Netuv/discord-ai-bot'"
  echo "  6️⃣  Isi konfigurasi:"
  echo "      ┌─────────────────────────────────────────────┐"
  echo "      │ Service Name:  discord-turbo-layer          │"
  echo "      │ Builder:       Docker                       │"
  echo "      │ Dockerfile:    render-server/Dockerfile     │"
  echo "      │ Port:          3000                         │"
  echo "      │ Instance:      Nano (Free)                  │"
  echo "      │ Region:        Singapore / Frankfurt        │"
  echo "      └─────────────────────────────────────────────┘"
  echo "  7️⃣  (Optional) Set Environment Variables:"
  echo "      • OPENROUTER_API_KEY = <key dari openrouter.ai>"
  echo "      • NVIDIA_API_KEY = <key dari build.nvidia.com>"
  echo "  8️⃣  Klik 'Deploy'"
  echo "  9️⃣  ⏳ Tunggu 2-3 menit sampai status 'Healthy'"
  echo "  🔟  Catet URL: https://discord-turbo-layer-xxx.koyeb.app"
  echo ""
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Set Cloudflare Secret
# ════════════════════════════════════════════════════════════
set_secret() {
  echo -e "${BOLD}🔐 Langkah 2: Set Cloudflare Secret${NC}"
  echo ""

  if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠️  Masukkan URL Turbo Layer service kamu.${NC}"
    echo ""
    echo -e "${YELLOW}   Contoh URL Koyeb: https://discord-turbo-layer-xxx.koyeb.app${NC}"
    echo ""
    read -p "   Masukkan URL: " TURBO_URL
  else
    TURBO_URL="$1"
  fi

  if [ -z "$TURBO_URL" ]; then
    echo -e "${RED}❌ URL diperlukan. Nanti jalanin:${NC}"
    echo -e "${YELLOW}   ./scripts/deploy-turbo.sh secret https://url-kamu.koyeb.app${NC}"
    return 1
  fi

  # Hapus trailing slash
  TURBO_URL="${TURBO_URL%/}"

  echo "🔧 Set RENDER_SERVICE_URL = $TURBO_URL"
  echo ""

  # Set secret via wrangler
  npx wrangler secret put RENDER_SERVICE_URL <<< "$TURBO_URL"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Secret RENDER_SERVICE_URL berhasil di-set!${NC}"
  else
    echo -e "${RED}❌ Gagal set secret. Pastikan kamu sudah login:${NC}"
    echo -e "${YELLOW}   npx wrangler login${NC}"
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
    echo -e "${RED}❌ Gagal deploy. Pastikan sudah login:${NC}"
    echo -e "${YELLOW}   npx wrangler login${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Test Service
# ════════════════════════════════════════════════════════════
test_service() {
  local url="$1"
  if [ -z "$url" ]; then
    echo -e "${YELLOW}⚠️  Masukkan URL Turbo Layer.${NC}"
    read -p "   URL: " url
  fi
  url="${url%/}"

  echo -e "${BOLD}🧪 Testing Turbo Layer: $url${NC}"
  echo ""

  # Test health
  echo -n "📡 Health check... "
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ OK (HTTP $HTTP_CODE)${NC}"
  else
    echo -e "${RED}❌ Gagal (HTTP $HTTP_CODE)${NC}"
  fi

  # Test health response
  echo -n "📦 Health data... "
  HEALTH=$(curl -s --max-time 10 "$url/health" 2>/dev/null || echo "{}")
  PROVIDERS=$(echo "$HEALTH" | grep -o '"providers":\[[^]]*\]' || echo "[]")
  echo -e "${CYAN}$PROVIDERS${NC}"

  # Test AI chat (tanpa API key, harus 503)
  echo -n "🤖 AI chat test... "
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}' \
    --max-time 15 "$url/ai/chat" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "503" ]; then
    echo -e "${YELLOW}⚠️  503 (expected — no API key)${NC}"
  elif [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 200 (with API key!)${NC}"
  else
    echo -e "${RED}❌ HTTP $HTTP_CODE${NC}"
  fi

  echo ""
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✨ Turbo Layer siap digunakan!${NC}"
  else
    echo -e "${YELLOW}ℹ️  Set API key di dashboard Koyeb untuk aktifkan AI.${NC}"
    echo -e "${YELLOW}   Tapi service tetap bisa dipake — fallback ke Worker.${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Tampilkan Guide Lengkap
# ════════════════════════════════════════════════════════════
show_guide() {
  echo -e "${BOLD}📖 HYBRID TURBO LAYER — DEPLOYMENT GUIDE (KOYEB)${NC}"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📋 Prasyarat:${NC}"
  echo "  ✅ Kode sudah di-push ke GitHub"
  echo "  ✅ Akun Koyeb (app.koyeb.com) — GRATIS, NO CC 🎉"
  echo "  ✅ Akun Cloudflare dengan Workers"
  echo "  ✅ wrangler sudah login (npx wrangler login)"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📡 STEP 1: Deploy ke Koyeb${NC}"
  echo ""
  echo "  🅰️  Via Web UI (termudah — recommended):"
  echo ""
  echo "  1️⃣  Buka https://app.koyeb.com/"
  echo "  2️⃣  Daftar gratis (Google/GitHub login) — NO CREDIT CARD"
  echo "  3️⃣  Klik 'Create Web Service'"
  echo "  4️⃣  Pilih 'GitHub' → 'Connect GitHub'"
  echo "  5️⃣  Grant akses → pilih repo 'Netuv/discord-ai-bot'"
  echo "  6️⃣  Isi konfigurasi:"
  echo "      ┌─────────────────────────────────────────────┐"
  echo "      │ Service Name:  discord-turbo-layer          │"
  echo "      │ Builder:       Docker                       │"
  echo "      │ Dockerfile:    render-server/Dockerfile     │"
  echo "      │ Port:          3000                         │"
  echo "      │ Instance:      Nano (Free ✓)                │"
  echo "      │ Region:        Singapore (paling dekat)     │"
  echo "      └─────────────────────────────────────────────┘"
  echo "  7️⃣  (Optional) Environment Variables — scroll ke bawah:"
  echo "      • OPENROUTER_API_KEY = <key dari openrouter.ai>"
  echo "      • NVIDIA_API_KEY = <key dari build.nvidia.com>"
  echo "  8️⃣  Klik 'Deploy'"
  echo "  9️⃣  ⏳ Tunggu 2-3 menit sampai status 'Healthy'"
  echo "  🔟  Copy URL: https://discord-turbo-layer-xxx.koyeb.app"
  echo ""
  echo -e "  ${CYAN}Atau via CLI:${NC}"
  echo "  ./scripts/deploy-turbo.sh koyeb-install  # Install CLI"
  echo "  koyeb login                                # Login"
  echo "  ./scripts/deploy-turbo.sh koyeb-deploy    # Deploy"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}🔐 STEP 2: Set Cloudflare Secret${NC}"
  echo ""
  echo "  npx wrangler secret put RENDER_SERVICE_URL"
  echo "  # Paste URL dari Koyeb: https://discord-turbo-layer-xxx.koyeb.app"
  echo ""
  echo "  Atau pake script:"
  echo "  ./scripts/deploy-turbo.sh secret https://discord-turbo-layer-xxx.koyeb.app"
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
  echo "  1️⃣  Test health:"
  echo "      curl https://discord-turbo-layer-xxx.koyeb.app/health"
  echo "      ./scripts/deploy-turbo.sh test https://discord-turbo-layer-xxx.koyeb.app"
  echo ""
  echo "  2️⃣  Test /ask di Discord:"
  echo "      /ask Halo! — harus loading dulu, lalu jawaban masuk"
  echo ""
  echo "  3️⃣  Test prompt panjang (200+ kata):"
  echo "      /ask [prompt panjang] — loading, lalu jawaban dari Koyeb"
  echo ""
  echo "  4️⃣  Test failover (matikan Koyeb):"
  echo "      Stop service di dashboard Koyeb"
  echo "      /ask Halo — bot harus tetap jawab via Worker fallback"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📊 Monitoring${NC}"
  echo ""
  echo "  • Koyeb logs: https://app.koyeb.com → Services → discord-turbo-layer → Logs"
  echo "  • Worker logs: https://dash.cloudflare.com → Workers & Pages → discord-ai-bot"
  echo "  • Cron logs: via /cron/logs endpoint"
  echo ""
  echo -e "${BOLD}⛔ Rollback${NC}"
  echo ""
  echo "  Kalau ada masalah — hapus secret, Worker tetap jalan normal:"
  echo "  npx wrangler secret delete RENDER_SERVICE_URL"
  echo "  npx wrangler deploy  # deploy ulang tanpa Turbo Layer"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${GREEN}✨ Selesai! Turbo Layer siap bikin bot kamu makin responsif!${NC}"
}

# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════
case "${1:-guide}" in
  koyeb-install|install)
    install_koyeb_cli
    ;;
  koyeb-deploy|deploy)
    deploy_koyeb
    ;;
  secret)
    set_secret "$2"
    ;;
  worker)
    deploy_worker
    ;;
  test)
    test_service "$2"
    ;;
  all)
    echo -e "${BOLD}🚀 Hybrid Turbo Layer — Full Deployment${NC}"
    echo "================================================"
    echo ""
    echo "Jalanin step by step pake guide ya:"
    echo "  ./scripts/deploy-turbo.sh guide"
    echo ""
    echo "Atau manual:"
    echo "  1. Deploy ke Koyeb (via Web UI atau CLI)"
    echo "  2. ./scripts/deploy-turbo.sh secret <url>"
    echo "  3. ./scripts/deploy-turbo.sh worker"
    ;;
  guide|--help|-h|*)
    show_guide
    ;;
esac

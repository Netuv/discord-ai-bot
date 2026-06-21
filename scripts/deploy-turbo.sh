#!/bin/bash
# 🚀 Hybrid Turbo Layer — Deployment Script (Vercel)
# Jalanin dari laptop kamu setelah Turbo Layer siap!
#
# Cara pakai:
#   1. ./scripts/deploy-turbo.sh vercel-deploy  — Deploy ke Vercel (via CLI)
#   2. ./scripts/deploy-turbo.sh secret <url>   — Set Cloudflare secrets
#   3. ./scripts/deploy-turbo.sh worker         — Deploy Cloudflare Worker
#   4. ./scripts/deploy-turbo.sh test <url>     — Test service
#   5. ./scripts/deploy-turbo.sh guide          — Panduan lengkap

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   🚀 Hybrid Turbo Layer — Deployment Script (Vercel)║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ════════════════════════════════════════════════════════════
# FUNGSI: Deploy ke Vercel via CLI
# ════════════════════════════════════════════════════════════
deploy_vercel() {
  echo -e "${BOLD}📡 Langkah 1: Deploy ke Vercel${NC}"
  echo ""

  if ! command -v vercel &> /dev/null; then
    echo "⬇️  Install Vercel CLI dulu..."
    npm i -g vercel 2>/dev/null || npm install -g vercel
  fi

  if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}⚠️  Vercel CLI gak bisa diinstall. Manual aja:${NC}"
    vercel_manual_guide
    return 0
  fi

  echo "🚀 Deploy turbo-server ke Vercel..."
  echo ""
  echo -e "${YELLOW}📋 Pertama kali? Nanti bakal:${NC}"
  echo "  1. Minta login via browser (buka linknya)"
  echo "  2. Pilih scope (personal account)"
  echo "  3. Konfirmasi setting"
  echo ""

  cd turbo-server
  vercel --prod
  cd ..

  echo ""
  echo -e "${GREEN}✅ Deploy selesai!${NC}"
  echo -e "${YELLOW}📝 Catet URL-nya, contoh: https://discord-turbo-layer.vercel.app${NC}"
  echo ""
  echo "📡 Lanjut set secret:"
  echo "  ./scripts/deploy-turbo.sh secret https://discord-turbo-layer.vercel.app"
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Panduan Manual Deploy via Web UI Vercel
# ════════════════════════════════════════════════════════════
vercel_manual_guide() {
  echo ""
  echo -e "${BOLD}📋 Langkah Manual — Deploy via Web UI Vercel:${NC}"
  echo ""
  echo "  1️⃣  Buka https://vercel.com/"
  echo "  2️⃣  Daftar pake GitHub — GRATIS, NO CREDIT CARD 🎉"
  echo "  3️⃣  Klik 'Add New...' → 'Project'"
  echo "  4️⃣  Import GitHub repo 'Netuv/discord-ai-bot'"
  echo "  5️⃣  Konfigurasi:"
  echo "      ╔══════════════════════════════════════════════╗"
  echo "      ║ Root Directory:    turbo-server             ║"
  echo "      ║ Framework Preset:  Other                    ║"
  echo "      ║ Build Command:     (leave blank — auto)     ║"
  echo "      ║ Output Dir:        (leave blank)            ║"
  echo "      ╠══════════════════════════════════════════════╣"
  echo "      ║ Environment Variables (optional):            ║"
  echo "      ║ • OPENROUTER_API_KEY = <key dari OR>        ║"
  echo "      ║ • NVIDIA_API_KEY     = <key dari NVIDIA>    ║"
  echo "      ╚══════════════════════════════════════════════╝"
  echo "  6️⃣  Klik 'Deploy'"
  echo "  7️⃣  ⏳ Tunggu ~2 menit sampai status 'Ready'"
  echo "  8️⃣  Catet URL: https://discord-turbo-layer.vercel.app"
  echo ""
  echo -e "${YELLOW}💡 VERCEL AUTO-DETECTS: Dia baca vercel.json & api/index.js otomatis!${NC}"
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
    echo -e "${YELLOW}   Contoh: https://discord-turbo-layer.vercel.app${NC}"
    echo ""
    read -p "   Masukkan URL: " TURBO_URL
  else
    TURBO_URL="$1"
  fi

  if [ -z "$TURBO_URL" ]; then
    echo -e "${RED}❌ URL diperlukan. Nanti jalanin:${NC}"
    echo -e "${YELLOW}   ./scripts/deploy-turbo.sh secret https://url-kamu.vercel.app${NC}"
    return 1
  fi

  # Hapus trailing slash
  TURBO_URL="${TURBO_URL%/}"

  echo "🔧 Set TURBO_SERVICE_URL = $TURBO_URL"
  echo ""

  # Set secret via wrangler
  npx wrangler secret put TURBO_SERVICE_URL <<< "$TURBO_URL"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Secret TURBO_SERVICE_URL berhasil di-set!${NC}"
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
    echo -e "${YELLOW}ℹ️  Set API key di dashboard Vercel untuk aktifkan AI.${NC}"
    echo -e "${YELLOW}   Tapi service tetap bisa dipake — fallback ke Worker.${NC}"
  fi
}

# ════════════════════════════════════════════════════════════
# FUNGSI: Tampilkan Guide Lengkap
# ════════════════════════════════════════════════════════════
show_guide() {
  echo -e "${BOLD}📖 HYBRID TURBO LAYER — DEPLOYMENT GUIDE (VERCEL)${NC}"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📋 Prasyarat:${NC}"
  echo "  ✅ Kode sudah di-push ke GitHub ✅"
  echo "  ✅ Akun Vercel (vercel.com) — GRATIS, NO CC 🎉"
  echo "  ✅ Akun Cloudflare dengan Workers"
  echo "  ✅ wrangler sudah login (npx wrangler login)"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📡 STEP 1: Deploy ke Vercel${NC}"
  echo ""
  echo "  🅰️  Via Web UI (termudah — recommended ✅):"
  echo ""
  echo "  1️⃣  Buka https://vercel.com/"
  echo "  2️⃣  Login pake GitHub — GRATIS, NO CREDIT CARD 🎉"
  echo "  3️⃣  Klik 'Add New...' → 'Project'"
  echo "  4️⃣  Import 'Netuv/discord-ai-bot' dari GitHub"
  echo "  5️⃣  Konfigurasi:"
  echo "      ╔══════════════════════════════════════════════╗"
  echo "      ║ Root Directory:  turbo-server               ║"
  echo "      ║ Framework:       Other                      ║"
  echo "      ║ Build:           (default — auto)           ║"
  echo "      ╠══════════════════════════════════════════════╣"
  echo "      ║ ENV VARIABLES (opsional):                    ║"
  echo "      ║ • OPENROUTER_API_KEY = <key dari OR>        ║"
  echo "      ║ • NVIDIA_API_KEY     = <key dari NVIDIA>    ║"
  echo "      ╚══════════════════════════════════════════════╝"
  echo "  6️⃣  Klik 'Deploy'"
  echo "  7️⃣  ⏳ Tunggu ~2 menit sampai 'Ready'"
  echo "  8️⃣  Copy URL: https://discord-turbo-layer.vercel.app"
  echo ""
  echo -e "  ${CYAN}Atau via CLI:${NC}"
  echo "  ./scripts/deploy-turbo.sh vercel-deploy"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}🔐 STEP 2: Set Cloudflare Secret${NC}"
  echo ""
  echo "  npx wrangler secret put TURBO_SERVICE_URL"
  echo "  # Paste: https://discord-turbo-layer.vercel.app"
  echo ""
  echo "  Atau:"
  echo "  ./scripts/deploy-turbo.sh secret https://discord-turbo-layer.vercel.app"
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
  echo "      curl https://discord-turbo-layer.vercel.app/health"
  echo "      ./scripts/deploy-turbo.sh test https://discord-turbo-layer.vercel.app"
  echo ""
  echo "  2️⃣  Test /ask di Discord:"
  echo "      /ask Halo! — loading dulu → jawaban masuk"
  echo ""
  echo "  3️⃣  Test prompt panjang (200+ kata):"
  echo "      /ask [prompt panjang] — loading → jawaban dari Vercel"
  echo ""
  echo "  4️⃣  Test failover (Vercel mati):"
  echo "      Hapus secret TURBO_SERVICE_URL"
  echo "      /ask Halo — bot tetap jawab via Worker fallback"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}📊 Monitoring${NC}"
  echo ""
  echo "  • Vercel: https://vercel.com → dashboard → discord-turbo-layer"
  echo "  • Worker: https://dash.cloudflare.com → Workers → discord-ai-bot"
  echo ""
  echo -e "${BOLD}⛔ Rollback${NC}"
  echo ""
  echo "  npx wrangler secret delete TURBO_SERVICE_URL"
  echo "  npx wrangler deploy  # Worker jalan normal tanpa Turbo"
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${GREEN}✨ Selesai! Turbo Layer siap bikin bot makin responsif!${NC}"
}

# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════
case "${1:-guide}" in
  vercel-deploy)
    deploy_vercel
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
    echo -e "${BOLD}🚀 Full Deployment${NC}"
    echo "Jalanin step by step:"
    echo "  1. ./scripts/deploy-turbo.sh vercel-deploy"
    echo "  2. ./scripts/deploy-turbo.sh secret <url>"
    echo "  3. ./scripts/deploy-turbo.sh worker"
    ;;
  guide|--help|-h|*)
    show_guide
    ;;
esac

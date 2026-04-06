#!/bin/bash
# Telegram webhook qeydiyyatı
# Deploy etdikdən sonra bu skripti işlədin

TELEGRAM_TOKEN="BURAYA_BOT_TOKENINIZI_YAZIN"
VERCEL_URL="https://LAYIHE_ADINIZ.vercel.app"

curl -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${VERCEL_URL}/api/webhook\"}"

echo ""
echo "✅ Webhook qeydiyyatı tamamlandı!"
echo "URL: ${VERCEL_URL}/api/webhook"

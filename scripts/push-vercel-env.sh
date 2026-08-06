#!/usr/bin/env bash
# Push AUTH_URL + FIREBASE_SERVICE_ACCOUNT (+ AUTH_SECRET if missing) to Vercel Production.
# Requires: npx vercel login (once) and project linked.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Falta .env en el proyecto"
  exit 1
fi

load_env() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" .env | head -1 || true)
  if [[ -z "$line" ]]; then
    echo "Falta $key en .env"
    exit 1
  fi
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

AUTH_URL_VAL=$(load_env AUTH_URL)
# Force the live Vercel hostname if still pointing elsewhere
if [[ "$AUTH_URL_VAL" != *"kngold-2711.vercel.app"* ]]; then
  AUTH_URL_VAL="https://kngold-2711.vercel.app"
fi

echo "1) Login Vercel (abre el navegador si hace falta)..."
npx vercel login

echo "2) Link al proyecto kngold-2711..."
npx vercel link --yes --project kngold-2711 || npx vercel link --yes

echo "3) Subiendo AUTH_URL..."
# Remove old value if present (ignore errors)
npx vercel env rm AUTH_URL production -y 2>/dev/null || true
printf '%s' "$AUTH_URL_VAL" | npx vercel env add AUTH_URL production

echo "4) Subiendo FIREBASE_SERVICE_ACCOUNT..."
npx vercel env rm FIREBASE_SERVICE_ACCOUNT production -y 2>/dev/null || true
load_env FIREBASE_SERVICE_ACCOUNT | npx vercel env add FIREBASE_SERVICE_ACCOUNT production

if ! npx vercel env ls production 2>/dev/null | grep -q AUTH_SECRET; then
  echo "5) Subiendo AUTH_SECRET (no estaba en Vercel)..."
  load_env AUTH_SECRET | npx vercel env add AUTH_SECRET production
else
  echo "5) AUTH_SECRET ya existe en Vercel — se deja igual"
fi

echo "6) Redeploy Production..."
npx vercel --prod --yes

echo "Listo. Prueba: https://kngold-2711.vercel.app/login"
echo "Usuario: dueno@kngold.com.do  Clave: kngold2026"

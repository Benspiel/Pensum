#!/usr/bin/env bash
# Startet run.mjs mit dem Gemini-Schlüssel der Function „aufgaben“ (aus den Variablen in Appwrite, per Appwrite-CLI).
# Der Schlüssel landet nur in der Umgebung dieses einen Aufrufs: nicht auf der Platte, nicht in der Ausgabe.
#   bash scripts/aufgaben-test/with-key.sh [blatt …] [--runs 2] [--tag name]
set -euo pipefail
cd "$(dirname "$0")/../.."
vars=$(appwrite functions list-variables --function-id aufgaben --show-secrets --json 2>/dev/null)
pick() { printf '%s' "$vars" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=(j.variables||[]).find(x=>x.key===process.argv[1]);process.stdout.write(v&&v.value||"")})' "$1"; }
GEMINI_API_KEY=$(pick GEMINI_API_KEY)
GEMINI_MODEL=$(pick GEMINI_MODEL)
[ -n "$GEMINI_API_KEY" ] || { echo "Kein GEMINI_API_KEY in den Variablen der Function aufgaben gefunden." >&2; exit 1; }
export GEMINI_API_KEY
if [ -n "$GEMINI_MODEL" ]; then export GEMINI_MODEL; else unset GEMINI_MODEL; fi
exec node scripts/aufgaben-test/run.mjs "$@"

#!/usr/bin/env bash
set -euo pipefail

BASE="http://192.168.0.148:8000"
RID="fc34a984-0b39-4f0a-afa2-5b677c61f044"
P2="$BASE/restaurants/$RID/availability?date=2025-10-23&party_size=2"

green(){ printf "\033[32m%s\033[0m\n" "$*"; }
red(){ printf "\033[31m%s\033[0m\n" "$*"; }
sep(){ printf "\n%s\n" "-------------------------------------------------"; }

jqm(){ jq -C '.' 2>/dev/null || cat; }

sep; echo "[1] Health"; curl -s "$BASE/health" | jqm

sep; echo "[2] List restaurants (expect >=3)"; curl -s "$BASE/restaurants" | jq 'length,(.[0]//{})' -C

sep; echo "[3] Restaurant detail"; curl -s "$BASE/restaurants/$RID" | jq -C '.name,.areas[0].tables|length'

sep; echo "[4] Availability baseline (2p)"; curl -s "$P2" | jq -C '.slots[0]'

sep; echo "[5] Bad inputs should 422";
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/restaurants/$RID/availability?party_size=2" | grep -q '^422$' && green "OK missing date -> 422" || red "FAIL availability missing date"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/restaurants/$RID/availability?date=BAD&party_size=2" | grep -q '^422$' && green "OK bad date -> 422" || red "FAIL bad date"

sep; echo "[6] Create reservation on 2-top (10:00-11:30)";
R1=$(curl -s -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"2025-10-23T10:00:00",
  "end":"2025-10-23T11:30:00",
  "guest_name":"OK1",
  "guest_phone":"+1",
  "table_id":"e5c360cf-31df-4276-841e-8cd720b5942c"
}' | jq -r '.id // empty'); echo "R1=$R1"; test -n "$R1" && green "OK created" || red "FAIL create"

sep; echo "[7] Overlap same table should 409";
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"2025-10-23T10:30:00",
  "end":"2025-10-23T12:00:00",
  "guest_name":"Overlap",
  "guest_phone":"+1",
  "table_id":"e5c360cf-31df-4276-841e-8cd720b5942c"
}' | grep -q '^409$' && green "OK 409 on overlap" || red "FAIL overlap not blocked"

sep; echo "[8] Back-to-back (11:30-13:00) same table OK";
R2=$(curl -s -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"2025-10-23T11:30:00",
  "end":"2025-10-23T13:00:00",
  "guest_name":"OK2",
  "guest_phone":"+1",
  "table_id":"e5c360cf-31df-4276-841e-8cd720b5942c"
}' | jq -r '.id // empty'); echo "R2=$R2"; test -n "$R2" && green "OK created" || red "FAIL back-to-back create"

sep; echo "[9] Capacity enforcement (try 6p on a 2-top) -> 422";
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d '{
  "restaurant_id":"'"$RID"'",
  "party_size":6,
  "start":"2025-10-23T14:00:00",
  "end":"2025-10-23T15:30:00",
  "guest_name":"TooBig",
  "guest_phone":"+1",
  "table_id":"e5c360cf-31df-4276-841e-8cd720b5942c"
}' | grep -q '^422$' && green "OK 422 capacity" || red "FAIL capacity not enforced"

sep; echo "[10] Auto-table selection works (no table_id)";
R3=$(curl -s -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d '{
  "restaurant_id":"'"$RID"'",
  "party_size":4,
  "start":"2025-10-23T16:00:00",
  "end":"2025-10-23T17:30:00",
  "guest_name":"AutoPick",
  "guest_phone":"+1"
}' | jq -r '.id // empty'); echo "R3=$R3"; test -n "$R3" && green "OK created" || red "FAIL autopick"

sep; echo "[11] Reservations list (>=2 now)";
curl -s "$BASE/reservations" | jq -C 'length, .[0]'

sep; echo "[12] Cancel created reservations";
for ID in "$R1" "$R2" "$R3"; do
  if [ -n "${ID:-}" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/reservations/$ID")
    [ "$code" = "200" ] && green "OK cancelled $ID" || red "FAIL cancel $ID (code $code)"
  fi
done

sep; echo "[13] Availability sample after cancels";
curl -s "$P2" | jq -C '.slots[0]'

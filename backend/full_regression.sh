#!/usr/bin/env bash
set -euo pipefail

# -------- Config (override via env if you want) --------
B="${B:-http://192.168.0.148:8000}"                                  # backend base URL
R="${R:-fc34a984-0b39-4f0a-afa2-5b677c61f044}"                       # SAHiL restaurant id
D="${D:-2025-10-23}"                                                 # test date
T="${T:-e5c360cf-31df-4276-841e-8cd720b5942c}"                       # a 2-top table id at SAHiL
TAG="${TAG:-REG-$(date +%s)}"                                        # unique tag for this run

ok(){ echo "$1"; }
die(){ echo "FAIL: $1"; exit 1; }

# -------- 0) quick deps & server sanity --------
command -v curl >/dev/null || die "curl missing"
command -v jq >/dev/null   || die "jq missing"
curl -fsS "$B/health" >/dev/null || die "health endpoint"

# -------- 1) CORS preflight --------
HDRS="$(curl -s -X OPTIONS "$B/reservations" \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST" -D - -o /dev/null)"
echo "$HDRS" | grep -qi '^access-control-allow-origin:' || die "CORS preflight failed"
ok "[ok] CORS preflight allowed"

# -------- 2) Availability baseline includes our table at 10:00 --------
HAS="$(curl -fsS "$B/restaurants/$R/availability?date=$D&party_size=2" \
  | jq -r --arg D "$D" --arg T "$T" '.slots[] | select(.start==($D+"T10:00:00")) | (.available_table_ids|index($T)!=null)')"
[ "$HAS" = "true" ] || die "baseline availability does not include table $T at 10:00"

# -------- 3) Create R1 on table T (10:00–11:30) --------
R1="$(jq -cn --arg r "$R" --arg d "$D" --arg t "$T" --arg g "$TAG-1" \
  '{restaurant_id:$r,party_size:2,start:($d+"T10:00:00"),end:($d+"T11:30:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$B/reservations" -H 'Content-Type: application/json' -d @- \
  | jq -r .id)"
[ "$R1" != null ] && [ -n "$R1" ] || die "create R1"
ok "[ok] created $R1"

# -------- 4) Overlap on same table should be 409 (10:30–12:00) --------
CODE="$(jq -cn --arg r "$R" --arg d "$D" --arg t "$T" --arg g "$TAG-ov" \
  '{restaurant_id:$r,party_size:2,start:($d+"T10:30:00"),end:($d+"T12:00:00"),guest_name:$g,table_id:$t}' \
  | curl -s -o /dev/null -w '%{http_code}' -X POST "$B/reservations" -H 'Content-Type: application/json' -d @-)"
[ "$CODE" = "409" ] || die "overlap expected 409, got $CODE"
ok "[ok] overlap 409"

# -------- 5) Back-to-back on same table is allowed (11:30–13:00) --------
R2="$(jq -cn --arg r "$R" --arg d "$D" --arg t "$T" --arg g "$TAG-2" \
  '{restaurant_id:$r,party_size:2,start:($d+"T11:30:00"),end:($d+"T13:00:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$B/reservations" -H 'Content-Type: application/json' -d @- \
  | jq -r .id)"
[ "$R2" != null ] && [ -n "$R2" ] || die "create R2 failed"
ok "[ok] created $R2 (back-to-back)"

# -------- 6) Auto-table selection works (13:00–14:30) --------
R3="$(
  jq -cn --arg r "$R" --arg d "$D" --arg g "$TAG-3" \
    '{restaurant_id:$r,party_size:2,start:($d+"T13:00:00"),end:($d+"T14:30:00"),guest_name:$g}' \
  | curl -fsS -X POST "$B/reservations" -H 'Content-Type: application/json' -d @- \
  | jq -r .id
)"
[ "$R3" != null ] && [ -n "$R3" ] || die "create R3 failed"
ok "[ok] auto-selected reservation $R3"

# -------- 7) Persistence across reload (touch a file to trigger) --------
touch ~/baku-reserve/backend/app/storage.py
sleep 2
curl -fsS "$B/reservations" \
  | jq -e --arg tag "$TAG" '(map(select(.guest_name|tostring|startswith($tag)))|length) >= 3' >/dev/null \
  || die "persistence after reload"
ok "[ok] persisted after reload"

# -------- 8) Cancel/confirm flow on R3 (soft cancel frees, confirm blocks) --------
curl -fsS -X POST "$B/reservations/$R3/cancel"  >/dev/null || die "cancel 1"
curl -fsS -X POST "$B/reservations/$R3/cancel"  >/dev/null || die "cancel idempotent"
curl -fsS -X POST "$B/reservations/$R3/confirm" >/dev/null || die "confirm"
ok "[ok] cancel/confirm flow ok"

# -------- 9) Cleanup ONLY what we created --------
for id in "$R1" "$R2" "$R3"; do
  curl -s -o /dev/null -w "delete $id -> %{http_code}\n" -X DELETE "$B/reservations/$id"
done
curl -fsS "$B/reservations" \
  | jq -e --arg tag "$TAG" '(map(select(.guest_name|tostring|startswith($tag)))|length)==0' >/dev/null \
  || die "cleanup"
ok "[done] FULL REGRESSION GREEN"

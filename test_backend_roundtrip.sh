#!/usr/bin/env bash
set -Eeuo pipefail

BASE="http://192.168.0.148:8000"
RID="fc34a984-0b39-4f0a-afa2-5b677c61f044"

# Known 2-top (T1) from your seeded data
T2A="e5c360cf-31df-4276-841e-8cd720b5942c"

DAY="2025-10-23"

jq_exists() { command -v jq >/dev/null 2>&1; }
if ! jq_exists; then
  echo "[!] jq not installed. On macOS: brew install jq" >&2
  exit 1
fi

sep(){ printf "\n-------------------------------------------------\n%s\n" "$1"; }

# A tiny helper to POST a reservation
post_res() {
  local party="$1" start="$2" end="$3" name="$4" phone="$5" table="${6:-}"
  local body
  if [ -n "$table" ]; then
    body=$(jq -n --arg rid "$RID" --argjson ps "$party" \
                --arg s "$start" --arg e "$end" \
                --arg name "$name" --arg phone "$phone" --arg table "$table" \
                '{restaurant_id:$rid,party_size:$ps,start:$s,end:$e,guest_name:$name,guest_phone:$phone,table_id:$table}')
  else
    body=$(jq -n --arg rid "$RID" --argjson ps "$party" \
                --arg s "$start" --arg e "$end" \
                --arg name "$name" --arg phone "$phone" \
                '{restaurant_id:$rid,party_size:$ps,start:$s,end:$e,guest_name:$name,guest_phone:$phone}')
  fi
  curl -s -X POST "$BASE/reservations" -H 'Content-Type: application/json' -d "$body"
}

sep "[A] Health"
curl -s "$BASE/health" | jq -C '.'

sep "[B] Availability baseline (2p) first slot"
curl -s "$BASE/restaurants/$RID/availability?date=$DAY&party_size=2" | jq -C '.slots[0]'

# R1: 10:00–11:30 on T2A
sep "[C] Create R1 (T2A @ 10:00–11:30)"
R1_JSON=$(post_res 2 "${DAY}T10:00:00" "${DAY}T11:30:00" "Test R1" "+15550000001" "$T2A")
echo "$R1_JSON" | jq -C '.'
R1=$(echo "$R1_JSON" | jq -r '.id')

# Overlap attempt on same table: expect 409
sep "[D] Overlap on same table (expect 409)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/reservations" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg rid "$RID" --arg s "${DAY}T10:30:00" --arg e "${DAY}T12:00:00" \
              --arg name "ShouldConflict" --arg table "$T2A" \
              '{restaurant_id:$rid,party_size:2,start:$s,end:$e,guest_name:$name,table_id:$table}')"

# R2: back-to-back 11:30–13:00 same table: should succeed
sep "[E] Create R2 (T2A back-to-back 11:30–13:00)"
R2_JSON=$(post_res 2 "${DAY}T11:30:00" "${DAY}T13:00:00" "Test R2" "+15550000002" "$T2A")
echo "$R2_JSON" | jq -C '.'
R2=$(echo "$R2_JSON" | jq -r '.id')

# R3: auto-select a table 13:00–14:30 (no table_id)
sep "[F] Create R3 (auto table 13:00–14:30)"
R3_JSON=$(post_res 2 "${DAY}T13:00:00" "${DAY}T14:30:00" "Test R3" "+15550000003")
echo "$R3_JSON" | jq -C '.'
R3=$(echo "$R3_JSON" | jq -r '.id')
R3_TABLE=$(echo "$R3_JSON" | jq -r '.table_id // "null"')
echo "Auto-selected table for R3: $R3_TABLE"

# Capacity enforcement: 6p on 2-top @12:00–13:30 should 422
sep "[G] Capacity enforcement (expect 422)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/reservations" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg rid "$RID" --arg s "${DAY}T12:00:00" --arg e "${DAY}T13:30:00" \
              --arg name "TooBig" --arg table "$T2A" \
              '{restaurant_id:$rid,party_size:6,start:$s,end:$e,guest_name:$name,table_id:$table}')"

# Verify count
sep "[H] List reservations (expect >=3)"
curl -s "$BASE/reservations" | jq -C 'length as $n | $n, (.[0] // null)'

# Cancel all three
sep "[I] Cancel R1/R2/R3"
for id in "$R1" "$R2" "$R3"; do
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    curl -s -o /dev/null -w "DELETE $id -> HTTP %{http_code}\n" -X DELETE "$BASE/reservations/$id"
  fi
done

# Confirm empty
sep "[J] List reservations after cancels"
curl -s "$BASE/reservations" | jq -C 'length'

# Availability spot check again
sep "[K] Availability first slot after cleanup"
curl -s "$BASE/restaurants/$RID/availability?date=$DAY&party_size=2" | jq -C '.slots[0]'

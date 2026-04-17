#!/bin/bash
# ============================================================
# TEST PLAN: Windows VM Password Reset 
# Date: 2026-04-16
# Server: 14.224.205.40:3002
# ============================================================
#
# TEST CASES:
# TC01: Win2025 Standard - Tạo VM mới + Reset password lần 1 (initialized=false)
# TC02: Win2022 Standard - Tạo VM mới + Reset password lần 1 (initialized=false)  
# TC03: Win2019 Standard - Tạo VM mới + Reset password lần 1 (initialized=false)
# TC04: Win2016 Standard - Tạo VM mới + Reset password lần 1 (initialized=false)
# TC05: Reset password lần 2 (initialized=true) trên VM đã reset thành công
# TC06: Edge case - Reset trên VM đang STOPPED
# TC07: Edge case - Sai OTP
# TC08: Edge case - Password không đủ mạnh
# TC09: Edge case - Subscription không tồn tại
#
# IMAGES:
# Win2025 Standard: ocid1.image.oc1.ap-tokyo-1.aaaaaaaafpfmoagi5eoqulsvxszzpe7v2p773pixt6q7qeujb6nyopcfodla
# Win2022 Standard: ocid1.image.oc1.ap-tokyo-1.aaaaaaaa5t5zt62qlsutlnnrkis23wvp4gw34qcrgmracvvm2d4dq2mbrphq
# Win2019 Standard: ocid1.image.oc1.ap-tokyo-1.aaaaaaaaeapb565abosdeyqi5hpaotcet2ojnaikjjcln24gsdoqkioavemq
# Win2016 Standard: ocid1.image.oc1.ap-tokyo-1.aaaaaaaahdmx5p36eqojfbaaip7ymqvu5ffvl4jomptmgmzkju2gezdpe7oq
# ============================================================

set -euo pipefail
BASE_URL="http://localhost:3002"
REPORT_FILE="/tmp/test-report-$(date +%Y%m%d-%H%M%S).md"
JWT_SECRET="jwt-secret-key-42jfwj2k"
ADMIN_USER_ID=1
# Test user — use admin (user_id=1) since we create subs under admin
TEST_USER_ID=1

# Images for each Windows version
declare -A WIN_IMAGES=(
  ["Win2025"]="ocid1.image.oc1.ap-tokyo-1.aaaaaaaafpfmoagi5eoqulsvxszzpe7v2p773pixt6q7qeujb6nyopcfodla"
  ["Win2022"]="ocid1.image.oc1.ap-tokyo-1.aaaaaaaa5t5zt62qlsutlnnrkis23wvp4gw34qcrgmracvvm2d4dq2mbrphq"
  ["Win2019"]="ocid1.image.oc1.ap-tokyo-1.aaaaaaaaeapb565abosdeyqi5hpaotcet2ojnaikjjcln24gsdoqkioavemq"
  ["Win2016"]="ocid1.image.oc1.ap-tokyo-1.aaaaaaaahdmx5p36eqojfbaaip7ymqvu5ffvl4jomptmgmzkju2gezdpe7oq"
)

SHAPE="VM.Standard.E3.Flex"
CLOUD_PACKAGE_ID=1812  # Starter 1

# Global counters
PASS=0
FAIL=0
SKIP=0
declare -A TEST_RESULTS
declare -A SUB_IDS
declare -A VM_IPS

log() { echo "[$(date '+%H:%M:%S')] $*"; }
log_report() { echo "$*" >> "$REPORT_FILE"; }

gen_jwt() {
  local user_id=$1
  cd /home/icsadmin/web/oracle/oracle-ics-backend
  node -e "const j=require('jsonwebtoken');console.log(j.sign({sub:$user_id,id:$user_id,email:'admin@icss.com.vn',role:'admin'},'$JWT_SECRET',{expiresIn:'4h'}))"
}

get_otp_from_logs() {
  local sub_id=$1
  local action=$2
  sleep 2
  grep "DEBUG_OTP.*${sub_id}.*${action}" /home/icsadmin/.pm2/logs/oracle-ics-backend-out.log | tail -1 | grep -oP 'otp=\K[0-9]+'
}

wait_for_vm_running() {
  local sub_id=$1
  local token=$2
  local max_wait=${3:-600}  # default 10 min
  local elapsed=0
  
  while [ $elapsed -lt $max_wait ]; do
    local resp=$(curl -s "$BASE_URL/vm-subscription/$sub_id" -H "Authorization: Bearer $token")
    local state=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('vm',{}).get('lifecycleState','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    local ip=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('vm',{}).get('publicIp',''))" 2>/dev/null || echo "")
    
    if [ "$state" = "RUNNING" ] && [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
    log "  VM state: $state (waited ${elapsed}s / ${max_wait}s)" >&2
    sleep 30
    elapsed=$((elapsed + 30))
  done
  echo ""
  return 1
}

poll_reset_status() {
  local sub_id=$1
  local job_id=$2
  local token=$3
  local max_wait=${4:-600}  # 10 min default
  local elapsed=0
  
  while [ $elapsed -lt $max_wait ]; do
    local resp=$(curl -s "$BASE_URL/vm-subscription/$sub_id/reset-windows-password-status/$job_id" -H "Authorization: Bearer $token")
    local status=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status','unknown'))" 2>/dev/null || echo "unknown")
    
    case "$status" in
      completed|success)
        echo "$resp"
        return 0
        ;;
      failed)
        echo "$resp"
        return 1
        ;;
      pending|in-progress|processing)
        log "  Reset status: $status (waited ${elapsed}s)" >&2
        ;;
      *)
        log "  Reset status: $status (waited ${elapsed}s) - raw: $resp" >&2
        ;;
    esac
    sleep 15
    elapsed=$((elapsed + 15))
  done
  echo '{"status":"timeout","error":"Polling timeout after '${max_wait}'s"}'
  return 1
}

record_result() {
  local tc_id=$1
  local tc_name=$2
  local result=$3  # PASS/FAIL/SKIP
  local detail=$4
  
  TEST_RESULTS["$tc_id"]="$result"
  
  case "$result" in
    PASS) PASS=$((PASS+1)); icon="✅" ;;
    FAIL) FAIL=$((FAIL+1)); icon="❌" ;;
    SKIP) SKIP=$((SKIP+1)); icon="⏭️" ;;
  esac
  
  log "$icon $tc_id: $tc_name — $result"
  log_report "### $tc_id: $tc_name"
  log_report "- **Kết quả:** $icon $result"
  log_report "- **Chi tiết:** $detail"
  log_report ""
}

# ============================================================
# START TEST
# ============================================================
log "=== BẮT ĐẦU TEST WINDOWS PASSWORD RESET ==="
TOKEN=$(gen_jwt $TEST_USER_ID)

# Init report
cat > "$REPORT_FILE" << 'HEADER'
# Báo Cáo Test: Windows VM Password Reset

**Ngày test:** $(date '+%Y-%m-%d %H:%M:%S')  
**Server:** 14.224.205.40:3002  
**Tester:** Auto-test script  

## Tóm tắt

| # | Test Case | Kết quả |
|---|-----------|---------|
HEADER

# Replace date placeholder
sed -i "s|\$(date '+%Y-%m-%d %H:%M:%S')|$(date '+%Y-%m-%d %H:%M:%S')|g" "$REPORT_FILE"

log_report ""
log_report "## Chi tiết Test Cases"
log_report ""

# ============================================================
# TC01-TC04: Tạo VM mới cho mỗi phiên bản Windows + Reset password
# ============================================================
for win_ver in Win2025 Win2022 Win2019 Win2016; do
  tc_num=""
  case $win_ver in
    Win2025) tc_num="TC01" ;;
    Win2022) tc_num="TC02" ;;
    Win2019) tc_num="TC03" ;;
    Win2016) tc_num="TC04" ;;
  esac
  
  tc_name="$win_ver Standard — Tạo VM mới + Reset password (initialized=false)"
  image_id="${WIN_IMAGES[$win_ver]}"
  
  log "--- $tc_num: $tc_name ---"
  log_report "---"
  
  # Step 1: Create subscription
  log "  Step 1: Tạo subscription..."
  sub_resp=$(curl -s -X POST "$BASE_URL/subscriptions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"cloud_package_id\":$CLOUD_PACKAGE_ID,\"amount_paid\":0,\"months_paid\":1,\"user_id\":$TEST_USER_ID}")
  
  sub_id=$(echo "$sub_resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null || echo "")
  
  if [ -z "$sub_id" ]; then
    record_result "$tc_num" "$tc_name" "FAIL" "Không tạo được subscription: $sub_resp"
    continue
  fi
  log "  Subscription created: $sub_id"
  SUB_IDS["$win_ver"]=$sub_id
  
  # Step 2: Configure VM (tạo VM)
  log "  Step 2: Tạo VM ($win_ver) — có thể mất 5-10 phút..."
  cfg_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$sub_id/configure" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"imageId\":\"$image_id\",\"shape\":\"$SHAPE\",\"ocpus\":2,\"memoryInGBs\":8,\"bootVolumeSizeInGBs\":256}")
  
  log "  Configure response: $(echo "$cfg_resp" | head -c 200)"
  
  # Step 3: Wait for VM to be RUNNING
  log "  Step 3: Chờ VM khởi động..."
  vm_ip=$(wait_for_vm_running "$sub_id" "$TOKEN" 900)  # 15 min max
  
  if [ -z "$vm_ip" ]; then
    record_result "$tc_num" "$tc_name" "FAIL" "VM không khởi động được sau 15 phút. Sub: $sub_id"
    continue
  fi
  VM_IPS["$win_ver"]=$vm_ip
  log "  VM running tại IP: $vm_ip"
  
  # Step 4: Chờ thêm 3 phút để userdata chạy (clear must-change-password flag)
  log "  Step 4: Chờ 3 phút cho userdata hoàn tất..."
  sleep 180
  
  # Step 5: Send OTP
  log "  Step 5: Gửi OTP..."
  otp_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$sub_id/send-action-otp" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"reset-password"}')
  
  otp_success=$(echo "$otp_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',False))" 2>/dev/null || echo "False")
  if [ "$otp_success" != "True" ]; then
    record_result "$tc_num" "$tc_name" "FAIL" "Không gửi được OTP: $otp_resp. Sub: $sub_id"
    continue
  fi
  
  # Step 6: Get OTP from logs
  otp_code=$(get_otp_from_logs "$sub_id" "reset-password")
  if [ -z "$otp_code" ]; then
    record_result "$tc_num" "$tc_name" "FAIL" "Không tìm thấy OTP trong logs. Sub: $sub_id"
    continue
  fi
  log "  OTP: $otp_code"
  
  # Step 7: Reset password
  log "  Step 7: Reset password..."
  reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$sub_id/reset-windows-password" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"otpCode\":\"$otp_code\"}")
  
  job_id=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
  
  if [ -z "$job_id" ]; then
    record_result "$tc_num" "$tc_name" "FAIL" "Không nhận được jobId: $reset_resp. Sub: $sub_id"
    continue
  fi
  log "  Job ID: $job_id"
  
  # Step 8: Poll reset status
  log "  Step 8: Chờ kết quả reset (tối đa 10 phút)..."
  result_json=$(poll_reset_status "$sub_id" "$job_id" "$TOKEN" 600)
  result_status=$(echo "$result_json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
  
  if [ "$result_status" = "completed" ] || [ "$result_status" = "success" ]; then
    new_pw=$(echo "$result_json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('newPassword','N/A'))" 2>/dev/null || echo "N/A")
    record_result "$tc_num" "$tc_name" "PASS" "Password reset thành công. IP: $vm_ip. New password: ${new_pw:0:4}***. Sub: $sub_id"
  else
    # Get relevant log lines
    reset_logs=$(grep -A2 "Starting Windows password reset\|WinRM failed\|Strategy\|password.*changed\|All.*exhausted" /home/icsadmin/.pm2/logs/oracle-ics-backend-out.log | grep "$sub_id\|Strategy\|WinRM\|password\|exhausted" | tail -15)
    record_result "$tc_num" "$tc_name" "FAIL" "Reset failed. Status: $result_status. Response: $(echo "$result_json" | head -c 300). Sub: $sub_id. Logs: $reset_logs"
  fi
done

# ============================================================
# TC05: Reset password lần 2 (initialized=true)
# ============================================================
log "--- TC05: Reset password lần 2 ---"
log_report "---"

# Find first successful VM
tc05_sub=""
tc05_ver=""
for win_ver in Win2025 Win2022 Win2019 Win2016; do
  tc_num=""
  case $win_ver in
    Win2025) tc_num="TC01" ;;
    Win2022) tc_num="TC02" ;;
    Win2019) tc_num="TC03" ;;
    Win2016) tc_num="TC04" ;;
  esac
  if [ "${TEST_RESULTS[$tc_num]:-}" = "PASS" ]; then
    tc05_sub="${SUB_IDS[$win_ver]}"
    tc05_ver="$win_ver"
    break
  fi
done

if [ -z "$tc05_sub" ]; then
  record_result "TC05" "Reset password lần 2 (initialized=true)" "SKIP" "Không có VM nào reset thành công ở TC01-04"
else
  log "  Dùng $tc05_ver (sub: $tc05_sub)"
  
  # Send OTP
  otp_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/send-action-otp" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"reset-password"}')
  
  sleep 2
  otp_code=$(get_otp_from_logs "$tc05_sub" "reset-password")
  
  if [ -z "$otp_code" ]; then
    record_result "TC05" "Reset password lần 2 (initialized=true) — $tc05_ver" "FAIL" "Không lấy được OTP"
  else
    reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/reset-windows-password" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"otpCode\":\"$otp_code\"}")
    
    job_id=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
    
    if [ -n "$job_id" ]; then
      result_json=$(poll_reset_status "$tc05_sub" "$job_id" "$TOKEN" 600)
      result_status=$(echo "$result_json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
      
      if [ "$result_status" = "completed" ] || [ "$result_status" = "success" ]; then
        record_result "TC05" "Reset password lần 2 (initialized=true) — $tc05_ver" "PASS" "Reset lần 2 thành công. Sub: $tc05_sub"
      else
        record_result "TC05" "Reset password lần 2 (initialized=true) — $tc05_ver" "FAIL" "Status: $result_status. Response: $(echo "$result_json" | head -c 200)"
      fi
    else
      record_result "TC05" "Reset password lần 2 (initialized=true) — $tc05_ver" "FAIL" "No jobId: $reset_resp"
    fi
  fi
fi

# ============================================================
# TC06: Reset trên VM đang STOPPED
# ============================================================
log "--- TC06: Reset trên VM đang STOPPED ---"
log_report "---"

if [ -z "$tc05_sub" ]; then
  record_result "TC06" "Reset trên VM STOPPED" "SKIP" "Không có VM khả dụng"
else
  log "  Stopping VM..."
  stop_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"STOP"}')
  log "  Stop response: $(echo "$stop_resp" | head -c 200)"
  
  # Wait for VM to stop
  sleep 60
  
  # Send OTP
  otp_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/send-action-otp" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"reset-password"}')
  
  sleep 2
  otp_code=$(get_otp_from_logs "$tc05_sub" "reset-password")
  
  if [ -z "$otp_code" ]; then
    record_result "TC06" "Reset trên VM STOPPED" "FAIL" "OTP not found"
  else
    reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/reset-windows-password" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"otpCode\":\"$otp_code\"}")
    
    job_id=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
    
    if [ -n "$job_id" ]; then
      result_json=$(poll_reset_status "$tc05_sub" "$job_id" "$TOKEN" 300)
      result_status=$(echo "$result_json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
      error_msg=$(echo "$result_json" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('error',''))" 2>/dev/null || echo "")
      
      # Expected: should fail with VM not running error, OR backend should check state before attempting
      if echo "$error_msg" | grep -qi "running\|stopped\|not running"; then
        record_result "TC06" "Reset trên VM STOPPED" "PASS" "Đúng: Hệ thống từ chối reset trên VM STOPPED. Error: $error_msg"
      elif [ "$result_status" = "failed" ] || [ "$result_status" = "error" ]; then
        record_result "TC06" "Reset trên VM STOPPED" "PASS" "Reset thất bại như mong đợi trên VM STOPPED. Error: $error_msg"
      elif [ "$result_status" = "completed" ] || [ "$result_status" = "success" ]; then
        record_result "TC06" "Reset trên VM STOPPED" "FAIL" "Reset thành công trên VM STOPPED — không nên xảy ra"
      else
        record_result "TC06" "Reset trên VM STOPPED" "FAIL" "Kết quả không mong đợi: status=$result_status, error=$error_msg"
      fi
    else
      # Maybe the API rejects it directly
      error_msg=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('message',''))" 2>/dev/null || echo "")
      if echo "$error_msg" | grep -qi "running\|stopped\|not running"; then
        record_result "TC06" "Reset trên VM STOPPED" "PASS" "API đúng: từ chối ngay trước khi bắt đầu job. Error: $error_msg"
      else
        record_result "TC06" "Reset trên VM STOPPED" "FAIL" "No jobId, unexpected response: $reset_resp"
      fi
    fi
  fi
  
  # Restart VM for potential later tests
  log "  Restarting VM..."
  curl -s -X POST "$BASE_URL/vm-subscription/$tc05_sub/action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"START"}' > /dev/null 2>&1
fi

# ============================================================
# TC07: Sai OTP
# ============================================================
log "--- TC07: Sai OTP ---"
log_report "---"

tc07_sub="${SUB_IDS[Win2025]:-${SUB_IDS[Win2022]:-${SUB_IDS[Win2019]:-${SUB_IDS[Win2016]:-}}}}"
if [ -z "$tc07_sub" ]; then
  record_result "TC07" "Sai OTP" "SKIP" "Không có subscription"
else
  # Send OTP first 
  curl -s -X POST "$BASE_URL/vm-subscription/$tc07_sub/send-action-otp" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"reset-password"}' > /dev/null 2>&1
  sleep 2
  
  # Use wrong OTP
  reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc07_sub/reset-windows-password" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"otpCode":"000000"}')
  
  error_msg=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('message',''))" 2>/dev/null || echo "")
  status_code=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('statusCode',0))" 2>/dev/null || echo "0")
  
  if [ "$status_code" = "400" ] && echo "$error_msg" | grep -qi "invalid\|otp"; then
    record_result "TC07" "Sai OTP" "PASS" "API từ chối OTP sai. Error: $error_msg"
  else
    record_result "TC07" "Sai OTP" "FAIL" "Phản hồi không mong đợi: $reset_resp"
  fi
fi

# ============================================================
# TC08: Password không đủ mạnh
# ============================================================
log "--- TC08: Password không đủ mạnh ---"
log_report "---"

if [ -z "$tc07_sub" ]; then
  record_result "TC08" "Password yếu" "SKIP" "Không có subscription"
else
  # Send OTP
  curl -s -X POST "$BASE_URL/vm-subscription/$tc07_sub/send-action-otp" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"reset-password"}' > /dev/null 2>&1
  sleep 2
  otp_code=$(get_otp_from_logs "$tc07_sub" "reset-password")
  
  if [ -z "$otp_code" ]; then
    record_result "TC08" "Password yếu" "SKIP" "Không lấy được OTP"
  else
    reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/$tc07_sub/reset-windows-password" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"otpCode\":\"$otp_code\",\"newPassword\":\"123\"}")
    
    error_msg=$(echo "$reset_resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('message',''))" 2>/dev/null || echo "")
    status_code=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('statusCode',0))" 2>/dev/null || echo "0")
    
    if [ "$status_code" = "400" ]; then
      record_result "TC08" "Password yếu" "PASS" "API từ chối password yếu. Error: $error_msg"
    else
      record_result "TC08" "Password yếu" "FAIL" "Response: $reset_resp"
    fi
  fi
fi

# ============================================================
# TC09: Subscription không tồn tại
# ============================================================
log "--- TC09: Subscription không tồn tại ---"
log_report "---"

reset_resp=$(curl -s -X POST "$BASE_URL/vm-subscription/00000000-0000-0000-0000-000000000000/reset-windows-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"otpCode":"123456"}')

status_code=$(echo "$reset_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('statusCode',0))" 2>/dev/null || echo "0")

if [ "$status_code" = "400" ] || [ "$status_code" = "404" ]; then
  record_result "TC09" "Subscription không tồn tại" "PASS" "API từ chối đúng. Response: $(echo "$reset_resp" | head -c 200)"
else
  record_result "TC09" "Subscription không tồn tại" "FAIL" "Response: $reset_resp"
fi

# ============================================================
# SUMMARY 
# ============================================================
log ""
log "============================================"
log "KẾT QUẢ: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
log "============================================"

# Write summary table to report
SUMMARY_TABLE=""
for tc in TC01 TC02 TC03 TC04 TC05 TC06 TC07 TC08 TC09; do
  result="${TEST_RESULTS[$tc]:-N/A}"
  case "$result" in
    PASS) icon="✅" ;;
    FAIL) icon="❌" ;;
    SKIP) icon="⏭️" ;;
    *) icon="❓" ;;
  esac
  SUMMARY_TABLE="$SUMMARY_TABLE\n| $tc | | $icon $result |"
done

# Insert summary into report (replace the marker)
sed -i "/^| # | Test Case | Kết quả |$/a\\
| --- | --- | --- |$(echo -e "$SUMMARY_TABLE")" "$REPORT_FILE"

# Add final summary
log_report ""
log_report "## Tổng kết"
log_report ""
log_report "- **PASS:** $PASS"  
log_report "- **FAIL:** $FAIL"
log_report "- **SKIP:** $SKIP"
log_report "- **Tổng:** $((PASS+FAIL+SKIP))"
log_report ""
log_report "### Subscriptions đã tạo"
for win_ver in Win2025 Win2022 Win2019 Win2016; do
  log_report "- $win_ver: ${SUB_IDS[$win_ver]:-N/A} (IP: ${VM_IPS[$win_ver]:-N/A})"
done

log ""
log "Báo cáo: $REPORT_FILE"
cat "$REPORT_FILE"

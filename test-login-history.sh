#!/bin/bash

# Script test để kiểm tra API login history sau khi fix
# Chạy script này để verify logic extract IP và geolocation

echo "=========================================="
echo "🔍 Testing Admin Login History API"
echo "=========================================="
echo ""

# Thay đổi các biến này theo môi trường của bạn
API_URL="${API_URL:-http://localhost:3003}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@test.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-password123}"

echo "📌 Configuration:"
echo "   API URL: $API_URL"
echo "   Email: $ADMIN_EMAIL"
echo ""

# Test 1: Login với IP giả lập
echo "=========================================="
echo "Test 1: Login với X-Forwarded-For header"
echo "=========================================="

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 42.118.1.100" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  -c cookies.txt)

if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
  echo "✅ Login successful!"
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')
  echo "   Access Token: ${ACCESS_TOKEN:0:50}..."
else
  echo "❌ Login failed!"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
sleep 2

# Test 2: Lấy login history
echo "=========================================="
echo "Test 2: Fetch Login History"
echo "=========================================="

HISTORY_RESPONSE=$(curl -s -X GET "$API_URL/auth/admin-login-history/all?limit=5&sortBy=loginTime&sortOrder=DESC" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt)

echo "$HISTORY_RESPONSE" | jq '.' 2>/dev/null || echo "$HISTORY_RESPONSE"

# Parse và hiển thị IP và Location
echo ""
echo "📊 Latest Login Records:"
echo "------------------------"

if command -v jq &> /dev/null; then
  echo "$HISTORY_RESPONSE" | jq -r '.data[] | "🔹 IP: \(.ipV4 // .ipV6 // "N/A") | Location: \(.city // "N/A"), \(.country // "N/A") | Browser: \(.browser // "N/A") | Status: \(.loginStatus)"' | head -5
else
  echo "⚠️  Install 'jq' to see formatted output: sudo apt install jq"
  echo "$HISTORY_RESPONSE"
fi

echo ""
echo "=========================================="
echo "Test 3: Verify IP Extraction"
echo "=========================================="

# Test với nhiều proxy
echo "Testing multiple X-Forwarded-For IPs..."

curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 42.118.1.100, 10.0.0.1, 172.16.0.1" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"wrong_password\"}" > /dev/null

echo "✅ Sent request with multiple proxy IPs"
echo "   Expected: Should capture first IP (42.118.1.100)"

sleep 1

# Test với X-Real-IP
echo "Testing X-Real-IP header..."

curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Real-IP: 14.161.1.200" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"wrong_password\"}" > /dev/null

echo "✅ Sent request with X-Real-IP"
echo "   Expected: Should capture IP (14.161.1.200)"

echo ""
sleep 2

# Fetch lại history để xem kết quả
echo "=========================================="
echo "📊 Updated Login History:"
echo "=========================================="

UPDATED_HISTORY=$(curl -s -X GET "$API_URL/auth/admin-login-history/all?limit=5&sortBy=loginTime&sortOrder=DESC" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt)

if command -v jq &> /dev/null; then
  echo "$UPDATED_HISTORY" | jq -r '.data[] | "🔹 Time: \(.loginTime) | IP: \(.ipV4 // .ipV6 // "N/A") | Location: \(.city // "N/A"), \(.country // "N/A") | Status: \(.loginStatus)"' | head -5
else
  echo "$UPDATED_HISTORY"
fi

echo ""
echo "=========================================="
echo "✅ Test completed!"
echo "=========================================="
echo ""
echo "📝 Next Steps:"
echo "1. Check if IP addresses are NOT 127.0.0.1"
echo "2. Check if Location is NOT 'Localhost, Local'"
echo "3. Verify GeoIP lookup is working correctly"
echo "4. Check backend logs: pm2 logs oracle-ics-backend"
echo ""

# Cleanup
rm -f cookies.txt

echo "For production testing, run:"
echo "  API_URL=https://api.oraclecloud.vn ./test-login-history.sh"

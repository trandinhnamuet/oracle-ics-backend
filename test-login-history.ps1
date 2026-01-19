# PowerShell script để test Admin Login History API
# Chạy: .\test-login-history.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🔍 Testing Admin Login History API" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:3003" }
$ADMIN_EMAIL = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@test.com" }
$ADMIN_PASSWORD = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "password123" }

Write-Host "📌 Configuration:" -ForegroundColor Yellow
Write-Host "   API URL: $API_URL"
Write-Host "   Email: $ADMIN_EMAIL"
Write-Host ""

# Test 1: Login with simulated IP
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test 1: Login with X-Forwarded-For header" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$headers = @{
    "Content-Type" = "application/json"
    "X-Forwarded-For" = "42.118.1.100"
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0"
}

$body = @{
    email = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method Post -Headers $headers -Body $body -SessionVariable session
    Write-Host "✅ Login successful!" -ForegroundColor Green
    $accessToken = $response.accessToken
    Write-Host "   Access Token: $($accessToken.Substring(0, [Math]::Min(50, $accessToken.Length)))..."
} catch {
    Write-Host "❌ Login failed!" -ForegroundColor Red
    Write-Host "   Error: $_"
    exit 1
}

Write-Host ""
Start-Sleep -Seconds 2

# Test 2: Fetch login history
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test 2: Fetch Login History" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $accessToken"
}

try {
    $historyResponse = Invoke-RestMethod -Uri "$API_URL/auth/admin-login-history/all?limit=5&sortBy=loginTime&sortOrder=DESC" -Method Get -Headers $headers -WebSession $session
    
    Write-Host ""
    Write-Host "📊 Latest Login Records:" -ForegroundColor Yellow
    Write-Host "------------------------"
    
    foreach ($record in $historyResponse.data) {
        $ip = if ($record.ipV4) { $record.ipV4 } elseif ($record.ipV6) { $record.ipV6 } else { "N/A" }
        $city = if ($record.city) { $record.city } else { "N/A" }
        $country = if ($record.country) { $record.country } else { "N/A" }
        $browser = if ($record.browser) { $record.browser } else { "N/A" }
        $status = $record.loginStatus
        
        Write-Host "🔹 IP: $ip | Location: $city, $country | Browser: $browser | Status: $status"
    }
} catch {
    Write-Host "❌ Failed to fetch history!" -ForegroundColor Red
    Write-Host "   Error: $_"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test 3: Verify IP Extraction" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Test with multiple proxy IPs
Write-Host "Testing multiple X-Forwarded-For IPs..."

$headers = @{
    "Content-Type" = "application/json"
    "X-Forwarded-For" = "42.118.1.100, 10.0.0.1, 172.16.0.1"
    "User-Agent" = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36"
}

$body = @{
    email = $ADMIN_EMAIL
    password = "wrong_password"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$API_URL/auth/login" -Method Post -Headers $headers -Body $body -ErrorAction SilentlyContinue | Out-Null
} catch {
    # Expected to fail with wrong password
}

Write-Host "✅ Sent request with multiple proxy IPs" -ForegroundColor Green
Write-Host "   Expected: Should capture first IP (42.118.1.100)"

Start-Sleep -Seconds 1

# Test with X-Real-IP
Write-Host "Testing X-Real-IP header..."

$headers = @{
    "Content-Type" = "application/json"
    "X-Real-IP" = "14.161.1.200"
    "User-Agent" = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
}

$body = @{
    email = $ADMIN_EMAIL
    password = "wrong_password"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$API_URL/auth/login" -Method Post -Headers $headers -Body $body -ErrorAction SilentlyContinue | Out-Null
} catch {
    # Expected to fail
}

Write-Host "✅ Sent request with X-Real-IP" -ForegroundColor Green
Write-Host "   Expected: Should capture IP (14.161.1.200)"

Write-Host ""
Start-Sleep -Seconds 2

# Fetch updated history
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "📊 Updated Login History:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $accessToken"
}

try {
    $updatedHistory = Invoke-RestMethod -Uri "$API_URL/auth/admin-login-history/all?limit=5&sortBy=loginTime&sortOrder=DESC" -Method Get -Headers $headers -WebSession $session
    
    foreach ($record in $updatedHistory.data) {
        $time = $record.loginTime
        $ip = if ($record.ipV4) { $record.ipV4 } elseif ($record.ipV6) { $record.ipV6 } else { "N/A" }
        $city = if ($record.city) { $record.city } else { "N/A" }
        $country = if ($record.country) { $record.country } else { "N/A" }
        $status = $record.loginStatus
        
        Write-Host "🔹 Time: $time | IP: $ip | Location: $city, $country | Status: $status"
    }
} catch {
    Write-Host "❌ Failed to fetch updated history!" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Test completed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Check if IP addresses are NOT 127.0.0.1"
Write-Host "2. Check if Location is NOT 'Localhost, Local'"
Write-Host "3. Verify GeoIP lookup is working correctly"
Write-Host "4. Check backend logs"
Write-Host ""
Write-Host "For production testing, run:" -ForegroundColor Cyan
Write-Host '  $env:API_URL="https://api.oraclecloud.vn"; .\test-login-history.ps1'

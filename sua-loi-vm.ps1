# Script tự động sửa lỗi compartment cũ
# Chạy script này để xóa compartment cũ và khởi động lại backend

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "SỬA LỖI TẠO VM - XÓA COMPARTMENT CŨ" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Thông tin database
$PGHOST = "localhost"
$PGPORT = "5432"
$PGDATABASE = "oracle_db"
$PGUSER = "oracle_admin"
$PGPASSWORD = "minhtuan"
$USER_ID = 7

Write-Host "Bước 1: Kiểm tra compartment hiện tại..." -ForegroundColor Yellow

# Tạo câu SQL
$sqlCheck = @"
SELECT user_id, compartment_ocid, compartment_name, lifecycle_state, created_at
FROM oracle.user_compartments
WHERE user_id = $USER_ID;
"@

# Hiển thị SQL
Write-Host "SQL Query:" -ForegroundColor Gray
Write-Host $sqlCheck -ForegroundColor Gray
Write-Host ""

Write-Host "Bước 2: Xóa dữ liệu cũ..." -ForegroundColor Yellow

$sqlCleanup = @"
-- Xóa VCN resources
DELETE FROM oracle.vcn_resources WHERE user_id = $USER_ID;

-- Xóa VM instances đang PROVISIONING
DELETE FROM oracle.vm_instances 
WHERE user_id = $USER_ID 
AND lifecycle_state IN ('PROVISIONING', 'TERMINATED', 'TERMINATING');

-- Xóa compartment
DELETE FROM oracle.user_compartments WHERE user_id = $USER_ID;

-- Kiểm tra kết quả
SELECT 'SAU KHI XÓA' as giai_doan, COUNT(*) as so_luong_compartment
FROM oracle.user_compartments
WHERE user_id = $USER_ID;
"@

Write-Host "CẢNH BÁO: Script này sẽ xóa compartment cũ khỏi database." -ForegroundColor Red
Write-Host "Điều này là AN TOÀN vì VM chưa được tạo thành công." -ForegroundColor Red
Write-Host ""
Write-Host "Nhấn Y để tiếp tục, N để hủy..." -ForegroundColor Yellow
$confirm = Read-Host "Xác nhận (Y/N)"

if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "Đã hủy." -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "Đang xóa dữ liệu cũ..." -ForegroundColor Green

# Lưu SQL vào file tạm
$tempSqlFile = Join-Path $env:TEMP "cleanup-compartment.sql"
$sqlCleanup | Out-File -FilePath $tempSqlFile -Encoding UTF8

# Hiển thị hướng dẫn thực thi
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "CÁC BƯỚC THỰC HIỆN THỦ CÔNG:" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. MỞ pgAdmin hoặc công cụ PostgreSQL" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. KẾT NỐI với:" -ForegroundColor Yellow
Write-Host "   - Host: $PGHOST" -ForegroundColor White
Write-Host "   - Port: $PGPORT" -ForegroundColor White
Write-Host "   - Database: $PGDATABASE" -ForegroundColor White
Write-Host "   - User: $PGUSER" -ForegroundColor White
Write-Host "   - Password: $PGPASSWORD" -ForegroundColor White
Write-Host ""
Write-Host "3. CHẠY CÁC CÂU SQL SAU:" -ForegroundColor Yellow
Write-Host ""
Write-Host $sqlCleanup -ForegroundColor Cyan
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "SQL đã được lưu vào: $tempSqlFile" -ForegroundColor Green
Write-Host ""

Write-Host "Bước 3: Khởi động lại backend..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Nhấn ENTER khi đã xong bước 2 để khởi động lại backend..." -ForegroundColor Yellow
Read-Host

# Di chuyển đến thư mục backend
$backendPath = "C:\ics\oracle\oracle-ics-backend"
if (Test-Path $backendPath) {
    Set-Location $backendPath
    Write-Host "Đang khởi động backend..." -ForegroundColor Green
    Write-Host "Chạy lệnh: npm run start:dev" -ForegroundColor Gray
    Write-Host ""
    Write-Host "MỞ TERMINAL MỚI và chạy:" -ForegroundColor Yellow
    Write-Host "  cd $backendPath" -ForegroundColor Cyan
    Write-Host "  npm run start:dev" -ForegroundColor Cyan
} else {
    Write-Host "CẢNH BÁO: Không tìm thấy thư mục backend tại $backendPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "HOÀN TẤT!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "BÂY GIỜ:" -ForegroundColor Yellow
Write-Host "1. Đảm bảo backend đang chạy" -ForegroundColor White
Write-Host "2. Vào http://localhost:3000/cloud/configuration/46bb4765-8c39-4618-a213-ccfe68b0aac3" -ForegroundColor White
Write-Host "3. Thử tạo VM lại" -ForegroundColor White
Write-Host ""
Write-Host "Hệ thống sẽ tự động tạo compartment mới và VM!" -ForegroundColor Green
Write-Host ""

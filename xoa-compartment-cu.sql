-- XÓA COMPARTMENT CŨ CHO USER 7
-- Script này xóa compartment cũ (có thể đã bị xóa hoặc ở trạng thái DELETED trên OCI)
-- để hệ thống tự động tạo compartment mới

-- Bước 1: Xem trạng thái hiện tại
SELECT 'TRƯỚC KHI XÓA:' as giai_doan, 
       user_id, 
       compartment_ocid, 
       compartment_name,
       lifecycle_state,
       created_at
FROM oracle.user_compartments
WHERE user_id = 7;

-- Bước 2: Xóa các bản ghi liên quan theo thứ tự

-- 2a. Xóa VCN resources của user 7
DELETE FROM oracle.vcn_resources 
WHERE user_id = 7;

-- 2b. Xóa VM instances đang PROVISIONING hoặc failed
DELETE FROM oracle.vm_instances 
WHERE user_id = 7 
AND lifecycle_state IN ('PROVISIONING', 'TERMINATED', 'TERMINATING');

-- 2c. Xóa compartment cũ
DELETE FROM oracle.user_compartments 
WHERE user_id = 7;

-- Bước 3: Kiểm tra kết quả
SELECT 'SAU KHI XÓA:' as giai_doan,
       COUNT(*) as so_luong_compartment_con_lai
FROM oracle.user_compartments
WHERE user_id = 7;

-- Kết quả mong đợi: 0 compartments
-- Sau khi chạy script này, hãy thử tạo VM lại từ giao diện web
-- Hệ thống sẽ tự động tạo compartment mới ở trạng thái ACTIVE

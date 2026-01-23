-- ============================================================================
-- BANDWIDTH DUPLICATE CLEANUP SCRIPT
-- ============================================================================
-- Purpose: Remove duplicate bandwidth log entries caused by overlapping cron jobs
-- Issue: Two cron jobs (hourly + 6-hourly) were running simultaneously
-- Impact: Each VM logged twice with identical data, inflating bandwidth by 2x
-- 
-- BEFORE RUNNING: 
-- 1. Backup the bandwidth_logs table
-- 2. Review the duplicates first (see section 1)
-- 3. Test on a small dataset
-- ============================================================================

-- ============================================================================
-- SECTION 1: ANALYZE DUPLICATES (Read-Only)
-- ============================================================================

-- 1.1 Count total duplicates
SELECT 
  'Total Duplicate Groups' as metric,
  COUNT(*) as count
FROM (
  SELECT vm_instance_id, recorded_at
  FROM oracle.bandwidth_logs
  GROUP BY vm_instance_id, recorded_at
  HAVING COUNT(*) > 1
) duplicates;

-- 1.2 Show all duplicate groups with details
SELECT 
  vm_instance_id,
  instance_name,
  recorded_at,
  COUNT(*) as duplicate_count,
  SUM(total_bytes) as total_bytes_sum,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0, 2) as total_GB,
  ARRAY_AGG(id ORDER BY id) as duplicate_ids
FROM oracle.bandwidth_logs
GROUP BY vm_instance_id, instance_name, recorded_at
HAVING COUNT(*) > 1
ORDER BY recorded_at DESC;

-- 1.3 Calculate bandwidth savings after cleanup
SELECT 
  'Bandwidth Reduction' as metric,
  SUM(total_bytes) as current_total_bytes,
  SUM(total_bytes) / 2 as expected_after_cleanup,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as current_TB,
  ROUND((SUM(total_bytes) / 2) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as expected_TB
FROM oracle.bandwidth_logs
WHERE EXISTS (
  SELECT 1 
  FROM oracle.bandwidth_logs b2
  WHERE b2.vm_instance_id = bandwidth_logs.vm_instance_id
    AND b2.recorded_at = bandwidth_logs.recorded_at
    AND b2.id != bandwidth_logs.id
);

-- ============================================================================
-- SECTION 2: BACKUP (Optional but Recommended)
-- ============================================================================

-- 2.1 Create backup table
CREATE TABLE IF NOT EXISTS oracle.bandwidth_logs_backup_20260123 AS
SELECT * FROM oracle.bandwidth_logs;

-- Verify backup
SELECT 
  'Backup Created' as status,
  COUNT(*) as records_backed_up
FROM oracle.bandwidth_logs_backup_20260123;

-- ============================================================================
-- SECTION 3: CLEANUP - REMOVE DUPLICATES
-- ============================================================================

-- Strategy: Keep the FIRST entry (lowest ID), delete later entries
-- This is the safest approach as it preserves the earliest timestamp

-- 3.1 Preview what will be deleted (READ-ONLY - run this first)
SELECT 
  bl.id as will_be_deleted_id,
  bl.vm_instance_id,
  bl.instance_id,
  bl.instance_name,
  bl.recorded_at,
  bl.total_bytes,
  ROUND(bl.total_bytes / 1024.0 / 1024.0 / 1024.0, 2) as GB
FROM oracle.bandwidth_logs bl
WHERE EXISTS (
  SELECT 1
  FROM oracle.bandwidth_logs bl2
  WHERE bl2.vm_instance_id = bl.vm_instance_id
    AND bl2.recorded_at = bl.recorded_at
    AND bl2.id < bl.id  -- Keep the first (lowest ID), delete others
)
ORDER BY bl.vm_instance_id, bl.recorded_at, bl.id;

-- 3.2 Count how many will be deleted
SELECT 
  'Records to Delete' as metric,
  COUNT(*) as count
FROM oracle.bandwidth_logs bl
WHERE EXISTS (
  SELECT 1
  FROM oracle.bandwidth_logs bl2
  WHERE bl2.vm_instance_id = bl.vm_instance_id
    AND bl2.recorded_at = bl.recorded_at
    AND bl2.id < bl.id
);

-- 3.3 ACTUAL CLEANUP - DELETE DUPLICATES
-- ⚠️ WARNING: This will permanently delete data
-- Make sure you've reviewed sections 3.1 and 3.2 first!

-- BEGIN; -- Uncomment to use transaction (allows rollback)

DELETE FROM oracle.bandwidth_logs
WHERE id IN (
  SELECT bl.id
  FROM oracle.bandwidth_logs bl
  WHERE EXISTS (
    SELECT 1
    FROM oracle.bandwidth_logs bl2
    WHERE bl2.vm_instance_id = bl.vm_instance_id
      AND bl2.recorded_at = bl.recorded_at
      AND bl2.id < bl.id  -- Delete all except the first (lowest ID)
  )
);

-- ROLLBACK; -- Uncomment to undo changes if using transaction
-- COMMIT; -- Uncomment to commit changes if using transaction

-- ============================================================================
-- SECTION 4: VERIFICATION
-- ============================================================================

-- 4.1 Verify no duplicates remain
SELECT 
  'Remaining Duplicates' as metric,
  COUNT(*) as count
FROM (
  SELECT vm_instance_id, recorded_at
  FROM oracle.bandwidth_logs
  GROUP BY vm_instance_id, recorded_at
  HAVING COUNT(*) > 1
) duplicates;

-- Expected result: count = 0

-- 4.2 Verify total records after cleanup
SELECT 
  'After Cleanup' as status,
  COUNT(*) as total_records,
  COUNT(DISTINCT vm_instance_id) as unique_vms,
  SUM(total_bytes) as total_bytes,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as total_TB
FROM oracle.bandwidth_logs;

-- 4.3 Compare before and after
SELECT 
  'Before Cleanup' as stage,
  COUNT(*) as records,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as TB
FROM oracle.bandwidth_logs_backup_20260123

UNION ALL

SELECT 
  'After Cleanup' as stage,
  COUNT(*) as records,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as TB
FROM oracle.bandwidth_logs;

-- ============================================================================
-- SECTION 5: ALTERNATIVE CLEANUP (More Conservative)
-- ============================================================================

-- Alternative: Instead of deleting, mark duplicates as invalid
-- This keeps the data but excludes from calculations

-- 5.1 Add a flag column (optional)
-- ALTER TABLE oracle.bandwidth_logs 
-- ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;

-- 5.2 Mark duplicates instead of deleting
-- UPDATE oracle.bandwidth_logs bl
-- SET is_duplicate = TRUE
-- WHERE EXISTS (
--   SELECT 1
--   FROM oracle.bandwidth_logs bl2
--   WHERE bl2.vm_instance_id = bl.vm_instance_id
--     AND bl2.recorded_at = bl.recorded_at
--     AND bl2.id < bl.id
-- );

-- ============================================================================
-- SECTION 6: ONGOING MONITORING
-- ============================================================================

-- 6.1 Query to detect new duplicates daily
-- Run this periodically to ensure issue doesn't recur
CREATE OR REPLACE VIEW oracle.bandwidth_duplicate_monitor AS
SELECT 
  vm_instance_id,
  instance_name,
  recorded_at,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY id) as duplicate_ids,
  SUM(total_bytes) as total_bytes,
  MAX(created_at) as latest_created
FROM oracle.bandwidth_logs
GROUP BY vm_instance_id, instance_name, recorded_at
HAVING COUNT(*) > 1
ORDER BY recorded_at DESC;

-- Check for duplicates
SELECT * FROM oracle.bandwidth_duplicate_monitor;

-- ============================================================================
-- USAGE INSTRUCTIONS:
-- ============================================================================
-- 
-- STEP 1: Run Section 1 (Analysis) - Review the current state
-- STEP 2: Run Section 2 (Backup) - Create safety backup
-- STEP 3: Run Section 3.1 & 3.2 (Preview) - See what will be deleted
-- STEP 4: Run Section 3.3 (Cleanup) - Execute the deletion
-- STEP 5: Run Section 4 (Verification) - Confirm cleanup success
-- STEP 6: (Optional) Set up Section 6 (Monitoring) for ongoing checks
-- 
-- EXPECTED RESULTS:
-- - Before: 10 records, 0.1585 TB
-- - After: 5 records, 0.0793 TB
-- - Removed: 5 duplicate records, ~0.079 TB of duplicate data
-- 
-- ============================================================================

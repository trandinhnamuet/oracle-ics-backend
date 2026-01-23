-- Check bandwidth data for potential duplicates or anomalies

-- 1. Total bandwidth logs count
SELECT 
  'Total Bandwidth Logs' as metric,
  COUNT(*) as count,
  MIN(recorded_at) as earliest_record,
  MAX(recorded_at) as latest_record
FROM oracle.bandwidth_logs;

-- 2. Check for potential duplicate entries (same VM, same timestamp)
SELECT 
  'Duplicate Entries (same time)' as issue_type,
  vm_instance_id,
  instance_id,
  instance_name,
  recorded_at,
  COUNT(*) as duplicate_count,
  SUM(total_bytes) as total_bytes_sum
FROM oracle.bandwidth_logs
GROUP BY vm_instance_id, instance_id, instance_name, recorded_at
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 3. Check for multiple entries within short time windows (same VM)
-- This query looks for VMs with multiple logs within 1 minute
SELECT 
  'Multiple Entries (within 1 min)' as issue_type,
  bl1.vm_instance_id,
  bl1.instance_id,
  bl1.instance_name,
  bl1.recorded_at as time1,
  bl2.recorded_at as time2,
  EXTRACT(EPOCH FROM (bl2.recorded_at - bl1.recorded_at)) as seconds_apart,
  bl1.total_bytes as bytes1,
  bl2.total_bytes as bytes2
FROM oracle.bandwidth_logs bl1
JOIN oracle.bandwidth_logs bl2 
  ON bl1.vm_instance_id = bl2.vm_instance_id
  AND bl2.recorded_at > bl1.recorded_at
  AND bl2.recorded_at <= bl1.recorded_at + INTERVAL '1 minute'
WHERE bl1.total_bytes > 0 OR bl2.total_bytes > 0
ORDER BY bl1.vm_instance_id, bl1.recorded_at
LIMIT 50;

-- 4. Total bandwidth by VM (including deleted VMs)
SELECT 
  bl.vm_instance_id,
  bl.instance_id,
  bl.instance_name,
  vi.lifecycle_state,
  COUNT(*) as log_count,
  MIN(bl.recorded_at) as first_logged,
  MAX(bl.recorded_at) as last_logged,
  SUM(bl.bytes_in) as total_bytes_in,
  SUM(bl.bytes_out) as total_bytes_out,
  SUM(bl.total_bytes) as total_bytes,
  ROUND(SUM(bl.total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as total_TB
FROM oracle.bandwidth_logs bl
LEFT JOIN oracle.vm_instances vi ON bl.vm_instance_id = vi.id
GROUP BY bl.vm_instance_id, bl.instance_id, bl.instance_name, vi.lifecycle_state
ORDER BY total_TB DESC;

-- 5. Check VMs with unusually high bandwidth (potential anomalies)
SELECT 
  'High Bandwidth VMs (>1TB)' as category,
  bl.vm_instance_id,
  bl.instance_id,
  bl.instance_name,
  vi.lifecycle_state,
  COUNT(*) as log_count,
  SUM(bl.total_bytes) as total_bytes,
  ROUND(SUM(bl.total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as total_TB,
  ROUND(AVG(bl.total_bytes) / 1024.0 / 1024.0, 2) as avg_MB_per_log
FROM oracle.bandwidth_logs bl
LEFT JOIN oracle.vm_instances vi ON bl.vm_instance_id = vi.id
GROUP BY bl.vm_instance_id, bl.instance_id, bl.instance_name, vi.lifecycle_state
HAVING SUM(bl.total_bytes) > 1099511627776  -- More than 1TB
ORDER BY total_TB DESC;

-- 6. Check if deleted VMs have bandwidth logs after termination
SELECT 
  'Logs After VM Termination' as issue_type,
  vi.id as vm_id,
  vi.instance_id,
  vi.instance_name,
  vi.lifecycle_state,
  vi.time_terminated,
  COUNT(bl.id) as logs_after_termination,
  SUM(bl.total_bytes) as total_bytes_after_termination,
  MIN(bl.recorded_at) as first_log_after,
  MAX(bl.recorded_at) as last_log_after
FROM oracle.vm_instances vi
LEFT JOIN oracle.bandwidth_logs bl 
  ON vi.id = bl.vm_instance_id
  AND bl.recorded_at > vi.time_terminated
WHERE vi.lifecycle_state IN ('TERMINATED', 'TERMINATING')
  AND vi.time_terminated IS NOT NULL
GROUP BY vi.id, vi.instance_id, vi.instance_name, vi.lifecycle_state, vi.time_terminated
HAVING COUNT(bl.id) > 0
ORDER BY logs_after_termination DESC;

-- 7. Summary statistics
SELECT 
  'Summary' as section,
  COUNT(DISTINCT vm_instance_id) as total_unique_vms,
  COUNT(*) as total_log_entries,
  SUM(total_bytes) as total_bytes_all,
  ROUND(SUM(total_bytes) / 1024.0 / 1024.0 / 1024.0 / 1024.0, 4) as total_TB_all,
  MIN(recorded_at) as oldest_log,
  MAX(recorded_at) as newest_log
FROM oracle.bandwidth_logs;

-- 8. Check for VMs with logs but different instance_id in logs vs vm_instances table
SELECT 
  'Instance ID Mismatch' as issue_type,
  bl.vm_instance_id,
  bl.instance_id as log_instance_id,
  vi.instance_id as vm_table_instance_id,
  COUNT(*) as mismatch_count,
  SUM(bl.total_bytes) as total_bytes
FROM oracle.bandwidth_logs bl
LEFT JOIN oracle.vm_instances vi ON bl.vm_instance_id = vi.id
WHERE bl.instance_id != vi.instance_id
GROUP BY bl.vm_instance_id, bl.instance_id, vi.instance_id
ORDER BY mismatch_count DESC;

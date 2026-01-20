-- Analytics Cleanup Job Configuration
-- This can be run as a scheduled job to clean up old analytics data

-- 1. View analytics statistics
SELECT 
  COUNT(*) as total_records,
  DATE(MIN(created_at)) as oldest_record,
  DATE(MAX(created_at)) as newest_record,
  COUNT(DISTINCT event_type) as unique_events,
  COUNT(DISTINCT page_path) as unique_pages
FROM page_analytics;

-- 2. View oldest records (for manual cleanup)
SELECT 
  id, 
  event_type, 
  page_path, 
  created_at
FROM page_analytics
ORDER BY created_at ASC
LIMIT 10;

-- 3. Delete records older than 90 days (manual)
DELETE FROM page_analytics
WHERE created_at < NOW() - INTERVAL '90 days';

-- 4. View event distribution
SELECT 
  event_type, 
  COUNT(*) as count
FROM page_analytics
GROUP BY event_type
ORDER BY count DESC;

-- 5. View page distribution
SELECT 
  page_path, 
  page_title, 
  COUNT(*) as views
FROM page_analytics
WHERE event_type = 'page_view'
GROUP BY page_path, page_title
ORDER BY views DESC
LIMIT 20;

-- 6. View daily statistics
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_events,
  COUNT(DISTINCT event_type) as unique_events,
  COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN 1 END) as page_views
FROM page_analytics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 7. View bounce rate for pages
SELECT 
  page_path,
  COUNT(DISTINCT session_id) as total_sessions,
  SUM(CASE WHEN page_count = 1 THEN 1 ELSE 0 END) as bounced,
  ROUND(
    SUM(CASE WHEN page_count = 1 THEN 1 ELSE 0 END)::numeric / 
    COUNT(DISTINCT session_id)::numeric * 100, 2
  ) as bounce_rate_percent
FROM (
  SELECT 
    session_id,
    page_path,
    COUNT(*) as page_count
  FROM page_analytics
  WHERE event_type = 'page_view' AND session_id IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY session_id, page_path
) subq
GROUP BY page_path
ORDER BY bounce_rate_percent DESC;

-- 8. View average load times
SELECT 
  page_path,
  AVG(load_time_ms)::integer as avg_load_time,
  MAX(load_time_ms) as max_load_time,
  MIN(load_time_ms) as min_load_time,
  COUNT(*) as measurements
FROM page_analytics
WHERE event_type = 'page_load_time'
AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY page_path
ORDER BY avg_load_time DESC;

-- 9. View user engagement (button clicks, form submits)
SELECT 
  event_type,
  button_name,
  form_name,
  COUNT(*) as count
FROM page_analytics
WHERE event_type IN ('button_click', 'form_submit')
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY event_type, button_name, form_name
ORDER BY count DESC;

-- 10. Create index for performance (if needed)
CREATE INDEX IF NOT EXISTS idx_analytics_created_at_event_type 
ON page_analytics(created_at DESC, event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_page_path_session
ON page_analytics(page_path, session_id);

-- 11. Table size information
SELECT 
  pg_size_pretty(pg_total_relation_size('page_analytics')) as table_size,
  pg_size_pretty(pg_indexes_size('page_analytics')) as indexes_size;

-- 12. Check for duplicate entries (for debugging)
SELECT 
  event_type,
  page_path,
  session_id,
  COUNT(*) as duplicate_count,
  MAX(created_at) as latest
FROM page_analytics
GROUP BY event_type, page_path, session_id
HAVING COUNT(*) > 10
ORDER BY duplicate_count DESC;

-- 13. Analyze analytics table (PostgreSQL optimization)
ANALYZE page_analytics;

-- 14. Vacuum table (clean up dead tuples)
VACUUM ANALYZE page_analytics;

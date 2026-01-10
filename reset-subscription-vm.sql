-- Reset VM instance ID for subscription to allow new VM creation
-- Run this in your PostgreSQL database

UPDATE oracle.subscriptions 
SET vm_instance_id = NULL,
    status = 'pending'
WHERE id = 'de7c4d2b-8b06-4d73-89e6-2b838ec498ae';

-- Check result
SELECT id, vm_instance_id, status 
FROM oracle.subscriptions 
WHERE id = 'de7c4d2b-8b06-4d73-89e6-2b838ec498ae';

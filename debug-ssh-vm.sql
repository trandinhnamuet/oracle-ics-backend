-- Check VM data for debugging SSH issue
SELECT 
    id,
    instance_name,
    public_ip,
    instance_id,
    subscription_id,
    LEFT(ssh_public_key, 100) as ssh_key_preview,
    LENGTH(ssh_public_key) as key_length,
    created_at
FROM vm_instances 
WHERE public_ip = '158.179.184.51'
ORDER BY created_at DESC;

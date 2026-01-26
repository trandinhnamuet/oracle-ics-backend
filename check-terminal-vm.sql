-- Check VM terminal configuration
-- Replace 9 with actual VM ID if different

SELECT 
    vi.id as vm_id,
    vi.instance_name,
    vi.public_ip,
    vi.operating_system,
    vi.lifecycle_state,
    vi.system_ssh_key_id,
    vi.has_admin_access,
    vi.ssh_private_key_encrypted IS NOT NULL as has_user_key,
    sk.id as system_key_id,
    sk.name as system_key_name,
    sk.is_active as key_is_active,
    LENGTH(sk.private_key_encrypted) as encrypted_key_length,
    LEFT(sk.private_key_encrypted, 50) as encrypted_key_preview,
    sk.created_at as key_created_at
FROM oracle.vm_instances vi
LEFT JOIN oracle.system_ssh_keys sk ON vi.system_ssh_key_id = sk.id
WHERE vi.id = 9
ORDER BY vi.id DESC;

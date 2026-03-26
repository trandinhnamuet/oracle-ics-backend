SELECT s.id as subscription_id, s.user_id 
FROM oracle.subscription s 
JOIN oracle.vm_instance v ON v.id=s.vm_instance_id 
WHERE v.public_ip LIKE '161.33%';

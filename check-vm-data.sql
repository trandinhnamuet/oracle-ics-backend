-- Check subscription data
SELECT id, user_id, cloud_package_id, status, vm_instance_id, created_at
FROM oracle.subscriptions 
WHERE id = 'de7c4d2b-8b06-4d73-89e6-2b838ec498ae';

-- Check VM instance data
SELECT id, subscription_id, instance_name, instance_id, shape, lifecycle_state, public_ip, created_at, updated_at
FROM oracle.vm_instances
WHERE subscription_id = 'de7c4d2b-8b06-4d73-89e6-2b838ec498ae'
ORDER BY created_at DESC;

-- Check latest VM for this user
SELECT vm.id, vm.subscription_id, s.user_id, vm.instance_name, vm.instance_id, vm.lifecycle_state, vm.public_ip, vm.created_at
FROM oracle.vm_instances vm
JOIN oracle.subscriptions s ON vm.subscription_id = s.id
WHERE s.user_id = 8
ORDER BY vm.created_at DESC;

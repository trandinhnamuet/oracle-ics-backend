-- Check all compartments for user 7
SELECT 
    user_id,
    compartment_ocid,
    compartment_name,
    region,
    lifecycle_state,
    created_at
FROM oracle.user_compartments
WHERE user_id = 7
ORDER BY created_at DESC;

-- Check VCN resources for those compartments
SELECT 
    uc.user_id,
    uc.compartment_ocid,
    uc.compartment_name,
    vcn.vcn_ocid,
    vcn.vcn_name,
    vcn.lifecycle_state as vcn_state,
    vcn.created_at
FROM oracle.user_compartments uc
LEFT JOIN oracle.vcn_resources vcn ON uc.compartment_ocid = vcn.compartment_id
WHERE uc.user_id = 7
ORDER BY uc.created_at DESC, vcn.created_at DESC;

-- Check VM instances
SELECT 
    id,
    user_id,
    compartment_id,
    instance_id,
    instance_name,
    lifecycle_state,
    subscription_id,
    created_at
FROM oracle.vm_instances
WHERE user_id = 7
ORDER BY created_at DESC;

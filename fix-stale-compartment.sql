-- Fix stale compartment issue for user 7
-- This script removes the stale compartment that no longer exists in OCI
-- but is still referenced in the database, causing VCN creation failures

-- Step 1: Check current state
SELECT 
    'BEFORE CLEANUP' as stage,
    user_id,
    compartment_ocid,
    compartment_name,
    lifecycle_state,
    created_at
FROM oracle.user_compartments
WHERE user_id = 7;

-- Step 2: Check if there are any VMs or VCN resources using this compartment
SELECT 
    'VCN Resources' as resource_type,
    COUNT(*) as count
FROM oracle.vcn_resources
WHERE user_id = 7
UNION ALL
SELECT 
    'VM Instances' as resource_type,
    COUNT(*) as count
FROM oracle.vm_instances
WHERE user_id = 7;

-- Step 3: Clean up stale VCN resources for user 7
DELETE FROM oracle.vcn_resources
WHERE user_id = 7
AND vcn_ocid IN (
    -- Only delete VCNs that no longer exist in the compartment
    SELECT vcn_ocid FROM oracle.vcn_resources WHERE user_id = 7
);

-- Step 4: Clean up stale VM instances for user 7 (if any with the stale compartment)
-- Note: Only delete VMs that are in PROVISIONING or failed state
DELETE FROM oracle.vm_instances
WHERE user_id = 7
AND compartment_id = 'ocid1.compartment.oc1..aaaaaaaahoqatg3a7m7v5exvvaldrmicaltyei4gdrd4wtnboyqczpmt6x2q'
AND lifecycle_state IN ('PROVISIONING', 'TERMINATED', 'TERMINATING');

-- Step 5: Delete the stale compartment
DELETE FROM oracle.user_compartments
WHERE user_id = 7
AND compartment_ocid = 'ocid1.compartment.oc1..aaaaaaaahoqatg3a7m7v5exvvaldrmicaltyei4gdrd4wtnboyqczpmt6x2q';

-- Step 6: Verify cleanup
SELECT 
    'AFTER CLEANUP' as stage,
    user_id,
    compartment_ocid,
    compartment_name,
    lifecycle_state,
    created_at
FROM oracle.user_compartments
WHERE user_id = 7;

-- Note: After running this script, the user can try creating a VM again
-- The system will automatically create a new compartment that exists in OCI

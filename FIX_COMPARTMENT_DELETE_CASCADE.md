# Fix: Complete Compartment Deletion with Database Cascade

## Issue
When deleting a compartment via Admin Panel (https://oraclecloud.vn/admin/compartment), the system was only deleting OCI resources (VMs, VCNs, etc.) but **NOT cleaning up related database records**, leaving orphaned data in:
- `user_compartments` table
- `vm_instances` table  
- `vcn_resources` table
- `bandwidth_logs` table
- `vm_actions_log` table
- `subscription_logs` table
- `compartment_accounts` table (NEW - was missing)

## Solution
Updated `oci.service.ts` → `cleanupDatabaseRecords()` method to perform **complete cascade deletion** of all related database records.

## Changes Made

### File: `src/modules/oci/oci.service.ts`

#### Enhanced `cleanupDatabaseRecords()` Method

**Added deletion for:**
1. ✅ **compartment_accounts** - IAM users/accounts within the compartment (was missing before)
2. ✅ Better logging with emoji indicators
3. ✅ Proper cascade order to avoid foreign key violations
4. ✅ Summary report at the end showing what was deleted

**Deletion Order (Cascade):**
```
1. bandwidth_logs (child of vm_instances)
2. vm_actions_log (child of vm_instances)
3. subscription_logs (child of subscriptions)
4. subscriptions.vm_instance_id → NULL (update to remove FK reference)
5. compartment_accounts (child of user_compartments)
6. vm_instances (parent table)
7. vcn_resources (independent)
8. user_compartments (main compartment record)
```

### Before vs After

#### Before:
```typescript
// Only deleted:
- bandwidth_logs
- vm_actions_log  
- subscription_logs
- vm_instances
- vcn_resources
- user_compartments
// Missing: compartment_accounts ❌
// No proper logging ❌
```

#### After:
```typescript
// Deletes ALL related data:
✅ bandwidth_logs
✅ vm_actions_log
✅ subscription_logs  
✅ subscriptions (updated to remove FK)
✅ compartment_accounts (NEW)
✅ vm_instances
✅ vcn_resources
✅ user_compartments
✅ Enhanced logging with emojis
✅ Summary report
```

## Testing

### Test Delete Compartment Flow

1. **Create test compartment with resources:**
   ```bash
   # Via Admin Panel: https://oraclecloud.vn/admin/compartment
   # Create compartment "test-delete-123"
   # Create 2 VMs inside it
   # Create compartment accounts (IAM users)
   ```

2. **Verify data exists in database:**
   ```sql
   -- Check compartment and related data
   SELECT * FROM oracle.user_compartments WHERE compartment_name = 'test-delete-123';
   SELECT * FROM oracle.vm_instances WHERE compartment_id = 'ocid1.compartment...';
   SELECT * FROM oracle.vcn_resources WHERE compartment_id = 'ocid1.compartment...';
   SELECT * FROM oracle.compartment_accounts WHERE compartment_id = (
     SELECT id FROM oracle.user_compartments WHERE compartment_name = 'test-delete-123'
   );
   SELECT * FROM oracle.bandwidth_logs WHERE vm_instance_id IN (
     SELECT id FROM oracle.vm_instances WHERE compartment_id = 'ocid1.compartment...'
   );
   ```

3. **Delete compartment via Admin Panel:**
   ```bash
   # Go to: https://oraclecloud.vn/admin/compartment
   # Click "Delete" button on test-delete-123
   # Wait for deletion to complete (~30-60 seconds)
   ```

4. **Verify all data is deleted:**
   ```sql
   -- Should return 0 rows for all queries
   SELECT COUNT(*) FROM oracle.user_compartments WHERE compartment_name = 'test-delete-123';
   SELECT COUNT(*) FROM oracle.vm_instances WHERE compartment_id = 'ocid1.compartment...';
   SELECT COUNT(*) FROM oracle.vcn_resources WHERE compartment_id = 'ocid1.compartment...';
   SELECT COUNT(*) FROM oracle.compartment_accounts WHERE compartment_id = (
     SELECT id FROM oracle.user_compartments WHERE compartment_name = 'test-delete-123'
   );
   SELECT COUNT(*) FROM oracle.bandwidth_logs WHERE vm_instance_id IN (
     SELECT id FROM oracle.vm_instances WHERE compartment_id = 'ocid1.compartment...'
   );
   ```

5. **Check backend logs:**
   ```bash
   # Should see logs like:
   🗑️  Starting database cleanup for compartment: ocid1.compartment...
   ✅ Deleted 120 bandwidth log records
   ✅ Deleted 45 VM action log records
   ✅ Deleted 8 subscription log records
   ✅ Updated 2 subscription records to remove VM reference
   ✅ Deleted 3 compartment account records
   ✅ Deleted 2 VM instance records
   ✅ Deleted 1 VCN resource records
   ✅ Deleted 1 user compartment records
   ✅ Database cleanup completed successfully
   📊 Cleanup Summary: [shows all counts]
   ```

## Database Schema Reference

### Tables Affected:

```sql
-- Main tables
oracle.user_compartments (compartment_ocid)
  └── oracle.compartment_accounts (compartment_id FK)
  └── oracle.vm_instances (compartment_id)
      ├── oracle.bandwidth_logs (vm_instance_id FK)
      ├── oracle.vm_actions_log (vm_instance_id FK)
      └── oracle.subscriptions (vm_instance_id FK)
          └── oracle.subscription_logs (subscription_id FK)
  └── oracle.vcn_resources (compartment_id)
```

## API Endpoint

```
DELETE /api/oci/compartment/:compartmentName
```

**Authentication:** Admin only (role: 'admin')

**Process:**
1. Terminate all VMs in compartment
2. Delete VCN resources (subnets, IGWs, route tables, VCNs)
3. Delete compartment from OCI
4. **Clean up ALL database records** (NEW - enhanced)

## Benefits

✅ **No orphaned data** - All database records are properly cleaned up  
✅ **No foreign key violations** - Proper cascade order  
✅ **Better observability** - Clear logs showing what was deleted  
✅ **Complete cleanup** - Including IAM accounts that were previously missed  
✅ **Transaction safety** - All-or-nothing with rollback on error  
✅ **Audit trail** - Summary report of all deletions  

## Notes

- **Compartment deletion is irreversible** - All data in OCI and database is permanently deleted
- **Background jobs for Windows VMs** will continue running but won't find the VM records (harmless)
- **Subscriptions are updated** to remove VM references (set to NULL) instead of being deleted
- **Transaction wrapped** - If any deletion fails, all changes are rolled back

## Related Files

- `src/modules/oci/oci.service.ts` - Main service with cleanup logic
- `src/modules/oci/oci.controller.ts` - API endpoint
- `src/entities/compartment-account.entity.ts` - CompartmentAccount entity (newly included)
- `src/entities/user-compartment.entity.ts` - UserCompartment entity
- `src/entities/vm-instance.entity.ts` - VmInstance entity
- `src/entities/vcn-resource.entity.ts` - VcnResource entity

## Date
February 4, 2026

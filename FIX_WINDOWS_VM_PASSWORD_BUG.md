# Fix: Windows VM Password Authentication Bug

## 🐛 Problem Description

**Symptom:** Users cannot login to Windows VMs using the initial password sent via email, even though the password matches the one shown in OCI Console.

**Root Cause:** The backend was sending cloud-init configuration to ALL VMs, including Windows VMs. 

### Technical Details

In `src/modules/oci/oci.service.ts`, the `launchInstance()` function was:
1. Always creating a cloud-init config with SSH keys and system configurations
2. Sending this config as `user_data` to OCI for ALL VMs (both Linux and Windows)
3. The cloud-init config included `ssh_pwauth: false` which disables password authentication

**Why this breaks Windows VMs:**
- Windows Server images on OCI may have **Cloudbase-Init** (Windows equivalent of cloud-init)
- If Cloudbase-Init processes the Linux-style cloud-init config, it may:
  - Disable password authentication
  - Modify user accounts in unexpected ways
  - Interfere with the default Windows Administrator account setup
- This causes the initial password retrieved from OCI to become unusable

## ✅ Solution

Modified multiple files to properly handle Windows VMs:

### 1. Fix cloud-init for Windows VMs
**File:** `src/modules/oci/oci.service.ts`

- **Detect OS type** before creating metadata by checking the image details
- **Only send cloud-init config** (`user_data`) for **Linux VMs**
- **For Windows VMs**, only send `ssh_authorized_keys` without any `user_data`

### 2. Fix email notification logic
**File:** `src/modules/vm-subscription/vm-subscription.service.ts`

- **Removed** incorrect `sendWindowsInstructionsEmail()` function that asked users to access OCI Console
- **Updated logic**: If Windows password is not available immediately, wait for background job to retrieve it
- Users do NOT need to access OCI Console (they don't have permission anyway)

### 3. Implement automatic email sending
**File:** `src/modules/vm-provisioning/vm-provisioning.service.ts`

- **Background job** now automatically sends email with Windows credentials when password is retrieved
- **Added** `sendWindowsPasswordEmail()` method to vm-provisioning service
- **Added** nodemailer transporter and Subscription repository injection
- Email is sent automatically within 5-10 minutes after VM creation

## 🔧 Code Changes Summary

### Change 1: Detect Windows image before preparing metadata
```typescript
// Check if this is a Windows image BEFORE preparing metadata
let isWindowsImage = false;
try {
  const imageDetails = await this.getImage(imageId);
  isWindowsImage = imageDetails?.operatingSystem?.toLowerCase().includes('windows') || false;
} catch (error) {
  // Fallback: check imageId string
  isWindowsImage = imageId.toLowerCase().includes('windows') || imageId.toLowerCase().includes('win-server');
}
```

### Change 2: Only create cloud-init config for Linux
```typescript
// Prepare cloud-init user-data ONLY for Linux VMs
const cloudInitConfig = isWindowsImage ? null : `#cloud-config
users:
  - default
  ...
`;
```

### Change 3: Conditionally add user_data to metadata
```typescript
const metadata: any = {
  ssh_authorized_keys: sshPublicKeys.join('\n'),
};

// Only add user_data for Linux VMs
if (!isWindowsImage && cloudInitConfig) {
  metadata.user_data = Buffer.from(cloudInitConfig).toString('base64');
}
```

### Change 4: Remove incorrect Windows instructions email
```typescript
// OLD (WRONG):
} else {
  await this.sendWindowsInstructionsEmail(...); // ❌ Users can't access OCI!
}

// NEW (CORRECT):
} else {
  // Background job will send email automatically when password is ready
  this.logger.warn('⚠️  Windows password not available yet - will be sent via email when ready');
}
```

### Change 5: Background job sends email automatically
```typescript
if (credentials) {
  vm.windows_initial_password = credentials.password;
  await this.vmInstanceRepo.save(vm);
  
  // Get subscription and user email
  const subscription = await this.subscriptionRepo.findOne({
    where: { id: subscriptionId },
    relations: ['user'],
  });
  
  if (subscription && subscription.user?.email) {
    await this.sendWindowsPasswordEmail(
      subscription.user.email,
      vmInfo,
      credentials,
      subscription,
    );
  }
}
```

## 🧪 Testing Steps

### 1. Test Windows VM Creation
1. Create a new Windows VM through the frontend
2. Wait for the VM to provision (2-5 minutes)
3. You should receive **2 emails**:
   - **First email**: Confirmation that VM is being created (generic message)
   - **Second email**: Windows credentials (arrives 5-10 minutes later)
4. Use Remote Desktop Connection (RDP) to connect:
   - Host: `<public_ip>` (from email)
   - Username: `opc` (from email)
   - Password: `<initial_password_from_email>`
5. **Expected Result:** Login should succeed with the initial password

### 2. Test Linux VM Creation (Regression Test)
1. Create a new Linux VM (Ubuntu/Oracle Linux/CentOS)
2. Wait for the VM to provision and receive SSH key via email
3. SSH into the VM using the private key
4. Test sudo access: `sudo ls /root`
5. **Expected Result:** SSH login works, sudo works without password, firewall ports are open

### 3. Check Logs
Look for these log messages when creating Windows VM:
```
🔍 Image OS detected: Windows Server [version] (isWindows: true)
🪟 Windows VM: Sending SSH keys ONLY (no cloud-init to avoid interfering with password auth)
⚠️  Windows password not available yet - will be sent via email when ready
🔄 [Background] Starting Windows password retrieval...
🎉 [Background] Windows credentials retrieved successfully
📧 [Background] Sending Windows credentials email...
✅ [Background] Windows credentials email sent successfully
```

For Linux VM:
```
🔍 Image OS detected: Oracle Linux [version] (isWindows: false)
🐧 Linux VM: Sending SSH keys + cloud-init config
```

## 📝 Additional Notes

### Email Workflow for Windows VMs
1. **Immediate**: User receives confirmation that VM is being created
2. **5-10 minutes later**: Background job retrieves password from OCI
3. **Automatic**: Email with credentials is sent to user
4. **User action**: Use RDP to connect with provided credentials

### Why Background Job is Necessary
- Windows initial password is not immediately available after VM creation
- OCI needs time to generate and make the password available via API
- Background job polls until password is ready, then sends email
- This prevents frontend timeout and provides better user experience

### Security Considerations
- Initial password is sent via email (same security model as SSH private keys for Linux)
- Users are instructed to change password immediately after first login
- Password is also stored encrypted in database for emergency recovery

## 🚀 Deployment Checklist
- [x] Code changes implemented in oci.service.ts
- [x] Code changes implemented in vm-subscription.service.ts  
- [x] Code changes implemented in vm-provisioning.service.ts
- [x] Removed incorrect sendWindowsInstructionsEmail function
- [x] Added automatic email sending in background job
- [ ] Backend rebuilt: `npm run build`
- [ ] Backend restarted
- [ ] Windows VM created and tested with password login
- [ ] Linux VM created and tested (regression)
- [ ] Logs reviewed for correct OS detection
- [ ] Both email notifications verified

## 📌 Prevention
To prevent similar issues in the future:
- Always check OS type before applying OS-specific configurations
- Test with both Linux and Windows VMs after making changes to VM provisioning logic
- Keep cloud-init configs separate for different OS types
- Never assume users have access to OCI Console - they only have access to your platform
- Document any OS-specific behavior clearly
- Implement proper background jobs for operations that take time (like password retrieval)

## ✅ Files Modified
1. `src/modules/oci/oci.service.ts` - Fixed cloud-init sending logic
2. `src/modules/vm-subscription/vm-subscription.service.ts` - Fixed email notification logic
3. `src/modules/vm-provisioning/vm-provisioning.service.ts` - Added automatic email sending


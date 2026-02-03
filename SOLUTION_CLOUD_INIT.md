# Giải Pháp: Thêm Cloud-Init Để Sudo Hoạt Động

## Vấn Đề
VM được tạo ra nhưng user `opc` không thể dùng sudo vì thiếu cấu hình cloud-init.

## Giải Pháp: Update Backend Code

### File cần sửa: `src/modules/oci/oci.service.ts`

Tìm phần metadata trong hàm `launchInstance` (khoảng dòng 810-814):

**Code CŨ:**
```typescript
// Prepare metadata with SSH keys
const metadata = {
  ssh_authorized_keys: sshPublicKeys.join('\n'),
};
```

**Code MỚI:**
```typescript
// Prepare cloud-init user-data for proper sudo configuration
const cloudInitConfig = `#cloud-config
users:
  - default
  - name: opc
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

# Ensure SSH service is enabled
ssh_pwauth: false
disable_root: false

# Package updates and installations can be added here if needed
packages:
  - vim
  - curl
  - wget
  - git

# Run commands on first boot
runcmd:
  - echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
  - chmod 0440 /etc/sudoers.d/90-cloud-init-users
  - systemctl restart sshd
`;

// Prepare metadata with SSH keys AND cloud-init config
const metadata = {
  ssh_authorized_keys: sshPublicKeys.join('\n'),
  user_data: Buffer.from(cloudInitConfig).toString('base64'), // Base64 encode cloud-init
};
```

### Chi Tiết Thay Đổi

#### 1. Cloud-Init Config Giải Thích

```yaml
#cloud-config
users:
  - default                    # Giữ nguyên default user từ image
  - name: opc                  # Tạo/configure user opc
    sudo: ['ALL=(ALL) NOPASSWD:ALL']  # Cho phép sudo không cần password
    shell: /bin/bash           # Set bash shell
    ssh_authorized_keys:       # Thêm SSH keys
      - ssh-rsa AAAA...        # User key
      - ssh-rsa BBBB...        # Admin key

ssh_pwauth: false              # Disable password SSH (chỉ dùng key)
disable_root: false            # Cho phép root (nếu cần)

packages:                      # Cài các package cơ bản
  - vim
  - curl
  - wget
  - git

runcmd:                        # Chạy lệnh khi boot lần đầu
  - echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
  - chmod 0440 /etc/sudoers.d/90-cloud-init-users
  - systemctl restart sshd
```

#### 2. Tại Sao Cần Base64 Encode?

Oracle Cloud yêu cầu `user_data` phải được base64 encode khi gửi qua API.

```typescript
user_data: Buffer.from(cloudInitConfig).toString('base64')
```

#### 3. Cách Cloud-Init Hoạt Động

1. **First Boot**: Instance boot lần đầu
2. **Cloud-Init Runs**: Đọc user_data từ metadata
3. **Decode**: Decode base64 về YAML config
4. **Execute**: Chạy các tasks:
   - Tạo/update users
   - Set SSH keys
   - Cài packages
   - Chạy runcmd scripts
5. **Complete**: User `opc` có thể sudo ngay

### Code Hoàn Chỉnh

```typescript
async launchInstance(
  compartmentId: string,
  displayName: string,
  availabilityDomain: string,
  subnetId: string,
  imageId: string,
  shape: string,
  sshPublicKeys: string[],
  ocpus?: number,
  memoryInGBs?: number,
  bootVolumeSizeInGBs?: number,
) {
  try {
    // Prepare shape config for flexible shapes
    const shapeConfig = shape.includes('Flex') ? {
      ocpus: ocpus || 1,
      memoryInGBs: memoryInGBs || 16,
    } : undefined;

    // Prepare source details
    const sourceDetails: oci.core.models.InstanceSourceViaImageDetails = {
      sourceType: 'image',
      imageId: imageId,
      bootVolumeSizeInGBs: bootVolumeSizeInGBs || 50,
    };

    // ========== START: CLOUD-INIT CONFIG ==========
    // Prepare cloud-init user-data for proper sudo configuration
    const cloudInitConfig = `#cloud-config
users:
  - default
  - name: opc
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

# Ubuntu default user (if Ubuntu image)
  - name: ubuntu
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

# Security settings
ssh_pwauth: false
disable_root: false

# Essential packages
packages:
  - vim
  - curl
  - wget
  - git
  - net-tools

# First boot commands
runcmd:
  - echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
  - echo "ubuntu ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/90-cloud-init-users
  - chmod 0440 /etc/sudoers.d/90-cloud-init-users
  - systemctl restart sshd
`;

    // Prepare metadata with SSH keys AND cloud-init config
    const metadata = {
      ssh_authorized_keys: sshPublicKeys.join('\n'),
      user_data: Buffer.from(cloudInitConfig).toString('base64'),
    };
    // ========== END: CLOUD-INIT CONFIG ==========

    this.logger.log(`🔑 Preparing to launch instance with ${sshPublicKeys.length} SSH keys`);
    this.logger.log(`📝 Metadata ssh_authorized_keys length: ${metadata.ssh_authorized_keys.length} chars`);
    this.logger.log(`📝 Cloud-init user_data length: ${metadata.user_data.length} chars (base64)`);
    this.logger.log(`📝 Full SSH keys being sent to OCI:`);
    this.logger.log(metadata.ssh_authorized_keys);

    const launchInstanceDetails: oci.core.models.LaunchInstanceDetails = {
      compartmentId: compartmentId,
      displayName: displayName,
      availabilityDomain: availabilityDomain,
      shape: shape,
      shapeConfig: shapeConfig,
      sourceDetails: sourceDetails,
      createVnicDetails: {
        subnetId: subnetId,
        assignPublicIp: true,
      },
      metadata: metadata,  // ← Đã có cả ssh_authorized_keys và user_data
    };

    const request: oci.core.requests.LaunchInstanceRequest = {
      launchInstanceDetails: launchInstanceDetails,
    };

    const response = await this.computeClient.launchInstance(request);
    
    this.logger.log(`✅ Launched instance with cloud-init: ${response.instance.id}`);
    return {
      id: response.instance.id,
      displayName: response.instance.displayName,
      availabilityDomain: response.instance.availabilityDomain,
      compartmentId: response.instance.compartmentId,
      shape: response.instance.shape,
      lifecycleState: response.instance.lifecycleState,
      timeCreated: response.instance.timeCreated,
      imageId: response.instance.imageId,
    };
  } catch (error) {
    this.logger.error('Error launching instance:', error);
    throw error;
  }
}
```

## Testing

### Bước 1: Apply Code Changes
```bash
cd oracle-ics-backend
# Code đã được update trong oci.service.ts
```

### Bước 2: Rebuild và Deploy
```bash
npm run build
pm2 restart oracle-ics-backend
```

### Bước 3: Tạo VM Mới Từ Frontend
Tạo VM test để verify cloud-init hoạt động

### Bước 4: Verify
```bash
# SSH vào VM mới
ssh -i user-key.pem opc@<vm-ip>

# Test sudo (phải work ngay không cần password)
sudo whoami
# Output: root

# Check cloud-init logs
sudo cat /var/log/cloud-init.log
sudo cat /var/log/cloud-init-output.log

# Check sudoers file
cat /etc/sudoers.d/90-cloud-init-users
# Output: opc ALL=(ALL) NOPASSWD: ALL

# Test cài nginx
sudo yum install -y nginx
# Hoặc
sudo apt install -y nginx
```

## Notes

1. **Chỉ áp dụng cho VM MỚI**: VM đã tạo cần fix thủ công (xem FIX_SUDO_INSTRUCTIONS.md)

2. **Cloud-Init chạy 1 lần**: Chỉ chạy khi first boot, không chạy lại khi reboot

3. **Multiple OS Support**: Config hỗ trợ cả Oracle Linux (opc) và Ubuntu (ubuntu)

4. **Base64 Encoding**: PHẢI encode base64, nếu không OCI sẽ reject

5. **YAML Syntax**: Phải đúng format YAML (indentation quan trọng)

## Troubleshooting

### VM vẫn không sudo được sau khi áp dụng
```bash
# 1. Check cloud-init status
cloud-init status

# 2. Check cloud-init logs for errors
sudo cat /var/log/cloud-init.log | grep -i error

# 3. Manually run cloud-init again (NOT recommended, only for debug)
sudo cloud-init clean
sudo cloud-init init
```

### Cloud-init không chạy
```bash
# Verify user_data trong instance metadata
curl http://169.254.169.254/opc/v1/instance/metadata/
```

## Best Practices

1. **Always test** VM creation sau khi update code
2. **Keep logs**: Monitor cloud-init logs trong quá trình testing
3. **Version control**: Commit code changes với clear message
4. **Document**: Update API docs về cloud-init config
5. **Backup**: Backup system SSH keys trước khi deploy


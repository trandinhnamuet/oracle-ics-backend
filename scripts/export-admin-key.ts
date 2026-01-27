import { DataSource } from 'typeorm';
import { SystemSshKey } from '../src/entities/system-ssh-key.entity';
import { decryptPrivateKey } from '../src/utils/system-ssh-key.util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Script to export decrypted admin SSH key to a file for manual testing
 * Usage: npx ts-node -r tsconfig-paths/register scripts/export-admin-key.ts
 */

async function exportAdminKey() {
  // Import AppDataSource from data-source.ts
  const { AppDataSource } = await import('../src/data-source');

  try {
    console.log('🔌 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Database connected');

    // Get admin SSH key
    const systemSshKeyRepo = AppDataSource.getRepository(SystemSshKey);
    const adminKey = await systemSshKeyRepo.findOne({
      where: { key_name: 'default-admin-key', is_active: true },
    });

    if (!adminKey) {
      console.error('❌ No active admin SSH key found in database');
      process.exit(1);
    }

    console.log('✅ Admin key found in database');
    console.log(`   Key name: ${adminKey.key_name}`);
    console.log(`   Key type: ${adminKey.key_type}`);
    console.log(`   Algorithm: ${adminKey.algorithm}`);
    console.log(`   Key size: ${adminKey.key_size}`);
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);

    // Decrypt private key
    console.log('\n🔓 Decrypting admin private key...');
    let privateKey = decryptPrivateKey(adminKey.private_key_encrypted);

    // Check key format
    console.log(`   Original format: ${privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : privateKey.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 'Unknown'}`);

    // Convert PKCS#8 to PKCS#1 if needed (for ssh2 compatibility)
    if (privateKey.includes('BEGIN PRIVATE KEY')) {
      console.log('🔄 Converting PKCS#8 to PKCS#1 format...');
      try {
        const keyObject = crypto.createPrivateKey(privateKey);
        privateKey = keyObject.export({
          type: 'pkcs1',
          format: 'pem',
        }).toString();
        console.log('✅ Key converted to PKCS#1 (RSA PRIVATE KEY)');
      } catch (convertError) {
        console.warn(`⚠️  Key conversion failed: ${convertError.message}`);
      }
    }

    // Ensure newline at end
    if (!privateKey.endsWith('\n')) {
      privateKey += '\n';
    }

    console.log(`   Final format: ${privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : 'PKCS#8'}`);
    console.log(`   Key length: ${privateKey.length} bytes`);
    console.log(`   Key starts with: ${privateKey.substring(0, 50)}...`);

    // Save to file
    const outputDir = path.join(__dirname, '..', 'secrets', 'ssh-keys');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'admin-key-exported.pem');
    fs.writeFileSync(outputPath, privateKey, { mode: 0o600 });

    console.log(`\n✅ Admin private key exported successfully!`);
    console.log(`   File: ${outputPath}`);
    console.log(`   Permissions: 600 (read/write for owner only)`);

    // Save public key too
    const publicKeyPath = path.join(outputDir, 'admin-key-exported.pub');
    fs.writeFileSync(publicKeyPath, adminKey.public_key);
    console.log(`   Public key: ${publicKeyPath}`);

    console.log(`\n📝 To test SSH connection manually:`);
    console.log(`   Windows (PowerShell):`);
    console.log(`     ssh -i "${outputPath}" ubuntu@<VM_PUBLIC_IP>`);
    console.log(`   `);
    console.log(`   Linux/Mac:`);
    console.log(`     chmod 600 "${outputPath}"`);
    console.log(`     ssh -i "${outputPath}" ubuntu@<VM_PUBLIC_IP>`);
    console.log(`   `);
    console.log(`   If connection fails, check:`);
    console.log(`     1. VM has public IP and is running`);
    console.log(`     2. Port 22 is open in security list`);
    console.log(`     3. Admin key was added during VM provisioning`);
    console.log(`     4. Username is correct (ubuntu/opc/centos)`);

    await AppDataSource.destroy();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
}

// Run the script
exportAdminKey();

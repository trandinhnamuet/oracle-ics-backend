import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSshKey } from '../../entities/system-ssh-key.entity';
import {
  generateSSHKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
  saveKeyPairToFile,
  loadKeyPairFromFile,
  SSHKeyPair,
} from '../../utils/system-ssh-key.util';

/**
 * Service for managing system-level SSH keys
 * Handles initialization, retrieval, and rotation of admin keys
 */
@Injectable()
export class SystemSshKeyService implements OnModuleInit {
  private readonly logger = new Logger(SystemSshKeyService.name);
  private cachedAdminKey: SSHKeyPair | null = null;

  constructor(
    @InjectRepository(SystemSshKey)
    private systemSshKeyRepository: Repository<SystemSshKey>,
  ) {}

  /**
   * Initialize admin SSH key on module startup
   */
  async onModuleInit() {
    try {
      await this.ensureAdminKeyExists();
      this.logger.log('✅ System SSH key initialization complete');
    } catch (error) {
      this.logger.error('❌ Failed to initialize system SSH key:', error);
    }
  }

  /**
   * Ensure admin SSH key exists in database
   * If not, generate new key pair
   */
  async ensureAdminKeyExists(): Promise<void> {
    // Find key regardless of is_active status to avoid duplicate key errors
    let adminKey = await this.systemSshKeyRepository.findOne({
      where: { key_name: 'default-admin-key' },
      order: { created_at: 'DESC' }, // Get the most recent one
    });

    // Check if placeholder exists and needs to be replaced
    if (adminKey && adminKey.public_key === 'TO_BE_GENERATED') {
      this.logger.log('🔑 Generating admin SSH key pair...');

      // Try to load from file first (if exists from previous setup)
      let keyPair = loadKeyPairFromFile('admin');

      // If not in file, generate new
      if (!keyPair) {
        keyPair = generateSSHKeyPair(4096);
        
        // Save to file system as backup
        saveKeyPairToFile(keyPair, 'admin');
      }

      // Encrypt private key before storing
      const encryptedPrivateKey = encryptPrivateKey(keyPair.privateKey);

      // Update database record
      adminKey.public_key = keyPair.publicKey;
      adminKey.private_key_encrypted = encryptedPrivateKey;
      adminKey.fingerprint = keyPair.fingerprint;
      adminKey.algorithm = 'RSA';
      adminKey.key_size = 4096;
      adminKey.updated_at = new Date();

      await this.systemSshKeyRepository.save(adminKey);

      this.logger.log('✅ Admin SSH key generated and saved');
      this.logger.log(`   Fingerprint: ${keyPair.fingerprint}`);
      
      // Mark it as active
      adminKey.is_active = true;
      await this.systemSshKeyRepository.save(adminKey);
    } else if (!adminKey) {
      // No admin key exists at all, create new
      this.logger.log('🔑 Creating new admin SSH key...');

      // Try to load from file first
      let keyPair = loadKeyPairFromFile('admin');
      
      // If not in file, generate new
      if (!keyPair) {
        keyPair = generateSSHKeyPair(4096);
        saveKeyPairToFile(keyPair, 'admin');
      }

      const encryptedPrivateKey = encryptPrivateKey(keyPair.privateKey);

      try {
        adminKey = this.systemSshKeyRepository.create({
          key_name: 'default-admin-key',
          key_type: 'admin',
          public_key: keyPair.publicKey,
          private_key_encrypted: encryptedPrivateKey,
          fingerprint: keyPair.fingerprint,
          algorithm: 'RSA',
          key_size: 4096,
          is_active: true,
          description: 'Default admin SSH key for web terminal access',
        });

        await this.systemSshKeyRepository.save(adminKey);

        this.logger.log('✅ Admin SSH key created');
        this.logger.log(`   Fingerprint: ${keyPair.fingerprint}`);
      } catch (error) {
        // If duplicate key error, fetch the existing key instead
        if (error.code === '23505') {
          this.logger.warn('⚠️  Key already exists in database, fetching existing key...');
          adminKey = await this.systemSshKeyRepository.findOne({
            where: { key_name: 'default-admin-key' },
            order: { created_at: 'DESC' },
          });
        } else {
          throw error;
        }
      }
    } else {
      // Key already exists and is valid
      this.logger.log('✅ Admin SSH key already exists');
      this.logger.log(`   Fingerprint: ${adminKey.fingerprint}`);
      
      // Ensure it's marked as active
      if (!adminKey.is_active) {
        adminKey.is_active = true;
        await this.systemSshKeyRepository.save(adminKey);
        this.logger.log('   Marked key as active');
      }
    }

    // Ensure adminKey is not null before proceeding
    if (!adminKey) {
      this.logger.error('❌ Failed to ensure admin key exists');
      return;
    }

    // Cache the key for quick access
    try {
      const decryptedPrivateKey = decryptPrivateKey(adminKey.private_key_encrypted);
      this.cachedAdminKey = {
        publicKey: adminKey.public_key,
        privateKey: decryptedPrivateKey,
        fingerprint: adminKey.fingerprint,
      };
    } catch (decryptError) {
      this.logger.warn('⚠️  Failed to decrypt existing admin key, will try to load from file or use existing key');
      
      // Try to load from file first
      const keyPairFromFile = loadKeyPairFromFile('admin');
      
      if (keyPairFromFile) {
        // Use key from file system
        this.cachedAdminKey = keyPairFromFile;
        this.logger.log('✅ Loaded admin SSH key from file system');
      } else {
        // If file doesn't exist, log warning but don't crash
        this.logger.warn('⚠️  Could not decrypt admin key and file backup not found. Please regenerate keys manually if needed.');
        this.cachedAdminKey = null;
      }
    }
  }

  /**
   * Get active admin SSH key
   */
  async getAdminKey(): Promise<SSHKeyPair> {
    if (this.cachedAdminKey) {
      return this.cachedAdminKey;
    }

    const adminKey = await this.systemSshKeyRepository.findOne({
      where: { key_name: 'default-admin-key', is_active: true },
    });

    if (!adminKey) {
      throw new Error('Admin SSH key not found');
    }

    this.cachedAdminKey = {
      publicKey: adminKey.public_key,
      privateKey: decryptPrivateKey(adminKey.private_key_encrypted),
      fingerprint: adminKey.fingerprint,
    };

    return this.cachedAdminKey;
  }

  /**
   * Get admin public key only (for VM provisioning)
   */
  async getAdminPublicKey(): Promise<string> {
    const adminKey = await this.getAdminKey();
    return adminKey.publicKey;
  }

  /**
   * Get admin private key (for SSH connections - use with caution!)
   */
  async getAdminPrivateKey(): Promise<string> {
    const adminKey = await this.getAdminKey();
    return adminKey.privateKey;
  }

  /**
   * Increment usage count when key is used for a new VM
   */
  async incrementUsageCount(keyId: number): Promise<void> {
    await this.systemSshKeyRepository.increment(
      { id: keyId },
      'usage_count',
      1
    );

    await this.systemSshKeyRepository.update(
      { id: keyId },
      { last_used_at: new Date() }
    );
  }

  /**
   * Rotate admin key (generate new key and deactivate old)
   */
  async rotateAdminKey(): Promise<SSHKeyPair> {
    this.logger.log('🔄 Rotating admin SSH key...');

    // Generate new key
    const newKeyPair = generateSSHKeyPair(4096);
    saveKeyPairToFile(newKeyPair, `admin-${Date.now()}`);

    const encryptedPrivateKey = encryptPrivateKey(newKeyPair.privateKey);

    // Deactivate old key
    await this.systemSshKeyRepository.update(
      { key_name: 'default-admin-key' },
      { is_active: false }
    );

    // Create new active key
    const newAdminKey = this.systemSshKeyRepository.create({
      key_name: 'default-admin-key',
      key_type: 'admin',
      public_key: newKeyPair.publicKey,
      private_key_encrypted: encryptedPrivateKey,
      fingerprint: newKeyPair.fingerprint,
      algorithm: 'RSA',
      key_size: 4096,
      is_active: true,
      description: 'Rotated admin SSH key',
    });

    await this.systemSshKeyRepository.save(newAdminKey);

    // Update cache
    this.cachedAdminKey = newKeyPair;

    this.logger.log('✅ Admin SSH key rotated successfully');
    this.logger.log(`   New fingerprint: ${newKeyPair.fingerprint}`);

    return newKeyPair;
  }

  /**
   * Get system SSH key by ID
   */
  async getSystemKeyById(keyId: number): Promise<SystemSshKey> {
    const key = await this.systemSshKeyRepository.findOne({
      where: { id: keyId },
    });

    if (!key) {
      throw new Error('System SSH key not found');
    }

    return key;
  }

  /**
   * Get active system SSH key entity (for VM provisioning)
   * Returns the database entity with id, publicKey, etc.
   */
  async getActiveKey(): Promise<SystemSshKey | null> {
    const adminKey = await this.systemSshKeyRepository.findOne({
      where: { key_name: 'default-admin-key', is_active: true },
    });

    return adminKey;
  }
}

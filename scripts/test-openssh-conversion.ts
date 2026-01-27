import * as crypto from 'crypto';

/**
 * Test OpenSSH format conversion
 */
function convertToOpenSSHFormat(pemPublicKey: string): string {
  // Parse PEM key using Node.js crypto
  const keyObject = crypto.createPublicKey(pemPublicKey);
  
  // Export as JWK to get modulus (n) and exponent (e)
  const jwk: any = keyObject.export({ format: 'jwk' });
  
  // Convert base64url to base64
  const n = Buffer.from(jwk.n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const e = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  // Build SSH wire format:
  // SSH format: string "ssh-rsa" + mpint e + mpint n
  // Each component: 4-byte length (big-endian) + data
  const buffers: Buffer[] = [];
  
  // 1. Algorithm name "ssh-rsa"
  const algorithm = Buffer.from('ssh-rsa');
  const algLength = Buffer.alloc(4);
  algLength.writeUInt32BE(algorithm.length, 0);
  buffers.push(algLength, algorithm);
  
  // 2. Exponent (e) - add 0x00 padding if high bit is set (two's complement)
  const ePadded = (e[0] & 0x80) ? Buffer.concat([Buffer.from([0]), e]) : e;
  const eLength = Buffer.alloc(4);
  eLength.writeUInt32BE(ePadded.length, 0);
  buffers.push(eLength, ePadded);
  
  // 3. Modulus (n) - add 0x00 padding if high bit is set
  const nPadded = (n[0] & 0x80) ? Buffer.concat([Buffer.from([0]), n]) : n;
  const nLength = Buffer.alloc(4);
  nLength.writeUInt32BE(nPadded.length, 0);
  buffers.push(nLength, nPadded);
  
  // Concatenate all parts and base64 encode
  const wireFormat = Buffer.concat(buffers);
  const base64Key = wireFormat.toString('base64');
  
  return `ssh-rsa ${base64Key} system@oraclecloud.vn`;
}

async function test() {
  console.log('🧪 Testing OpenSSH format conversion...\n');
  
  // Generate a test key pair
  console.log('1️⃣ Generating test RSA key pair...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  
  console.log('   ✅ Generated\n');
  
  // Convert to OpenSSH format
  console.log('2️⃣ Converting to OpenSSH format...');
  const opensshKey = convertToOpenSSHFormat(publicKey);
  console.log(`   Result: ${opensshKey.substring(0, 100)}...\n`);
  
  // Save to file
  const fs = require('fs');
  const testFile = 'secrets/ssh-keys/test-converted.pub';
  fs.writeFileSync(testFile, opensshKey, 'utf8');
  console.log(`3️⃣ Saved to: ${testFile}\n`);
  
  // Validate with ssh-keygen
  console.log('4️⃣ Validating with ssh-keygen...');
  const { execSync } = require('child_process');
  try {
    const result = execSync(`ssh-keygen -lf "${testFile}"`, { encoding: 'utf8' });
    console.log(`   ✅ Valid OpenSSH key!\n   ${result.trim()}\n`);
  } catch (error: any) {
    console.error(`   ❌ Validation failed: ${error.message}\n`);
    process.exit(1);
  }
  
  // Clean up
  fs.unlinkSync(testFile);
  console.log('✅ Test passed! Conversion function works correctly.');
}

test();

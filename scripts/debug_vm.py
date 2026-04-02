"""
Debug script: decrypt admin key, test SSH/WinRM directly to Windows VM
"""
import paramiko
import sys

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"

# Corrected Node.js decrypt script using proper env setup
NODE_DECRYPT = r"""
const crypto = require('crypto');
const { execSync } = require('child_process');

// Read from the .env file manually
const fs = require('fs');
const envContent = fs.readFileSync('/home/icsadmin/web/oracle/oracle-ics-backend/.env', 'utf8');
const envMap = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) envMap[m[1].trim()] = m[2].trim();
});

const ENC_KEY = envMap['SSH_KEY_ENCRYPTION_SECRET'];
const DB_PASS = envMap['DB_PASSWORD'];
const DB_USER = envMap['DB_USERNAME'] || 'live';
const DB_NAME = envMap['DB_NAME'] || 'ics';

console.log('ENC_KEY:', ENC_KEY ? ENC_KEY.substring(0,20)+'...' : 'NOT FOUND');

// Get encrypted key from DB using psql
const row = execSync(
  `PGPASSWORD=${DB_PASS} psql -U ${DB_USER} -h localhost -d ${DB_NAME} -t -A -c "SELECT private_key_encrypted FROM oracle.system_ssh_keys WHERE id=6"`
).toString().trim();

console.log('Got encrypted key, length:', row.length);

const [iv, ct] = row.split(':');
const key = crypto.scryptSync(ENC_KEY, 'salt', 32);
const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
const decrypted = d.update(ct, 'hex', 'utf8') + d.final('utf8');
console.log('Decrypted key type:', decrypted.includes('BEGIN RSA') ? 'PKCS1' : decrypted.includes('BEGIN PRIVATE') ? 'PKCS8' : 'UNKNOWN');
console.log('Key length:', decrypted.length);
fs.writeFileSync('/tmp/admin_key.pem', decrypted, { mode: 0o600 });
console.log('SAVED');
"""

# SSH test Python script
SSH_TEST = """
import subprocess, sys

ip = sys.argv[1]

print("=== Test port 3389 (RDP - baseline) ===")
r = subprocess.run(['nc', '-zv', '-w', '5', ip, '3389'], capture_output=True, text=True)
print("RDP:", r.stderr.strip(), "rc:", r.returncode)

print("\\n=== Try SSH with admin key ===")
r = subprocess.run([
    'ssh', '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=5',
    '-o', 'BatchMode=yes',
    '-i', '/tmp/admin_key.pem',
    'opc@' + ip,
    'whoami && net user opc && echo SSH_SUCCESS'
], capture_output=True, text=True, timeout=25)
print("SSH stdout:", r.stdout[:500])
print("SSH stderr:", r.stderr[:500])
print("SSH rc:", r.returncode)

print("\\n=== Check authorized_keys on VM via SSH verbose ===")
r = subprocess.run([
    'ssh', '-vvv',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
    '-o', 'BatchMode=yes',
    '-i', '/tmp/admin_key.pem',
    'opc@' + ip,
    'echo CONNECTED'
], capture_output=True, text=True, timeout=25)
print("SSH verbose stderr (last 30 lines):")
lines = r.stderr.split('\\n')
print('\\n'.join(lines[-30:]))
"""

def run_on_server(cmd, timeout=60):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode(); e = err.read().decode()
    c.close()
    return o, e

def upload(remote_path, content):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = c.open_sftp()
    with sftp.open(remote_path, 'w') as f:
        f.write(content)
    sftp.chmod(remote_path, 0o755)
    sftp.close()
    c.close()

vm_ip = sys.argv[1] if len(sys.argv) > 1 else "158.101.156.2"
print(f"Testing VM: {vm_ip}")

print("\n=== Step 1: Decrypt admin key ===")
upload('/tmp/decrypt_key.js', NODE_DECRYPT)
out, err = run_on_server('node /tmp/decrypt_key.js 2>&1', timeout=30)
print(out); 
if err: print("ERR:", err)

print("\n=== Step 2: Test SSH from server to Windows VM ===")
upload('/tmp/test_ssh.py', SSH_TEST)
out, err = run_on_server(f'python3 /tmp/test_ssh.py {vm_ip} 2>&1', timeout=60)
print(out)
if err: print("ERR:", err)


HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"

# Node.js script to write to server
NODE_SCRIPT = r"""
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

const pool = new Pool({user:'live',host:'localhost',database:'ics',password:'ics',port:5432});

async function main() {
  const r = await pool.query('SELECT private_key_encrypted FROM oracle.system_ssh_keys WHERE id=6');
  const enc = r.rows[0].private_key_encrypted;
  const [iv, ct] = enc.split(':');
  
  // Try common encryption keys used in the codebase
  const possibleKeys = [
    process.env.SSH_KEY_ENCRYPTION_KEY,
    'ssh-key-enc-secret-42jfwj2k',
    'ssh-encryption-key',
  ].filter(Boolean);

  let decrypted = null;
  for (const k of possibleKeys) {
    try {
      const key = crypto.scryptSync(k, 'salt', 32);
      const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
      decrypted = d.update(ct, 'hex', 'utf8') + d.final('utf8');
      console.log('Decrypted with key: ' + k.substring(0,20) + '...');
      break;
    } catch(e) {}
  }

  if (!decrypted) {
    console.error('DECRYPTION_FAILED');
    process.exit(1);
  }

  fs.writeFileSync('/tmp/admin_key.pem', decrypted, { mode: 0o600 });
  console.log('SAVED:/tmp/admin_key.pem');
  console.log('KEY_TYPE:' + (decrypted.includes('BEGIN RSA') ? 'PKCS1' : 
               decrypted.includes('BEGIN PRIVATE') ? 'PKCS8' : 'UNKNOWN'));
  await pool.end();
}
main().catch(e => { console.error('ERROR:'+e.message); process.exit(1); });
"""

SSH_TEST_SCRIPT = r"""
#!/usr/bin/env python3
import subprocess, sys, os

ip = sys.argv[1]
key_file = '/tmp/admin_key.pem'

# Test 1: nc check port 22
print("=== Port 22 check ===")
r = subprocess.run(['nc', '-zv', '-w', '5', ip, '22'], capture_output=True, text=True, timeout=10)
print("stdout:", r.stdout)
print("stderr:", r.stderr)
print("returncode:", r.returncode)

# Test 2: SSH connect with admin key - short timeout for banner
print("\n=== SSH banner test ===")
r = subprocess.run([
    'ssh', '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=10',
    '-o', 'BatchMode=yes',
    '-o', 'PasswordAuthentication=no',
    '-i', key_file,
    f'opc@{ip}',
    'whoami; net user opc; echo SSHOK'
], capture_output=True, text=True, timeout=30)
print("stdout:", r.stdout)
print("stderr:", r.stderr)
print("returncode:", r.returncode)

# Test 3: WinRM port 5985
print("\n=== Port 5985 check ===")
r = subprocess.run(['nc', '-zv', '-w', '5', ip, '5985'], capture_output=True, text=True, timeout=10)
print("stderr:", r.stderr, "returncode:", r.returncode)

# Test 4: WinRM port 5986
print("\n=== Port 5986 check ===")
r = subprocess.run(['nc', '-zv', '-w', '5', ip, '5986'], capture_output=True, text=True, timeout=10)
print("stderr:", r.stderr, "returncode:", r.returncode)
"""

def run_on_server(cmd, timeout=60):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    client.close()
    return out, err

def upload_and_run(filename, content, run_cmd, timeout=60):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    with sftp.open(filename, 'w') as f:
        f.write(content)
    sftp.chmod(filename, 0o755)
    sftp.close()

    stdin, stdout, stderr = client.exec_command(run_cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    client.close()
    return out, err

def main():
    vm_ip = "158.101.156.2"  # VM 35
    
    print("=== Step 1: Upload and run Node.js key decryptor ===")
    out, err = upload_and_run('/tmp/get_key.js', NODE_SCRIPT, 
                               'cd ~/web/oracle/oracle-ics-backend && node /tmp/get_key.js 2>&1')
    print("OUT:", out)
    print("ERR:", err)

    if 'DECRYPTION_FAILED' in out or 'ERROR:' in out:
        print("Key decryption failed, trying env var approach...")
        out, err = run_on_server(
            'cd ~/web/oracle/oracle-ics-backend && '
            'SSH_KEY_ENCRYPTION_KEY=$(grep -o "SSH_KEY_ENCRYPTION_KEY=.*" .env 2>/dev/null | cut -d= -f2 | tr -d \'"\') '
            'node /tmp/get_key.js 2>&1'
        )
        print("OUT:", out)

    print("\n=== Step 2: Check env for encryption key ===")
    out, err = run_on_server(
        'grep -i "SSH_KEY_ENC\\|ENCRYPTION\\|ENCRYPT" ~/web/oracle/oracle-ics-backend/.env 2>/dev/null | head -5'
    )
    print("OUT:", out)

    print("\n=== Step 3: Upload and run SSH test ===")
    out, err = upload_and_run('/tmp/test_vm.py', SSH_TEST_SCRIPT,
                               f'python3 /tmp/test_vm.py {vm_ip} 2>&1', timeout=60)
    print("OUT:", out)
    print("ERR:", err)

    print("\n=== Step 4: Check Windows Firewall via WinRM ===")
    out, err = run_on_server('nc -zv -w 5 {} 5985 2>&1; nc -zv -w 5 {} 3389 2>&1'.format(vm_ip, vm_ip), timeout=20)
    print("OUT:", out)

if __name__ == '__main__':
    main()

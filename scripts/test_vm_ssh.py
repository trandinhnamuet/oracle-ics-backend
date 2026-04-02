"""
Test SSH connection to Windows VM from production server
"""
import paramiko, sys

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"
VM_IP = sys.argv[1] if len(sys.argv) > 1 else "158.101.156.2"

def run(cmd, timeout=60):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode(); e = err.read().decode()
    c.close()
    return o, e

def upload(remote_path, local_path):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = c.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.chmod(remote_path, 0o755)
    sftp.close(); c.close()

print(f"Target VM: {VM_IP}")

# Step 1: upload and run get_admin_key.js
print("\n=== Step 1: Decrypt admin key ===")
upload('/tmp/get_admin_key.js', 'scripts/get_admin_key.js')
o, e = run('cd ~/web/oracle/oracle-ics-backend && node /tmp/get_admin_key.js 2>&1', 30)
print(o)
if e: print("ERR:", e)

if 'SAVED' not in o:
    print("KEY DECRYPTION FAILED - stopping")
    sys.exit(1)

# Step 2: Open OCI security list port 22, then test SSH
print("\n=== Step 2: Direct SSH test (port 22 needs to be in security list) ===")
print("(Note: port 22 may need to be opened by the backend first)")
o, e = run(f'''
echo "=== Port check ==="
nc -zv -w 5 {VM_IP} 22 2>&1 || echo "port 22: closed"
nc -zv -w 5 {VM_IP} 3389 2>&1 || echo "port 3389: closed"

echo ""
echo "=== SSH attempt ==="
ssh -o StrictHostKeyChecking=no \
    -o ConnectTimeout=20 \
    -o BatchMode=yes \
    -o PasswordAuthentication=no \
    -o ServerAliveInterval=5 \
    -i /tmp/admin_key.pem \
    opc@{VM_IP} \
    "echo CONNECTED; net user opc; echo SSHOK" 2>&1 || echo "SSH_FAILED"
''', 60)
print(o)
if e: print("ERR:", e)

# Step 3: Check if netcat banner test works (banner test)
print("\n=== Step 3: Banner test on port 22 ===")
o, e = run(f'''
timeout 10 bash -c "exec 3<>/dev/tcp/{VM_IP}/22; echo CONNECTED; head -1 <&3; exec 3>&-" 2>&1 || echo "NO_BANNER_OR_CLOSED"
''', 15)
print("Banner:", o.strip() if o.strip() else "none")
if e: print("ERR:", e)

# Step 4: Check sshd from management plane - use OCI CLI if available
print("\n=== Step 4: Check oci cli availability ===")
o, e = run('which oci 2>/dev/null && oci --version 2>&1 || echo "OCI CLI not available"', 10)
print(o.strip())

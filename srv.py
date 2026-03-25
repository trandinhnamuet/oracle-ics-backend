import paramiko
import sys

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "token"

if action == "token":
    # Create a script on server to generate JWT token
    script = """
cd ~/web/oracle/oracle-ics-backend
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({sub: 73, email: 'test@test.com'}, 'jwt-secret-key-42jfwj2k', {expiresIn: '1h'});
console.log(token);
"
"""
    stdin, stdout, stderr = client.exec_command(script, timeout=30)
    token = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err:
        print("STDERR:", err)
    print(f"TOKEN: {token}")

elif action == "call":
    token = sys.argv[2]
    sub_id = "e48fb336-0a5c-4d75-b425-6f49319adb7d"
    cmd = f"""curl -s -w '\\nHTTP_CODE:%{{http_code}}' -X POST \
      'http://localhost:3002/vm-subscription/{sub_id}/reset-windows-password' \
      -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer {token}'"""
    stdin, stdout, stderr = client.exec_command(cmd, timeout=900)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err: print("ERR:", err)

elif action == "logs":
    lines = sys.argv[2] if len(sys.argv) > 2 else "50"
    stdin, stdout, stderr = client.exec_command(f"pm2 logs oracle-ics-backend --lines {lines} --nostream 2>&1", timeout=30)
    print(stdout.read().decode())

elif action == "exec":
    cmd = sys.argv[2]
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err: print("STDERR:", err)

client.close()

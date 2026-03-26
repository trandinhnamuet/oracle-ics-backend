import paramiko
import sys
import time
import json

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"
SUB_ID = "b8491dd8-d832-4537-978b-1185bd92dc25"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

# Generate token
token_cmd = """cd ~/web/oracle/oracle-ics-backend && node -e 'const j=require("jsonwebtoken");console.log(j.sign({sub:73,email:"test@test.com"},"jwt-secret-key-42jfwj2k",{expiresIn:"1h"}));'"""
stdin, stdout, stderr = ssh.exec_command(token_cmd, timeout=30)
token = stdout.read().decode().strip()
err = stderr.read().decode().strip()
if err:
    print("Token error:", err)
print(f"Token: {token[:50]}...")

action = sys.argv[1] if len(sys.argv) > 1 else "get"

if action == "get":
    cmd = f'curl -s -w "\\nHTTP:%{{http_code}}" http://localhost:3002/vm-subscription/{SUB_ID} -H "Authorization: Bearer {token}"'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    print("Response:", stdout.read().decode()[:500])

elif action == "reset":
    cmd = f'curl -s -w "\\nHTTP:%{{http_code}}" -X POST http://localhost:3002/vm-subscription/{SUB_ID}/reset-windows-password -H "Content-Type: application/json" -H "Authorization: Bearer {token}" --max-time 600'
    print("Calling reset password API (max 10 min)...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=900)
    print("Response:", stdout.read().decode())
    err = stderr.read().decode()
    if err: print("Stderr:", err)

elif action == "logs":
    lines = sys.argv[2] if len(sys.argv) > 2 else "50"
    stdin, stdout, stderr = ssh.exec_command(f"pm2 logs oracle-ics-backend --lines {lines} --nostream 2>&1", timeout=30)
    print(stdout.read().decode())

elif action == "delete-vm":
    cmd = f'curl -s -w "\\nHTTP:%{{http_code}}" -X DELETE http://localhost:3002/vm-subscription/{SUB_ID}/vm-only -H "Content-Type: application/json" -H "Authorization: Bearer {token}" --max-time 300'
    print("Deleting VM...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=600)
    print("Response:", stdout.read().decode())

elif action == "configure":
    payload = json.dumps({
        "imageId": "ocid1.image.oc1.ap-tokyo-1.aaaaaaaafpfmoagi5eoqulsvxszzpe7v2p773pixt6q7qeujb6nyopcfodla",
        "shape": "VM.Standard3.Flex",
        "ocpus": 1,
        "memoryInGBs": 4,
        "bootVolumeSizeInGBs": 50,
        "notificationEmail": "vunguyettau@gmail.com"
    })
    cmd = f"""curl -s -w '\\nHTTP:%{{http_code}}' -X POST http://localhost:3002/vm-subscription/{SUB_ID}/configure -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload}' --max-time 600"""
    print("Creating VM...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=900)
    print("Response:", stdout.read().decode()[:1000])

elif action == "dbq":
    query = sys.argv[2] if len(sys.argv) > 2 else "SELECT 1"
    cmd = f'PGPASSWORD=ics psql -h localhost -U live -d ics -c "{query}"'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err: print("ERR:", err)

ssh.close()

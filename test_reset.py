import paramiko
import sys
import time
import json

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"
SUB_ID = "07e1530e-30ad-42d2-9a40-4f891f23282b"  # user 7, no VM yet (test)
SUB_ID_WIN = "01361cc9-9ee9-4d46-bb58-10a89ae5fa4f"   # user 7, VM 45 (Windows)
TOKEN_USER_ID = 7  # user 7 (minhtuan90959095@gmail.com)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

# Generate token
token_cmd = f"""cd ~/web/oracle/oracle-ics-backend && node -e 'const j=require("jsonwebtoken");console.log(j.sign({{sub:{TOKEN_USER_ID},email:"minhtuan90959095@gmail.com"}},"jwt-secret-key-42jfwj2k",{{expiresIn:"2h"}}));'"""
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
    sub = sys.argv[2] if len(sys.argv) > 2 else SUB_ID
    custom_pw = sys.argv[3] if len(sys.argv) > 3 else None
    body = f' -d \'{{"newPassword":"{custom_pw}"}}\'' if custom_pw else ''
    cmd = f'curl -s -w "\\nHTTP:%{{http_code}}" -X POST http://localhost:3002/vm-subscription/{sub}/reset-windows-password -H "Content-Type: application/json" -H "Authorization: Bearer {token}"{body} --max-time 600'
    print(f"Calling reset password API (sub={sub}, custom_pw={'yes' if custom_pw else 'no'})...")
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

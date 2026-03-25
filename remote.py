import paramiko
import sys
import time

HOST = "14.224.205.40"
USER = "icsadmin"
PASSWORD = "ics2025.,"

def ssh_exec(commands, timeout=300):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    stdin, stdout, stderr = client.exec_command(commands, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    client.close()
    return out, err, exit_code

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "info"
    
    if action == "info":
        out, err, _ = ssh_exec("cat ~/web/oracle/oracle-ics-backend/.env 2>/dev/null | head -30")
        print(out)
        
    elif action == "logs":
        lines = sys.argv[2] if len(sys.argv) > 2 else "100"
        out, err, _ = ssh_exec(f"pm2 logs oracle-ics-backend --lines {lines} --nostream 2>&1")
        print(out)
        
    elif action == "call_api":
        # Call the reset password API via curl on the server itself
        token = sys.argv[2] if len(sys.argv) > 2 else ""
        sub_id = "e48fb336-0a5c-4d75-b425-6f49319adb7d"
        cmd = f"""curl -s -w '\\nHTTP_CODE:%{{http_code}}' -X POST \\
          'http://localhost:3000/api/vm-subscription/{sub_id}/reset-windows-password' \\
          -H 'Content-Type: application/json' \\
          -H 'Authorization: Bearer {token}' 2>&1"""
        out, err, _ = ssh_exec(cmd, timeout=600)
        print(out)
        
    elif action == "exec":
        cmd = sys.argv[2]
        out, err, code = ssh_exec(cmd)
        print(out)
        if err: print("STDERR:", err)
        print(f"Exit: {code}")

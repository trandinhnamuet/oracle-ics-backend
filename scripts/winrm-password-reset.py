"""
WinRM Password Reset Helper
Used by the NestJS backend to change Windows VM passwords via WinRM.
Reads input as JSON from stdin for security (passwords not in CLI args).

Required: pip3 install pywinrm
"""
import sys
import json
import winrm

data = json.loads(sys.stdin.read())
ip = data['ip']
username = data['username']
current_password = data['currentPassword']
new_password = data['newPassword']

try:
    s = winrm.Session(
        f'https://{ip}:5986/wsman',
        auth=(username, current_password),
        transport='ntlm',
        server_cert_validation='ignore',
        operation_timeout_sec=30,
        read_timeout_sec=35,
    )

    r = s.run_cmd('net', ['user', username, new_password])
    result = {
        'exitCode': r.status_code,
        'stdout': r.std_out.decode('utf-8', errors='replace').strip(),
        'stderr': r.std_err.decode('utf-8', errors='replace').strip(),
    }
    print(json.dumps(result))

    if r.status_code != 0:
        sys.exit(1)

except Exception as e:
    print(json.dumps({'error': str(e), 'exitCode': -1}))
    sys.exit(1)

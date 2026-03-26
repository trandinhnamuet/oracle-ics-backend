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

# For local Windows accounts, NTLM requires the username in '.\username' format.
# We try negotiate (Kerberos → NTLM fallback) first, then plain NTLM, across both formats.
SESSION_ATTEMPTS = [
    ('negotiate', f'.\\{username}'),
    ('ntlm',      f'.\\{username}'),
    ('negotiate', username),
    ('ntlm',      username),
]

last_error = None
for transport, auth_user in SESSION_ATTEMPTS:
    try:
        s = winrm.Session(
            f'https://{ip}:5986/wsman',
            auth=(auth_user, current_password),
            transport=transport,
            server_cert_validation='ignore',
            operation_timeout_sec=30,
            read_timeout_sec=35,
        )

        r = s.run_cmd('net', ['user', username, new_password])
        result = {
            'exitCode': r.status_code,
            'stdout': r.std_out.decode('utf-8', errors='replace').strip(),
            'stderr': r.std_err.decode('utf-8', errors='replace').strip(),
            'transport': transport,
            'authUser': auth_user,
        }
        print(json.dumps(result))
        sys.exit(0 if r.status_code == 0 else 1)

    except Exception as e:
        last_error = str(e)
        # If the error is NOT a credentials rejection, don't retry next format
        if 'credential' not in last_error.lower() and 'rejected' not in last_error.lower() and 'unauthorized' not in last_error.lower():
            print(json.dumps({'error': last_error, 'transport': transport, 'authUser': auth_user, 'exitCode': -1}))
            sys.exit(1)

# All attempts failed with credentials error
print(json.dumps({'error': f'All auth transports failed. Last error: {last_error}', 'exitCode': -1}))
sys.exit(1)

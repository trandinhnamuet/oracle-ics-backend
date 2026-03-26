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

# Attempt order:
#   1. HTTPS (5986) + NTLM + .\username  — standard OCI Windows setup
#   2. HTTPS (5986) + NTLM + username    — some images drop the .\ prefix
#   3. HTTP  (5985) + basic + username   — fallback when NTLM fails over IP
#      (basic auth is enabled in user_data setup script; needs AllowUnencrypted=true)
SESSION_ATTEMPTS = [
    ('https', 5986, 'ntlm',  f'.\\{username}'),
    ('https', 5986, 'ntlm',  username),
    ('http',  5985, 'basic', username),
]

last_error = None
attempt_errors = []

for scheme, port, transport, auth_user in SESSION_ATTEMPTS:
    try:
        s = winrm.Session(
            f'{scheme}://{ip}:{port}/wsman',
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
            'port': port,
        }
        print(json.dumps(result))
        sys.exit(0 if r.status_code == 0 else 1)

    except Exception as e:
        last_error = str(e)
        # Always record the error for diagnostics
        attempt_errors.append({'port': port, 'transport': transport, 'authUser': auth_user, 'error': last_error[:300]})
        # Only continue to next attempt if it looks like an auth/credential error.
        # For connection errors (refused, timeout) stop immediately.
        is_auth_error = any(k in last_error.lower() for k in [
            'credential', 'rejected', 'unauthorized', '401', 'ntlm', 'auth'
        ])
        if not is_auth_error:
            print(json.dumps({'error': last_error, 'transport': transport, 'authUser': auth_user, 'port': port, 'exitCode': -1, 'attempts': attempt_errors}))
            sys.exit(1)

# All attempts failed — include all attempt errors in the output
print(json.dumps({'error': f'All auth transports failed. Last error: {last_error}', 'exitCode': -1, 'attempts': attempt_errors}))
sys.exit(1)

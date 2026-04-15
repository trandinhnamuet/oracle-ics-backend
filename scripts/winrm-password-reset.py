"""
WinRM Password Reset Helper
Used by the NestJS backend to change Windows VM passwords via WinRM.
Reads input as JSON from stdin for security (passwords not in CLI args).

Required: pip3 install pywinrm
"""
import sys
import json
import base64
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

# Base64-encode the new password so it can be safely embedded in a PowerShell
# script without cmd.exe metacharacter issues (& | > < % ! etc.)
pw_b64 = base64.b64encode(new_password.encode('utf-8')).decode('ascii')

# PowerShell script that decodes the password and runs "net user".
# /logonpasswordchg:no clears the "must change password at next logon" flag
# so the admin-issued password is directly usable without forcing an RDP change.
ps_script = (
    f"$b=[Convert]::FromBase64String('{pw_b64}');"
    f"$p=[Text.Encoding]::UTF8.GetString($b);"
    f"net user {username} $p /logonpasswordchg:no"
)

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

        # Use run_ps (PowerShell) instead of run_cmd (cmd.exe) to avoid
        # command-line escaping issues with special characters in passwords.
        r = s.run_ps(ps_script)
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

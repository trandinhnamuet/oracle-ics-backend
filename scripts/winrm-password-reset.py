"""
WinRM Password Reset Helper
Used by the NestJS backend to change Windows VM passwords via WinRM.
Reads input as JSON from stdin for security (passwords not in CLI args).

Two-tier authentication strategy:
  1. Admin account (icsreset) — tried first. Created by userdata with no must-change,
     so WinRM auth succeeds even when opc has must-change active.
     Admin can set opc's password without knowing the current password.
     Fully manages OCI_ClearPwFlag and must-change state.
  2. OPC account fallback — used when icsreset doesn't exist (old VMs / userdata failure).
     For setMustChange=True: does NOT delete OCI_ClearPwFlag so WinRM stays accessible.
     For setMustChange=False: deletes OCI_ClearPwFlag and clears must-change.

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
set_must_change = data.get('setMustChange', True)
admin_username = data.get('adminUsername', 'icsreset')
admin_password = data.get('adminPassword')

# Base64-encode the new password to safely handle special characters
pw_b64 = base64.b64encode(new_password.encode('utf-8')).decode('ascii')

# ─── Admin PS script (runs as icsreset, which IS an admin) ───────────────────
# Admin can set any user's password directly without knowing the current password.
# OCI_ClearPwFlag IS deleted because icsreset auth is unaffected by opc's must-change.
if set_must_change:
    admin_ps = (
        f"$b=[Convert]::FromBase64String('{pw_b64}');"
        f"$p=[Text.Encoding]::UTF8.GetString($b);"
        f"net user {username} $p /logonpasswordchg:yes;"     # set password + must-change
        f"schtasks /delete /tn OCI_ClearPwFlag /f 2>$null;"  # delete clearing task
        f"net user {username} /logonpasswordchg:yes"          # re-assert must-change after deletion
    )
else:
    admin_ps = (
        f"$b=[Convert]::FromBase64String('{pw_b64}');"
        f"$p=[Text.Encoding]::UTF8.GetString($b);"
        f"net user {username} $p /logonpasswordchg:no;"      # set password, no must-change
        f"schtasks /delete /tn OCI_ClearPwFlag /f 2>$null;"  # delete clearing task
        f"net user {username} /logonpasswordchg:no"           # ensure no must-change
    )

# ─── OPC fallback PS script (runs as opc with currentPassword) ───────────────
# For setMustChange=True (background job on old VMs): does NOT delete OCI_ClearPwFlag.
#   OCI_ClearPwFlag clears must-change within ~2 min, keeping WinRM accessible
#   for subsequent user-initiated portal resets.
# For setMustChange=False (user-initiated on old VMs): full cleanup.
if set_must_change:
    opc_ps = (
        f"$b=[Convert]::FromBase64String('{pw_b64}');"
        f"$p=[Text.Encoding]::UTF8.GetString($b);"
        f"net user {username} $p /logonpasswordchg:yes"       # set password + must-change
        # OCI_ClearPwFlag intentionally NOT deleted — clears must-change in ~2 min
    )
else:
    opc_ps = (
        f"$b=[Convert]::FromBase64String('{pw_b64}');"
        f"$p=[Text.Encoding]::UTF8.GetString($b);"
        f"net user {username} $p /logonpasswordchg:no;"      # set password, no must-change
        f"schtasks /delete /tn OCI_ClearPwFlag /f 2>$null;"  # delete clearing task
        f"net user {username} /logonpasswordchg:no"           # ensure no must-change
    )

# ─── Transport order (tried for both admin and opc accounts) ─────────────────
# 1. HTTPS (5986) + NTLM  + .\username  — standard OCI Windows setup
# 2. HTTPS (5986) + NTLM  + username    — some images drop the .\ prefix
# 3. HTTPS (5986) + basic + username    — basic over HTTPS
# 4. HTTP  (5985) + basic + username    — fallback when HTTPS unavailable
def make_transports(user):
    return [
        ('https', 5986, 'ntlm',  f'.\\{user}'),
        ('https', 5986, 'ntlm',  user),
        ('https', 5986, 'basic', user),
        ('http',  5985, 'basic', user),
    ]

def try_winrm(user, password, ps_script, method_label):
    """Attempt WinRM with all transports. Returns result dict on success, None on full failure."""
    last_error = None
    attempt_errors = []
    for scheme, port, transport, auth_user in make_transports(user):
        try:
            s = winrm.Session(
                f'{scheme}://{ip}:{port}/wsman',
                auth=(auth_user, password),
                transport=transport,
                server_cert_validation='ignore',
                operation_timeout_sec=30,
                read_timeout_sec=35,
            )
            r = s.run_ps(ps_script)
            return {
                'exitCode': r.status_code,
                'stdout': r.std_out.decode('utf-8', errors='replace').strip(),
                'stderr': r.std_err.decode('utf-8', errors='replace').strip(),
                'transport': transport,
                'authUser': auth_user,
                'port': port,
                'method': method_label,
            }, None
        except Exception as e:
            last_error = str(e)
            attempt_errors.append({
                'port': port, 'transport': transport,
                'authUser': auth_user, 'error': last_error[:300],
                'method': method_label,
            })
            is_auth_error = any(k in last_error.lower() for k in [
                'credential', 'rejected', 'unauthorized', '401', 'ntlm', 'auth'
            ])
            if not is_auth_error:
                # Connection error (timeout/refused) — stop immediately, no point retrying
                return None, {'connection_error': last_error, 'attempts': attempt_errors}
    # All transports failed with auth errors
    return None, {'auth_error': last_error, 'attempts': attempt_errors}

all_attempt_errors = []

# ─── Step 1: Try icsreset admin account ──────────────────────────────────────
if admin_password:
    result, error_info = try_winrm(admin_username, admin_password, admin_ps, 'admin')
    if result is not None:
        print(json.dumps(result))
        sys.exit(0 if result['exitCode'] == 0 else 1)
    if error_info:
        all_attempt_errors.extend(error_info.get('attempts', []))
        if 'connection_error' in error_info:
            # Connection error — no point trying opc on same IP
            print(json.dumps({
                'error': error_info['connection_error'],
                'exitCode': -1,
                'attempts': all_attempt_errors,
            }))
            sys.exit(1)
        # Auth error on admin — fall through to opc fallback

# ─── Step 2: OPC fallback ────────────────────────────────────────────────────
result, error_info = try_winrm(username, current_password, opc_ps, 'opc')
if result is not None:
    print(json.dumps(result))
    sys.exit(0 if result['exitCode'] == 0 else 1)

if error_info:
    all_attempt_errors.extend(error_info.get('attempts', []))
    last_error = error_info.get('connection_error') or error_info.get('auth_error', 'unknown error')

print(json.dumps({
    'error': f'All auth transports failed. Last error: {last_error}',
    'exitCode': -1,
    'attempts': all_attempt_errors,
}))
sys.exit(1)

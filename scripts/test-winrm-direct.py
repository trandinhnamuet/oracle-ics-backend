#!/usr/bin/env python3
"""Direct WinRM connectivity and auth test for the Windows VM.
NOTE: This test assumes port 5986 is already open in the OCI security list.
Run this while port 5986 is temporarily open (e.g. during a password reset attempt).
"""
import winrm
import json

IP = '161.33.207.245'
PASSWORD = 'Hniknahcma9@'

print(f'Testing WinRM connection to {IP}:5986...')

for username in [r'.\opc', 'opc']:
    print(f'\n--- Trying username: {username!r} ---')
    try:
        s = winrm.Session(
            f'https://{IP}:5986/wsman',
            auth=(username, PASSWORD),
            transport='ntlm',
            server_cert_validation='ignore',
            operation_timeout_sec=20,
            read_timeout_sec=25,
        )
        r = s.run_cmd('whoami', [])
        print(json.dumps({
            'status': 'SUCCESS',
            'username': username,
            'exit': r.status_code,
            'stdout': r.std_out.decode('utf-8', errors='replace').strip(),
            'stderr': r.std_err.decode('utf-8', errors='replace').strip(),
        }))
        print('WinRM WORKS with this combination!')
        break
    except Exception as e:
        print(json.dumps({'status': 'FAILED', 'username': username, 'error': str(e)}))

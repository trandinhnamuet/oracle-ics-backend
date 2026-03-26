#!/usr/bin/env python3
"""Direct WinRM test."""
import subprocess
import json

test_json = json.dumps({
    'ip': '161.33.207.245',
    'username': 'opc',
    'currentPassword': 'Hniknahcma9@',
    'newPassword': 'TestNewPass123!',
})

r = subprocess.run(
    ['python3', '/home/icsadmin/web/oracle/oracle-ics-backend/scripts/winrm-password-reset.py'],
    input=test_json,
    capture_output=True,
    text=True,
    timeout=60,
)
print('STDOUT:', r.stdout.strip())
print('STDERR:', r.stderr.strip())
print('EXIT:', r.returncode)

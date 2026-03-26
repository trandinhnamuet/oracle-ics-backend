#!/usr/bin/env python3
"""Find subscription for Windows VM."""
import subprocess
result = subprocess.run(
    ['psql', '-U', 'postgres', '-d', 'oracle_db', '-t', '-c',
     "SELECT s.id || '|' || s.user_id || '|' || v.public_ip FROM subscription s JOIN vm_instance v ON v.id=s.vm_instance_id WHERE v.public_ip='161.33.207.245'"],
    env={'PGPASSWORD': 'ics2025.,', 'PATH': '/usr/bin:/bin'},
    capture_output=True, text=True
)
print(result.stdout.strip())
print(result.stderr.strip())

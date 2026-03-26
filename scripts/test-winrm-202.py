#!/usr/bin/env python3
"""
Direct WinRM test: test all auth combinations on VM 202
Run on server: python3 /tmp/test-winrm-202.py
"""
import sys
import json

try:
    import winrm
except ImportError:
    print("ERROR: pywinrm not installed. Run: pip3 install pywinrm")
    sys.exit(1)

IP = "161.33.197.24"
USER = "opc"
PASS = "m[c7G7:qV(n[f"

attempts = [
    ("https", 5986, "ntlm",   f".\\{USER}"),
    ("https", 5986, "ntlm",   USER),
    ("http",  5985, "basic",  USER),
]

for scheme, port, transport, auth_user in attempts:
    label = f"{transport}:{scheme}:{port} user={auth_user}"
    try:
        s = winrm.Session(
            f"{scheme}://{IP}:{port}/wsman",
            auth=(auth_user, PASS),
            transport=transport,
            server_cert_validation='ignore',
            operation_timeout_sec=10,
            read_timeout_sec=12,
        )
        r = s.run_cmd("whoami")
        print(f"OK [{label}] exit={r.status_code} out={r.std_out.decode().strip()[:60]}")
    except Exception as e:
        err = str(e)[:120]
        print(f"FAIL [{label}] {err}")

print("Done.")

#!/usr/bin/env python3
"""Get a fresh JWT token for testing."""
import urllib.request
import json

req = urllib.request.Request(
    'http://localhost:3002/auth/login',
    data=json.dumps({'email': 'chien@ics.com', 'password': 'ics2025.'}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        token = data.get('access_token', '')
        print(token)
except Exception as e:
    print(f'ERROR: {e}')

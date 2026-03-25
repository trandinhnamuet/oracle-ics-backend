import paramiko, sys
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('14.224.205.40', username='icsadmin', password='ics2025.,', timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "check"

if action == "check":
    stdin, stdout, stderr = c.exec_command('python3 -c "import winrm; print(winrm.__version__)"', timeout=15)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"OUT: {out}")
    print(f"ERR: {err}")

elif action == "test_port":
    # Test if WinRM port 5986 is reachable on target VM
    ip = sys.argv[2] if len(sys.argv) > 2 else "161.33.207.245"
    stdin, stdout, stderr = c.exec_command(f'timeout 5 bash -c "echo > /dev/tcp/{ip}/5986" 2>&1 && echo OPEN || echo CLOSED', timeout=15)
    print(stdout.read().decode().strip())

elif action == "winrm_test":
    # Test WinRM connection
    ip = sys.argv[2] if len(sys.argv) > 2 else "161.33.207.245"
    password = sys.argv[3] if len(sys.argv) > 3 else "8Z#v8Kf9ITdJr"
    py_cmd = f'''python3 -c "
import winrm
s = winrm.Session('https://{ip}:5986/wsman', auth=('opc', '{password}'), transport='ntlm', server_cert_validation='ignore')
r = s.run_cmd('whoami')
print('EXIT:', r.status_code)
print('OUT:', r.std_out.decode().strip())
print('ERR:', r.std_err.decode().strip())
"'''
    stdin, stdout, stderr = c.exec_command(py_cmd, timeout=30)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err: print("STDERR:", err)

elif action == "db_query":
    # Query security list info
    query = sys.argv[2] if len(sys.argv) > 2 else "SELECT security_list_id, subnet_id FROM oracle.vcn_resources WHERE subnet_id = 'ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaqvconihyxbntwnchvf4r45q4nn7uv7v4h5xhrwo6lbuousqqyp3a'"
    cmd = f"""cd ~/web/oracle/oracle-ics-backend && \
      DB_HOST=$(grep DB_HOST .env | cut -d= -f2) && \
      DB_PORT=$(grep DB_PORT .env | cut -d= -f2) && \
      DB_USER=$(grep DB_USERNAME .env | cut -d= -f2) && \
      DB_PASS=$(grep DB_PASSWORD .env | cut -d= -f2) && \
      DB_NAME=$(grep DB_NAME .env | cut -d= -f2) && \
      PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A -c "{query}"
    """
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    print(stdout.read().decode().strip())
    err = stderr.read().decode().strip()
    if err: print("ERR:", err)

c.close()

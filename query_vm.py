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
    # Test WinRM connection with multiple transports
    ip = sys.argv[2] if len(sys.argv) > 2 else "161.33.207.245"
    password = sys.argv[3] if len(sys.argv) > 3 else "8Z#v8Kf9ITdJr"
    # First open the WinRM port
    test_script = f"""
import winrm
import traceback

ip = '{ip}'
password = '{password}'

for transport in ['ntlm', 'ssl']:
    for user in ['opc', '.\\\\opc', 'WORKGROUP\\\\opc']:
        try:
            print(f'Trying transport={{transport}}, user={{user}}...')
            s = winrm.Session(
                f'https://{{ip}}:5986/wsman', 
                auth=(user, password), 
                transport=transport, 
                server_cert_validation='ignore',
                operation_timeout_sec=15,
                read_timeout_sec=20,
            )
            r = s.run_cmd('whoami')
            print(f'  SUCCESS! exit={{r.status_code}}, out={{r.std_out.decode().strip()}}')
            break
        except Exception as e:
            print(f'  FAILED: {{str(e)[:100]}}')
    else:
        continue
    break
"""
    sftp = c.open_sftp()
    f = sftp.file('/tmp/winrm-test.py', 'w')
    f.write(test_script)
    f.close()
    sftp.close()
    stdin, stdout, stderr = c.exec_command('python3 /tmp/winrm-test.py', timeout=120)
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

elif action == "oci_creds":
    # Get Windows initial credentials from OCI API
    js_script = """
const oci = require("oci-sdk");
const path = require("path");
const os = require("os");
const p = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(), ".oci", "config"), "DEFAULT");
const c = new oci.core.ComputeClient({authenticationDetailsProvider: p});
c.getWindowsInstanceInitialCredentials({instanceId: "ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycimxfbziilierfkdq5nvxmj7qz666wzpaquldqxplzuma"})
  .then(r => console.log(JSON.stringify(r.instanceCredentials)))
  .catch(e => console.error("ERROR:", e.message));
"""
    sftp = c.open_sftp()
    f = sftp.file('/home/icsadmin/web/oracle/oracle-ics-backend/oci-creds.js', 'w')
    f.write(js_script)
    f.close()
    sftp.close()
    stdin, stdout, stderr = c.exec_command('cd ~/web/oracle/oracle-ics-backend && node oci-creds.js', timeout=30)
    print(stdout.read().decode().strip())
    err = stderr.read().decode().strip()
    if err: print("ERR:", err)

c.close()

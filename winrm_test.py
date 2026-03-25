import paramiko
import sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('14.224.205.40', username='icsadmin', password='ics2025.,', timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "open"

js_open_port = """
const oci = require("oci-sdk");
const path = require("path");
const os = require("os");
const pr = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(), ".oci", "config"), "DEFAULT");
const vn = new oci.core.VirtualNetworkClient({authenticationDetailsProvider: pr});

async function main() {
    const subnetResp = await vn.getSubnet({subnetId: "ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaqvconihyxbntwnchvf4r45q4nn7uv7v4h5xhrwo6lbuousqqyp3a"});
    const slId = subnetResp.subnet.securityListIds[0];
    console.log("SecList:", slId);
    
    const slResp = await vn.getSecurityList({securityListId: slId});
    const hasRule = slResp.securityList.ingressSecurityRules.some(r => r.protocol === "6" && r.tcpOptions && r.tcpOptions.destinationPortRange && r.tcpOptions.destinationPortRange.min === 5986);
    
    if (hasRule) {
        console.log("Port 5986 already open");
        return;
    }
    
    const newRules = [...slResp.securityList.ingressSecurityRules, {
        source: "0.0.0.0/0",
        protocol: "6",
        isStateless: false,
        tcpOptions: { destinationPortRange: { min: 5986, max: 5986 } },
        description: "WinRM HTTPS temp"
    }];
    
    await vn.updateSecurityList({
        securityListId: slId,
        updateSecurityListDetails: {
            ingressSecurityRules: newRules,
            egressSecurityRules: slResp.securityList.egressSecurityRules
        }
    });
    console.log("Port 5986 opened");
}
main().catch(e => console.error("Error:", e.message));
"""

js_close_port = """
const oci = require("oci-sdk");
const path = require("path");
const os = require("os");
const pr = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(), ".oci", "config"), "DEFAULT");
const vn = new oci.core.VirtualNetworkClient({authenticationDetailsProvider: pr});

async function main() {
    const subnetResp = await vn.getSubnet({subnetId: "ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaqvconihyxbntwnchvf4r45q4nn7uv7v4h5xhrwo6lbuousqqyp3a"});
    const slId = subnetResp.subnet.securityListIds[0];
    
    const slResp = await vn.getSecurityList({securityListId: slId});
    const filteredRules = slResp.securityList.ingressSecurityRules.filter(r => !(r.protocol === "6" && r.tcpOptions && r.tcpOptions.destinationPortRange && r.tcpOptions.destinationPortRange.min === 5986));
    
    await vn.updateSecurityList({
        securityListId: slId,
        updateSecurityListDetails: {
            ingressSecurityRules: filteredRules,
            egressSecurityRules: slResp.securityList.egressSecurityRules
        }
    });
    console.log("Port 5986 closed");
}
main().catch(e => console.error("Error:", e.message));
"""

if action == "open":
    sftp = c.open_sftp()
    f = sftp.file('/home/icsadmin/web/oracle/oracle-ics-backend/oci-port.js', 'w')
    f.write(js_open_port)
    f.close()
    sftp.close()
    stdin, stdout, stderr = c.exec_command('cd ~/web/oracle/oracle-ics-backend && node oci-port.js', timeout=30)
elif action == "close":
    sftp = c.open_sftp()
    f = sftp.file('/home/icsadmin/web/oracle/oracle-ics-backend/oci-port.js', 'w')
    f.write(js_close_port)
    f.close()
    sftp.close()
    stdin, stdout, stderr = c.exec_command('cd ~/web/oracle/oracle-ics-backend && node oci-port.js', timeout=30)
elif action == "test_winrm":
    # wait 15s for propagation, then test
    import time
    time.sleep(15)
    
    test_script = """
import winrm
import traceback

ip = '161.33.207.245'
password = '8Z#v8Kf9ITdJr'

for transport in ['ntlm', 'ssl']:
    for user in ['opc', '.\\\\opc']:
        try:
            print(f'Trying transport={transport}, user={user}...')
            s = winrm.Session(
                f'https://{ip}:5986/wsman', 
                auth=(user, password), 
                transport=transport, 
                server_cert_validation='ignore',
                operation_timeout_sec=15,
                read_timeout_sec=20,
            )
            r = s.run_cmd('whoami')
            print(f'  SUCCESS! exit={r.status_code}, out={r.std_out.decode().strip()}')
            import sys
            sys.exit(0)
        except Exception as e:
            print(f'  FAILED: {str(e)[:200]}')

print('All transport/user combinations failed')
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
c.close()

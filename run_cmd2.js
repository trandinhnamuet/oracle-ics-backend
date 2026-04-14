const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  const compartmentId = 'ocid1.compartment.oc1..aaaaaaaavwuj2dp2nggcknqhsma37dlqnbcmqxusmkqcvgqw3wmzo3j34uyq';
  
  // List available APIs
  try {
    const cc = new oci.computeinstanceagent.ComputeInstanceAgentClient({authenticationDetailsProvider: provider});
    // Set region explicitly
    cc.region = 'ap-tokyo-1';
    const result = await cc.createInstanceAgentCommand({
      createInstanceAgentCommandDetails: {
        compartmentId: compartmentId,
        executionTimeOutInSeconds: 60,
        target: { instanceId: instanceId },
        content: {
          type: 'TEXT',
          text: 'powershell -Command "Get-Service sshd 2>&1; Get-Service WinRM 2>&1; netsh advfirewall firewall show rule name=all dir=in | findstr /i ssh"'
        }
      }
    });
    console.log('CMD_ID:', result.instanceAgentCommand.id);
    // Wait and get result
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const exec = await cc.getInstanceAgentCommandExecution({
        instanceAgentCommandId: result.instanceAgentCommand.id,
        instanceId: instanceId
      });
      const state = exec.instanceAgentCommandExecution.deliveryState;
      console.log('TRY', i+1, 'STATE:', state);
      if (state === 'COMPLETE' || state === 'TIMED_OUT' || state === 'FAILED') {
        console.log('CONTENT:', JSON.stringify(exec.instanceAgentCommandExecution.content, null, 2));
        break;
      }
    }
  } catch(e) {
    console.error('FULL_ERROR:', e.statusCode, e.serviceCode, e.message ? e.message.substring(0, 500) : 'no msg');
  }
}
main().catch(e => console.error('ERR:', e.message));

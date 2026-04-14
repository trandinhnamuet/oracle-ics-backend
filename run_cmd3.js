const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  const compartmentId = 'ocid1.compartment.oc1..aaaaaaaavwuj2dp2nggcknqhsma37dlqnbcmqxusmkqcvgqw3wmzo3j34uyq';
  const cc = new oci.computeinstanceagent.ComputeInstanceAgentClient({authenticationDetailsProvider: provider});
  cc.regionId = 'ap-tokyo-1';
  cc.endpoint = 'https://iaas.ap-tokyo-1.oraclecloud.com';
  try {
    const result = await cc.createInstanceAgentCommand({
      createInstanceAgentCommandDetails: {
        compartmentId: compartmentId,
        executionTimeOutInSeconds: 60,
        target: { instanceId: instanceId },
        content: {
          type: 'TEXT',
          text: 'powershell -Command "Get-Service sshd,WinRM 2>&1"'
        }
      }
    });
    console.log('CMD_ID:', result.instanceAgentCommand.id);
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const exec = await cc.getInstanceAgentCommandExecution({
        instanceAgentCommandId: result.instanceAgentCommand.id,
        instanceId
      });
      console.log('TRY', i+1, 'STATE:', exec.instanceAgentCommandExecution.deliveryState);
      if (['COMPLETE','TIMED_OUT','FAILED'].includes(exec.instanceAgentCommandExecution.deliveryState)) {
        console.log('CONTENT:', JSON.stringify(exec.instanceAgentCommandExecution.content, null, 2));
        break;
      }
    }
  } catch(e) {
    console.error('ERROR:', e.statusCode, e.serviceCode, (e.message||'').substring(0,300));
    if (e.cause) console.error('CAUSE:', e.cause.message);
  }
}
main().catch(e => console.error('ERR:', e.message));

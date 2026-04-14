const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const cc = new oci.computeinstanceagent.ComputeInstanceAgentClient({authenticationDetailsProvider: provider});
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  const compartmentId = 'ocid1.compartment.oc1..aaaaaaaavwuj2dp2nggcknqhsma37dlqnbcmqxusmkqcvgqw3wmzo3j34uyq';
  const cmd = 'powershell -Command "Get-Service sshd; netstat -an | findstr :22; Test-Path C:\\\\ProgramFiles\\\\OpenSSH\\\\sshd.exe; Test-Path C:\\\\progra~1\\\\OpenSSH\\\\sshd.exe; dir env:ProgramFiles"';
  const res = await cc.createInstanceAgentCommand({
    createInstanceAgentCommandDetails: {
      compartmentId, executionTimeOutInSeconds: 60,
      target: { instanceId },
      content: { type: 'TEXT', text: cmd, textSha256: null }
    }
  });
  console.log('COMMAND_ID:', res.instanceAgentCommand.id);
  // Wait 15s then fetch output
  await new Promise(r => setTimeout(r, 15000));
  const out = await cc.getInstanceAgentCommandExecution({
    instanceAgentCommandId: res.instanceAgentCommand.id,
    instanceId
  });
  console.log('STATE:', out.instanceAgentCommandExecution.deliveryState);
  const content = out.instanceAgentCommandExecution.content;
  if (content && content.output) console.log('OUTPUT:', JSON.stringify(content.output).substring(0,500));
  if (content && content.exitCode !== undefined) console.log('EXIT:', content.exitCode);
}
main().catch(e => console.error(e.message));

const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const computeClient = new oci.core.ComputeClient({authenticationDetailsProvider: provider});
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  const compartmentId = 'ocid1.compartment.oc1..aaaaaaaavwuj2dp2nggcknqhsma37dlqnbcmqxusmkqcvgqw3wmzo3j34uyq';
  // Use InstanceAgentClient
  const agentClient = new oci.computeinstanceagent.ComputeInstanceAgentClient({authenticationDetailsProvider: provider});
  console.log('Creating run command...');
  const result = await agentClient.createInstanceAgentCommand({
    createInstanceAgentCommandDetails: {
      compartmentId: compartmentId,
      executionTimeOutInSeconds: 120,
      target: { instanceId: instanceId },
      content: {
        type: 'TEXT',
        text: 'cmd /c "powershell -Command Get-Service sshd,WinRM 2>&1 & netstat -an | findstr :22 & netstat -an | findstr :5985 & powershell -Command Get-NetFirewallRule -Name AllowSSH22-OCI,WinRM-HTTP-In-TCP -ErrorAction SilentlyContinue 2>&1 & dir /b C:\\ProgramFiles\\OpenSSH\\ 2>&1 & dir /b C:\\Progra~1\\OpenSSH\\ 2>&1 & type C:\\ProgramData\\ssh\\sshd_config 2>&1 | more +0"'
      }
    }
  });
  const cmdId = result.instanceAgentCommand.id;
  console.log('CMD_ID:', cmdId);
  // Poll for result
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const exec = await agentClient.getInstanceAgentCommandExecution({
        instanceAgentCommandId: cmdId,
        instanceId: instanceId
      });
      const state = exec.instanceAgentCommandExecution.deliveryState;
      console.log('STATE:', state);
      if (state === 'COMPLETE' || state === 'TIMED_OUT' || state === 'FAILED') {
        const content = exec.instanceAgentCommandExecution.content;
        if (content) {
          console.log('EXIT_CODE:', content.exitCode);
          if (content.output && content.output.textSha256 !== undefined) {
            console.log('OUTPUT:', JSON.stringify(content.output));
          }
          if (content.outputUri) console.log('OUTPUT_URI:', content.outputUri);
          // Try to get text output
          console.log('FULL_CONTENT:', JSON.stringify(content));
        }
        break;
      }
    } catch(e) {
      console.log('POLL_ERR:', e.message.substring(0, 200));
    }
  }
}
main().catch(e => console.error('ERR:', e.message));

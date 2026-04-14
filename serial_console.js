const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
const fs = require('fs');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const computeClient = new oci.core.ComputeClient({authenticationDetailsProvider: provider});
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  
  // Try to capture console history
  try {
    const capture = await computeClient.captureConsoleHistory({
      captureConsoleHistoryDetails: { instanceId }
    });
    const histId = capture.consoleHistory.id;
    console.log('HIST_ID:', histId);
    
    // Wait for capture
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const hist = await computeClient.getConsoleHistory({ instanceConsoleHistoryId: histId });
      console.log('HIST_STATE:', hist.consoleHistory.lifecycleState);
      if (hist.consoleHistory.lifecycleState === 'SUCCEEDED') {
        const content = await computeClient.getConsoleHistoryContent({ instanceConsoleHistoryId: histId });
        // content is a ReadableStream or string
        const text = typeof content.value === 'string' ? content.value : 'non-string content';
        fs.writeFileSync('/tmp/console_output.txt', text);
        console.log('Written to /tmp/console_output.txt, length:', text.length);
        // Show last 3000 chars
        console.log('TAIL:');
        console.log(text.substring(Math.max(0, text.length - 3000)));
        break;
      }
    }
  } catch(e) {
    console.error('ERR:', e.statusCode, e.serviceCode, (e.message||'').substring(0, 500));
  }
}
main().catch(e => console.error(e.message));

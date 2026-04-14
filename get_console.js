const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const computeClient = new oci.core.ComputeClient({authenticationDetailsProvider: provider});
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  const result = await computeClient.getConsoleHistory({instanceConsoleHistoryId: instanceId}).catch(()=>null);
  // Try captureConsoleHistory first
  const capture = await computeClient.captureConsoleHistory({
    captureConsoleHistoryDetails: { instanceId, definedTags: {}, freeformTags: {} }
  });
  console.log('CAPTURE_ID:', capture.consoleHistory.id);
  console.log('STATE:', capture.consoleHistory.lifecycleState);
  // Wait for it
  await new Promise(r => setTimeout(r, 10000));
  const data = await computeClient.getConsoleHistoryContent({
    instanceConsoleHistoryId: capture.consoleHistory.id
  });
  const text = data.value || '';
  // Print last 2000 chars
  console.log('CONSOLE_HISTORY:');
  console.log(text.substring(Math.max(0, text.length - 2000)));
}
main().catch(e => console.error('ERR:', e.message));

const oci = require('oci-sdk');
const os = require('os'); 
const path = require('path');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const computeClient = new oci.core.ComputeClient({authenticationDetailsProvider: provider});
  const instanceId = 'ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycgokq3u2xr6lbvwbxq7de2qlqrtunmoex7zllhgzmo6jq';
  // Check instance agent config
  const inst = await computeClient.getInstance({instanceId});
  console.log('STATE:', inst.instance.lifecycleState);
  const agentConfig = inst.instance.agentConfig;
  console.log('AGENT_CONFIG:', JSON.stringify(agentConfig));
  // Check availability config
  const avail = inst.instance.availabilityConfig;
  console.log('AVAIL_CONFIG:', JSON.stringify(avail));
  // Check metadata
  const meta = inst.instance.metadata;
  if (meta && meta.user_data) {
    const ud = Buffer.from(meta.user_data, 'base64').toString('utf8');
    console.log('USER_DATA_FIRST_100:', ud.substring(0, 100));
    console.log('USER_DATA_LENGTH:', ud.length);
  } else {
    console.log('NO USER_DATA FOUND');
  }
}
main().catch(e => console.error('ERR:', e.message));

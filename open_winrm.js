const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
async function main() {
  const configPath = path.join(os.homedir(), '.oci', 'config');
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(configPath, 'DEFAULT');
  const vnClient = new oci.core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
  const subnetId = 'ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaagy5xn3npvry5dqexivhjx3att3lmacv5fvbyrj763rwpnrdwwmtq';
  const subnet = await vnClient.getSubnet({ subnetId });
  const secListId = subnet.subnet.securityListIds[0];
  const secList = await vnClient.getSecurityList({ securityListId: secListId });
  const rules = secList.securityList.ingressSecurityRules || [];
  const hasPort = (p) => rules.some(r => r.protocol === '6' && r.tcpOptions && r.tcpOptions.destinationPortRange && r.tcpOptions.destinationPortRange.min === p);
  if (!hasPort(5985)) {
    rules.push({ protocol: '6', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', tcpOptions: { destinationPortRange: { min: 5985, max: 5985 } }, description: 'WinRM debug' });
    await vnClient.updateSecurityList({ securityListId: secListId, updateSecurityListDetails: { ingressSecurityRules: rules } });
    console.log('Port 5985 opened');
  } else {
    console.log('Port 5985 already open');
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });

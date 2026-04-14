const oci = require('oci-sdk');
const os = require('os');
const path = require('path');

async function main() {
  const configPath = path.join(os.homedir(), '.oci', 'config');
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(configPath, 'DEFAULT');
  const vnClient = new oci.core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
  
  const subnetId = 'ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaagy5xn3npvry5dqexivhjx3att3lmacv5fvbyrj763rwpnrdwwmtq';
  
  // Get subnet to find security list
  const subnet = await vnClient.getSubnet({ subnetId });
  const secListId = subnet.subnet.securityListIds[0];
  console.log('Security List:', secListId);
  
  // Get current rules
  const secList = await vnClient.getSecurityList({ securityListId: secListId });
  const rules = secList.securityList.ingressSecurityRules || [];
  
  // Check if port 22 already open
  const hasPort22 = rules.some(r => r.protocol === '6' && r.tcpOptions && r.tcpOptions.destinationPortRange && r.tcpOptions.destinationPortRange.min === 22);
  if (hasPort22) {
    console.log('Port 22 already open');
    return;
  }
  
  // Add port 22 rule
  rules.push({
    protocol: '6',
    source: '0.0.0.0/0',
    sourceType: 'CIDR_BLOCK',
    tcpOptions: { destinationPortRange: { min: 22, max: 22 } },
    description: 'SSH debug test'
  });
  
  await vnClient.updateSecurityList({
    securityListId: secListId,
    updateSecurityListDetails: { ingressSecurityRules: rules }
  });
  console.log('Port 22 opened');
}
main().catch(e => { console.error(e.message); process.exit(1); });
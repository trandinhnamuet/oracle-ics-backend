const oci = require('oci-sdk');
const os = require('os'); const path = require('path');
async function main() {
  const p = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const c = new oci.core.VirtualNetworkClient({authenticationDetailsProvider:p});
  const secListId = 'ocid1.securitylist.oc1.ap-tokyo-1.aaaaaaaa3n2eqnyo6gkr734pphvv6257zsizocrrdkjdlfjgg7drgayecjka';
  const sl = await c.getSecurityList({securityListId:secListId});
  const rules = sl.securityList.ingressSecurityRules||[];
  if (!rules.some(r=>r.protocol==='6'&&r.tcpOptions&&r.tcpOptions.destinationPortRange&&r.tcpOptions.destinationPortRange.min===5985)) {
    rules.push({protocol:'6',source:'0.0.0.0/0',sourceType:'CIDR_BLOCK',tcpOptions:{destinationPortRange:{min:5985,max:5985}},description:'WinRM debug'});
    await c.updateSecurityList({securityListId:secListId,updateSecurityListDetails:{ingressSecurityRules:rules}});
    console.log('Port 5985 opened');
  } else { console.log('Port 5985 already open'); }
}
main().catch(e=>{console.error(e.message);process.exit(1);});
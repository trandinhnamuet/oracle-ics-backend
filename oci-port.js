
const oci = require("oci-sdk");
const path = require("path");
const os = require("os");
const pr = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(), ".oci", "config"), "DEFAULT");
const vn = new oci.core.VirtualNetworkClient({authenticationDetailsProvider: pr});

async function main() {
    const subnetResp = await vn.getSubnet({subnetId: "ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaqvconihyxbntwnchvf4r45q4nn7uv7v4h5xhrwo6lbuousqqyp3a"});
    const slId = subnetResp.subnet.securityListIds[0];
    
    const slResp = await vn.getSecurityList({securityListId: slId});
    const filteredRules = slResp.securityList.ingressSecurityRules.filter(r => !(r.protocol === "6" && r.tcpOptions && r.tcpOptions.destinationPortRange && r.tcpOptions.destinationPortRange.min === 5986));
    
    await vn.updateSecurityList({
        securityListId: slId,
        updateSecurityListDetails: {
            ingressSecurityRules: filteredRules,
            egressSecurityRules: slResp.securityList.egressSecurityRules
        }
    });
    console.log("Port 5986 closed");
}
main().catch(e => console.error("Error:", e.message));

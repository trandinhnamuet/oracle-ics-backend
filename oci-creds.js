
const oci = require("oci-sdk");
const path = require("path");
const os = require("os");
const p = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(), ".oci", "config"), "DEFAULT");
const c = new oci.core.ComputeClient({authenticationDetailsProvider: p});
c.getWindowsInstanceInitialCredentials({instanceId: "ocid1.instance.oc1.ap-tokyo-1.anxhiljrlgux3dycimxfbziilierfkdq5nvxmj7qz666wzpaquldqxplzuma"})
  .then(r => console.log(JSON.stringify(r.instanceCredentials)))
  .catch(e => console.error("ERROR:", e.message));

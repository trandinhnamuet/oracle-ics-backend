const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const computeClient = new oci.core.ComputeClient({authenticationDetailsProvider: provider});
  const histId = 'ocid1.consolehistory.oc1.ap-tokyo-1.anxhiljrlgux3dycnhpltyx4opi4gkeiqsdm6qf66dvau5dnnu3hhp2leqaa';
  
  // Use the httpClient from the SDK to make raw request
  const signer = new oci.common.DefaultRequestSigner(provider);
  const url = 'https://iaas.ap-tokyo-1.oraclecloud.com/20160918/instanceConsoleHistories/' + histId + '/data';
  
  const headers = {};
  const request = { method: 'GET', headers: headers, uri: url };
  await signer.signHttpRequest(request);
  
  const options = new URL(url);
  const reqOpts = {
    hostname: options.hostname,
    path: options.pathname + options.search,
    method: 'GET',
    headers: request.headers
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('LENGTH:', data.length);
        fs.writeFileSync('/tmp/console_output.txt', data);
        // Show last 3000 chars
        console.log('TAIL:');
        console.log(data.substring(Math.max(0, data.length - 3000)));
        resolve();
      });
    });
    req.on('error', e => { console.error('REQ_ERR:', e.message); reject(e); });
    req.end();
  });
}
main().catch(e => console.error(e.message));

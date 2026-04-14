const oci = require('oci-sdk');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
async function main() {
  const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(path.join(os.homedir(),'.oci','config'),'DEFAULT');
  const histId = 'ocid1.consolehistory.oc1.ap-tokyo-1.anxhiljrlgux3dycnhpltyx4opi4gkeiqsdm6qf66dvau5dnnu3hhp2leqaa';
  const apiUrl = 'https://iaas.ap-tokyo-1.oraclecloud.com/20160918/instanceConsoleHistories/' + histId + '/data';
  
  // Use SDK's httpClient
  const httpClient = new oci.common.FetchHttpClient(null, null);
  const signer = new oci.common.DefaultRequestSigner(provider);
  const httpRequest = {
    method: 'GET',
    uri: apiUrl,
    headers: new Map()
  };
  await signer.signHttpRequest(httpRequest);
  
  // Convert to native https request
  const parsedUrl = new URL(apiUrl);
  const headers = {};
  httpRequest.headers.forEach((v, k) => { headers[k] = v; });
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'GET',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('LENGTH:', data.length);
        fs.writeFileSync('/tmp/console_output.txt', data);
        console.log('TAIL:');
        console.log(data.substring(Math.max(0, data.length - 3000)));
        resolve();
      });
    });
    req.on('error', e => { console.error('ERR:', e.message); resolve(); });
    req.end();
  });
}
main().catch(e => console.error(e.message));

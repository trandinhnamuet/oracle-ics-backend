const http = require('http');
const jwt = require('jsonwebtoken');
const token = jwt.sign({sub:8,email:'admin@ics.com',role:'admin'},'jwt-secret-key-42jfwj2k',{expiresIn:'2h'});
const data = JSON.stringify({
  imageId:'ocid1.image.oc1.ap-tokyo-1.aaaaaaaahdmx5p36eqojfbaaip7ymqvu5ffvl4jomptmgmzkju2gezdpe7oq',
  shape:'VM.Standard.E4.Flex',
  ocpus:1,
  memoryInGBs:4,
  bootVolumeSizeInGBs:256
});
const opts = {
  hostname:'localhost',
  port:3002,
  path:'/vm-subscription/4da249ed-11e0-4a80-9d58-db270072608a/configure',
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Content-Length':Buffer.byteLength(data)},
  timeout:120000
};
const req = http.request(opts, res => {
  let b='';
  res.on('data',c=>b+=c);
  res.on('end',()=>console.log('STATUS:',res.statusCode,'\nBODY:',b));
});
req.on('error',e=>console.error('ERR:',e.message));
req.write(data);
req.end();

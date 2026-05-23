const https = require('https');
const http = require('http');

async function makeRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  try {
    console.log('Testing backend connectivity...');
    const result = await makeRequest('POST', 'http://localhost:3000/api/auth/login', {
      email: 'admin@test.com',
      password: 'test123'
    });
    console.log('Backend response:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();

const http = require('http');

function postJSON(path, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function patchJSON(path, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1' + path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJSON(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1' + path,
      method: 'GET',
      headers: {}
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    // 1. Login as brownbox (Supervisor in company 136fcde4-0ad8-42c0-9d66-12daaab4f5b4)
    console.log('Logging in...');
    const loginRes = await postJSON('/auth/login', {
      email: 'brownbox@gmail.com',
      password: 'Tata@123'
    });
    const token = loginRes.body.accessToken;
    console.log('Logged in. Token acquired:', !!token);

    // 2. Reassign alert '8992bc12-0b71-45eb-b608-4868a16a28e0' to Ashwini (Worker ID f0fee07a-5ce8-471f-a711-39eae3a7b34a)
    console.log('Reassigning alert...');
    const reassignRes = await patchJSON('/alerts/8992bc12-0b71-45eb-b608-4868a16a28e0/assign', {
      assignedToUserId: 'f0fee07a-5ce8-471f-a711-39eae3a7b34a',
      assignedToRole: 'WORKER',
      assignedToDepartment: 'Assembly Station A',
      assignedToTeam: 'Hydraulics Team',
      notes: 'Please check this reassignment immediately'
    }, token);

    console.log('Reassignment status:', reassignRes.statusCode);
    console.log('Reassignment response:', JSON.stringify(reassignRes.body, null, 2));

    // 3. Fetch alerts
    console.log('Fetching all alerts...');
    const alertsRes = await getJSON('/alerts', token);
    const targetAlert = alertsRes.body.find(a => a.id === '8992bc12-0b71-45eb-b608-4868a16a28e0');
    
    console.log('Target alert in list query result:');
    console.log(JSON.stringify(targetAlert, null, 2));
  } catch (e) {
    console.error('Error during execution:', e);
  }
}

run();

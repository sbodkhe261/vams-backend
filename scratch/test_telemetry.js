async function testTelemetry() {
  const start = Date.now();
  try {
    const res = await fetch('http://127.0.0.1:3000/api/v1/alerts/dashboard', {
      headers: {
        'x-company-id': 'b812efd9-a412-4011-9a99-b1d5e3cdae01'
      }
    });
    const duration = Date.now() - start;
    console.log('Status:', res.status, `Duration: ${duration}ms`);
    const data = await res.json();
    console.log('Telemetry Data:', data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testTelemetry();

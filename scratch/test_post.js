async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/v1/alerts/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'test',
        event_type: 'test',
        companyId: 'test',
        vin: 'test',
        defectName: 'test',
      })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();

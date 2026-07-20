async function test() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/v1/alerts/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'admin-portal',
        event_type: 'DEFECT_CREATED',
        companyId: 'b812efd9-a412-4011-9a99-b1d5e3cdae01',
        vin: 'TESTVIN123',
        defectName: 'Test Brake Defect',
        alertId: 'test-alert-id-12345',
        severity: 'CRITICAL',
        message: 'Test alert from admin dashboard'
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

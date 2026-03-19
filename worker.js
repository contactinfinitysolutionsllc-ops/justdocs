// Copyright 2025 Infinity Solutions LLC. All Rights Reserved.
// Cloudflare Worker — proxies JustDocs requests to Apps Script
// Deploy at: dash.cloudflare.com → Workers & Pages → justdocs-worker

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyqYgj0u72U_QUAyvbVkhb7T0Bc75B_TxMIbvJJZFO260GwtGjGKkUrCLmD68afQKDS/exec';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    // Forward to Apps Script
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });

      const data = await response.json();
      return json(data);

    } catch (err) {
      return json({ error: 'Failed to reach API: ' + err.message }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// ============================================================
// JustDocs AI — Cloudflare Worker
// Proxies requests to Claude API so your key stays secret
// Deploy at: https://workers.cloudflare.com (free account)
// ============================================================

const ALLOWED_ORIGIN = '*'; // Replace with your GitHub Pages URL e.g. 'https://yourusername.github.io'
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Rate limiting (simple in-memory — resets on worker restart)
const requestCounts = new Map();
const RATE_LIMIT = 10; // max requests per IP per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Basic rate limiting by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + RATE_WINDOW;
    }

    entry.count++;
    requestCounts.set(ip, entry);

    if (entry.count > RATE_LIMIT) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      });
    }

    // Parse the request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }
      });
    }

    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
      return new Response(JSON.stringify({ error: 'Invalid prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }
      });
    }

    // Call Claude API — API key stored securely in Worker environment variable
    try {
      const claudeResponse = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY, // Set this in Cloudflare dashboard
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system: `You are a professional legal document drafter. You write clear, firm, professional letters and documents for everyday people who cannot afford attorneys. 

Your documents:
- Are properly formatted with date, addresses, subject line, body, and signature block
- Use professional but accessible language
- Reference relevant laws when appropriate (FDCPA, FCRA, tenant rights, etc.)
- Are ready to send without editing
- Include [YOUR SIGNATURE] placeholder at the end
- Do NOT include legal advice disclaimers inside the document itself (the website handles that)
- Today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.error('Claude API error:', errText);
        throw new Error('Claude API error: ' + claudeResponse.status);
      }

      const claudeData = await claudeResponse.json();
      const result = claudeData.content?.[0]?.text || 'Document generation failed.';

      return new Response(JSON.stringify({ result }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Failed to generate document. Please try again.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }
      });
    }
  }
};

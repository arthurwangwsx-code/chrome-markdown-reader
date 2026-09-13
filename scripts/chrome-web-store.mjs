import { readFile } from 'node:fs/promises';
import path from 'node:path';

const required = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing Chrome Web Store environment variables: ${missing.join(', ')}`);
  process.exit(2);
}

const action = process.argv[2] ?? 'status';
const publisher = encodeURIComponent(process.env.CWS_PUBLISHER_ID);
const extension = encodeURIComponent(process.env.CWS_EXTENSION_ID);
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: process.env.CWS_CLIENT_ID, client_secret: process.env.CWS_CLIENT_SECRET, refresh_token: process.env.CWS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
});
if (!tokenResponse.ok) throw new Error(`OAuth token refresh failed: ${tokenResponse.status}`);
const { access_token: token } = await tokenResponse.json();
const auth = { Authorization: `Bearer ${token}` };
const base = `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${extension}`;

async function checked(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`Chrome Web Store API ${response.status}: ${text.slice(0, 1500)}`);
  return text ? JSON.parse(text) : {};
}

if (action === 'status') {
  console.log(JSON.stringify(await checked(await fetch(`${base}:fetchStatus`, { headers: auth })), null, 2));
} else if (action === 'upload' || action === 'publish') {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const zip = path.resolve(`releases/chrome-markdown-reader-v${pkg.version}-chrome.zip`);
  const bytes = await readFile(zip);
  const upload = await checked(await fetch(`https://chromewebstore.googleapis.com/upload/v2/publishers/${publisher}/items/${extension}:upload`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/zip' }, body: bytes,
  }));
  console.log(JSON.stringify({ upload }, null, 2));
  if (action === 'publish') {
    const published = await checked(await fetch(`${base}:publish`, { method: 'POST', headers: auth }));
    console.log(JSON.stringify({ published }, null, 2));
  }
} else {
  throw new Error('Usage: node scripts/chrome-web-store.mjs status|upload|publish');
}

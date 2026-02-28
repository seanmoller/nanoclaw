/**
 * One-time OAuth setup for Betty's Google Workspace access.
 *
 * Prerequisites:
 *   1. Create a GCP project and enable Gmail, Calendar, Tasks APIs
 *   2. Create OAuth 2.0 "Desktop application" credentials
 *   3. Download client_secret.json to data/betty/google-credentials/
 *
 * Usage:
 *   npx tsx scripts/betty-google-auth.ts
 *
 * This will open a browser for OAuth consent and save tokens to
 * data/betty/google-credentials/tokens.json
 */

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(PROJECT_ROOT, 'data', 'betty', 'google-config');
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, 'client_secret.json');
const TOKENS_PATH = path.join(CREDENTIALS_DIR, 'tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

const REDIRECT_PORT = 3847;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function httpsPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });

  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.error(`\nClient secret not found at: ${CLIENT_SECRET_PATH}`);
    console.error('\nSteps to set up:');
    console.error('  1. Go to https://console.cloud.google.com');
    console.error('  2. Create a project "NanoClaw Betty"');
    console.error('  3. Enable: Gmail API, Google Calendar API, Google Tasks API');
    console.error('  4. Create OAuth 2.0 credentials (Desktop application)');
    console.error(`  5. Download client_secret.json to ${CREDENTIALS_DIR}/`);
    console.error('  6. Run this script again');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8'));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  // Build authorization URL
  const authParams = new URLSearchParams({
    client_id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

  console.log('\nOpening browser for Google OAuth consent...');
  console.log(`\nIf the browser doesn't open, visit this URL:\n${authUrl}\n`);

  exec(`open "${authUrl}"`);

  // Start local server to receive the OAuth callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        reject(new Error(`OAuth error: ${error}`));
        server.close();
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
        resolve(authCode);
        server.close();
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Waiting for OAuth callback on port ${REDIRECT_PORT}...`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });

  // Exchange code for tokens
  console.log('Exchanging authorization code for tokens...');
  const tokenParams = new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await httpsPost('https://oauth2.googleapis.com/token', tokenParams.toString());
  const tokens = JSON.parse(response);

  if (tokens.error) {
    console.error(`Token exchange failed: ${tokens.error} — ${tokens.error_description}`);
    process.exit(1);
  }

  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + '\n');
  console.log(`\nTokens saved to: ${TOKENS_PATH}`);
  console.log('\nBetty Google Workspace setup complete!');
  console.log('Scopes authorized:');
  for (const scope of SCOPES) {
    console.log(`  - ${scope}`);
  }
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

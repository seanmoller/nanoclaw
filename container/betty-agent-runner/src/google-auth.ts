/**
 * Google OAuth token management for Betty.
 * Loads credentials and tokens from mounted volume.
 */

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CREDENTIALS_DIR = '/workspace/extra/betty-config';
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, 'client_secret.json');
const TOKENS_PATH = path.join(CREDENTIALS_DIR, 'tokens.json');

let cachedAuth: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getAuth(): InstanceType<typeof google.auth.OAuth2> | null {
  if (cachedAuth) return cachedAuth;

  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    log('Google credentials not found at ' + CLIENT_SECRET_PATH);
    return null;
  }

  if (!fs.existsSync(TOKENS_PATH)) {
    log('Google tokens not found at ' + TOKENS_PATH);
    return null;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8'));
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));

    const { client_id, client_secret, redirect_uris } =
      credentials.installed || credentials.web;

    const auth = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob',
    );

    auth.setCredentials(tokens);

    // Auto-refresh tokens and save them back
    auth.on('tokens', (newTokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
      const merged = { ...existing, ...newTokens };
      fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2) + '\n');
      log('Google tokens refreshed and saved');
    });

    cachedAuth = auth;
    return auth;
  } catch (err) {
    log(`Failed to initialize Google auth: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function log(message: string): void {
  console.error(`[google-auth] ${message}`);
}

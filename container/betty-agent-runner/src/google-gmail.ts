/**
 * Gmail API tools for Betty.
 */

import { google } from 'googleapis';
import { getAuth } from './google-auth.js';

export async function gmailRead(maxResults = 10): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured. Ask the user to run the setup script.';

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return 'No messages in inbox.';

    const results: string[] = [];
    for (const msg of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find((h) => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';

      results.push(`From: ${from}\nSubject: ${subject}\nDate: ${date}\nPreview: ${snippet}\n`);
    }

    return results.join('\n---\n');
  } catch (err) {
    return `Gmail error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function gmailSend(to: string, subject: string, body: string): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
    ).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return `Email sent to ${to} with subject "${subject}".`;
  } catch (err) {
    return `Gmail send error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

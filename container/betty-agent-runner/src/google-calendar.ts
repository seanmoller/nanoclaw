/**
 * Google Calendar API tools for Betty.
 */

import { google } from 'googleapis';
import { getAuth } from './google-auth.js';

export async function calendarList(maxResults = 10): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];
    if (events.length === 0) return 'No upcoming events.';

    return events.map((event) => {
      const start = event.start?.dateTime || event.start?.date || '';
      const end = event.end?.dateTime || event.end?.date || '';
      return `- ${event.summary || '(untitled)'}\n  When: ${start} → ${end}${event.location ? `\n  Where: ${event.location}` : ''}`;
    }).join('\n');
  } catch (err) {
    return `Calendar error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function calendarCreate(
  summary: string,
  startTime: string,
  endTime: string,
  description?: string,
  location?: string,
): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        location,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });

    return `Event created: "${summary}" on ${startTime}. Link: ${event.data.htmlLink || 'N/A'}`;
  } catch (err) {
    return `Calendar create error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

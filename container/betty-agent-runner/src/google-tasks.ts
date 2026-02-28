/**
 * Google Tasks API tools for Betty.
 */

import { google } from 'googleapis';
import { getAuth } from './google-auth.js';

/**
 * Get the default task list ID.
 */
async function getDefaultTaskListId(): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;

  const tasks = google.tasks({ version: 'v1', auth });
  const res = await tasks.tasklists.list({ maxResults: 1 });
  return res.data.items?.[0]?.id || null;
}

export async function tasksList(maxResults = 20): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const tasks = google.tasks({ version: 'v1', auth });

  try {
    const listId = await getDefaultTaskListId();
    if (!listId) return 'No task list found.';

    const res = await tasks.tasks.list({
      tasklist: listId,
      maxResults,
      showCompleted: false,
    });

    const items = res.data.items || [];
    if (items.length === 0) return 'No pending tasks.';

    return items.map((item) => {
      const due = item.due ? ` (due: ${item.due})` : '';
      const notes = item.notes ? `\n  Notes: ${item.notes}` : '';
      return `- ${item.title || '(untitled)'}${due}${notes}`;
    }).join('\n');
  } catch (err) {
    return `Tasks error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function tasksCreate(
  title: string,
  notes?: string,
  due?: string,
): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const tasks = google.tasks({ version: 'v1', auth });

  try {
    const listId = await getDefaultTaskListId();
    if (!listId) return 'No task list found.';

    const task = await tasks.tasks.insert({
      tasklist: listId,
      requestBody: {
        title,
        notes,
        due: due ? new Date(due).toISOString() : undefined,
      },
    });

    return `Task created: "${task.data.title}"${due ? ` (due: ${due})` : ''}`;
  } catch (err) {
    return `Tasks create error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function tasksComplete(title: string): Promise<string> {
  const auth = getAuth();
  if (!auth) return 'Google credentials not configured.';

  const tasks = google.tasks({ version: 'v1', auth });

  try {
    const listId = await getDefaultTaskListId();
    if (!listId) return 'No task list found.';

    // Find the task by title
    const res = await tasks.tasks.list({
      tasklist: listId,
      showCompleted: false,
    });

    const items = res.data.items || [];
    const match = items.find(
      (item) => item.title?.toLowerCase() === title.toLowerCase(),
    );

    if (!match || !match.id) {
      return `Task not found: "${title}". Available tasks: ${items.map((i) => i.title).join(', ')}`;
    }

    await tasks.tasks.patch({
      tasklist: listId,
      task: match.id,
      requestBody: { status: 'completed' },
    });

    return `Task completed: "${title}"`;
  } catch (err) {
    return `Tasks complete error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

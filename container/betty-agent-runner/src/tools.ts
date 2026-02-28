/**
 * Tool definitions and execution for Betty.
 * Provides filesystem, messaging, and Google Workspace tools.
 */

import fs from 'fs';
import path from 'path';

import { gmailRead, gmailSend } from './google-gmail.js';
import { calendarList, calendarCreate } from './google-calendar.js';
import { tasksList, tasksCreate, tasksComplete } from './google-tasks.js';

const WORKSPACE_ROOT = '/workspace/group';
const IPC_MESSAGES_DIR = '/workspace/ipc/messages';

/**
 * OpenAI-compatible tool definitions for function calling.
 */
export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace. Path is relative to /workspace/group/.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path within workspace' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Create or update a file in the workspace. Path is relative to /workspace/group/.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path within workspace' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files in a workspace directory. Path is relative to /workspace/group/.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path (default: root)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_message',
      description: 'Send a WhatsApp message immediately via IPC. Use for proactive notifications.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Message text to send' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gmail_read',
      description: 'Read recent emails from Gmail inbox.',
      parameters: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Number of emails to fetch (default: 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gmail_send',
      description: 'Send an email via Gmail.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text)' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calendar_list',
      description: 'List upcoming events from Google Calendar.',
      parameters: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Number of events to fetch (default: 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calendar_create',
      description: 'Create a new Google Calendar event.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Event title' },
          start_time: { type: 'string', description: 'Start time in ISO 8601 format' },
          end_time: { type: 'string', description: 'End time in ISO 8601 format' },
          description: { type: 'string', description: 'Event description' },
          location: { type: 'string', description: 'Event location' },
        },
        required: ['summary', 'start_time', 'end_time'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tasks_list',
      description: 'List pending tasks from Google Tasks (grocery lists, to-dos, etc.).',
      parameters: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Number of tasks to fetch (default: 20)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tasks_create',
      description: 'Create a new task in Google Tasks.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          notes: { type: 'string', description: 'Task notes/details' },
          due: { type: 'string', description: 'Due date (ISO 8601 or natural like "2024-03-15")' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tasks_complete',
      description: 'Mark a task as completed in Google Tasks.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Exact title of the task to complete' },
        },
        required: ['title'],
      },
    },
  },
];

/**
 * Execute a tool call and return the result string.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  chatJid: string,
): Promise<string> {
  try {
    switch (name) {
      case 'read_file':
        return readFile(args.path as string);
      case 'write_file':
        return writeFile(args.path as string, args.content as string);
      case 'list_files':
        return listFiles((args.path as string) || '.');
      case 'send_message':
        return sendIpcMessage(args.text as string, chatJid);
      case 'gmail_read':
        return await gmailRead((args.max_results as number) || 10);
      case 'gmail_send':
        return await gmailSend(
          args.to as string,
          args.subject as string,
          args.body as string,
        );
      case 'calendar_list':
        return await calendarList((args.max_results as number) || 10);
      case 'calendar_create':
        return await calendarCreate(
          args.summary as string,
          args.start_time as string,
          args.end_time as string,
          args.description as string | undefined,
          args.location as string | undefined,
        );
      case 'tasks_list':
        return await tasksList((args.max_results as number) || 20);
      case 'tasks_create':
        return await tasksCreate(
          args.title as string,
          args.notes as string | undefined,
          args.due as string | undefined,
        );
      case 'tasks_complete':
        return await tasksComplete(args.title as string);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error (${name}): ${err instanceof Error ? err.message : String(err)}`;
  }
}

// --- Filesystem tools ---

function resolveSafePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal blocked: path must be within workspace');
  }
  return resolved;
}

function readFile(filePath: string): string {
  const resolved = resolveSafePath(filePath);
  if (!fs.existsSync(resolved)) {
    return `File not found: ${filePath}`;
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function writeFile(filePath: string, content: string): string {
  const resolved = resolveSafePath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
  return `File written: ${filePath}`;
}

function listFiles(dirPath: string): string {
  const resolved = resolveSafePath(dirPath);
  if (!fs.existsSync(resolved)) {
    return `Directory not found: ${dirPath}`;
  }
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  return entries
    .map((e) => `${e.isDirectory() ? '[dir] ' : ''}${e.name}`)
    .join('\n') || '(empty directory)';
}

// --- IPC messaging ---

function sendIpcMessage(text: string, chatJid: string): string {
  fs.mkdirSync(IPC_MESSAGES_DIR, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filePath = path.join(IPC_MESSAGES_DIR, filename);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ type: 'message', chatJid, text }),
  );
  return `Message queued for delivery.`;
}

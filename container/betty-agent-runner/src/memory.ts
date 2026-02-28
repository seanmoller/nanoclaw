/**
 * Conversation history management for Betty.
 * Stores messages in JSONL format, loads last N for context.
 */

import fs from 'fs';
import path from 'path';

export interface HistoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  timestamp: string;
}

const HISTORY_FILE = '/workspace/group/memory/conversation-history.jsonl';
const MAX_HISTORY_MESSAGES = 50;

export function loadHistory(): HistoryMessage[] {
  const dir = path.dirname(HISTORY_FILE);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(HISTORY_FILE)) return [];

  const lines = fs.readFileSync(HISTORY_FILE, 'utf-8').trim().split('\n');
  const messages: HistoryMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  // Return the last N messages for context window management
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

export function appendHistory(message: HistoryMessage): void {
  const dir = path.dirname(HISTORY_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(message) + '\n');
}

/**
 * Convert history messages to OpenAI-compatible format.
 */
export function historyToOpenAI(
  messages: HistoryMessage[],
): Array<{ role: string; content: string; name?: string; tool_call_id?: string; tool_calls?: unknown[] }> {
  return messages.map((m) => {
    const msg: { role: string; content: string; name?: string; tool_call_id?: string; tool_calls?: unknown[] } = {
      role: m.role,
      content: m.content,
    };
    if (m.name) msg.name = m.name;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    return msg;
  });
}

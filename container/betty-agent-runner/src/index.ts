/**
 * Betty Agent Runner
 * Qwen-based assistant running inside a NanoClaw container.
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages as JSON files in /workspace/ipc/input/
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Must match NanoClaw's container-runner.ts parsing.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

import { toolDefinitions, executeTool } from './tools.js';
import { loadHistory, appendHistory, historyToOpenAI, HistoryMessage } from './memory.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

const MAX_TOOL_ROUNDS = 15;

/**
 * Strip Qwen's chain-of-thought <think>...</think> blocks from responses.
 */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[betty-runner] ${message}`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function loadSystemPrompt(assistantName?: string): string {
  const claudeMdPath = '/workspace/group/CLAUDE.md';
  let systemPrompt = '';

  if (fs.existsSync(claudeMdPath)) {
    systemPrompt = fs.readFileSync(claudeMdPath, 'utf-8');
  } else {
    systemPrompt = `You are ${assistantName || 'Betty'}, a friendly and helpful assistant. You help with grocery lists, calendar events, emails, notes, and reminders. Be concise and helpful.`;
  }

  // Add formatting instructions
  systemPrompt += `\n\nFormatting rules:
- Use WhatsApp-compatible formatting: *bold*, _italic_, ~strikethrough~, \`\`\`code\`\`\`
- Keep responses concise — this is WhatsApp, not email
- Use bullet points and line breaks for lists
- Current date/time: ${new Date().toISOString()}`;

  return systemPrompt;
}

/**
 * Run a single conversation turn with tool calling loop.
 */
async function runConversation(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userMessage: string,
  chatJid: string,
): Promise<string> {
  // Load history and add the new user message
  const history = loadHistory();
  const userEntry: HistoryMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  appendHistory(userEntry);
  history.push(userEntry);

  // Build messages array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...historyToOpenAI(history) as OpenAI.Chat.ChatCompletionMessageParam[],
  ];

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    log(`Calling Qwen (round ${rounds}, ${messages.length} messages)...`);

    const response = await client.chat.completions.create({
      model,
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    if (!choice) {
      return 'No response from model.';
    }

    const assistantMessage = choice.message;

    // Add assistant message to conversation
    messages.push(assistantMessage);

    // If no tool calls, we have the final text response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const text = stripThinkTags(assistantMessage.content || '');

      // Save to history
      appendHistory({
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      });

      return text;
    }

    // Execute tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown>;
      try {
        fnArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        fnArgs = {};
      }

      log(`Tool call: ${fnName}(${JSON.stringify(fnArgs).slice(0, 200)})`);
      const result = await executeTool(fnName, fnArgs, chatJid);
      log(`Tool result: ${result.slice(0, 200)}`);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Check finish reason
    if (choice.finish_reason === 'stop') {
      const text = stripThinkTags(assistantMessage.content || '');
      appendHistory({
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      });
      return text;
    }
  }

  return 'Reached maximum tool call rounds. Please try a simpler request.';
}

// --- IPC helpers (same protocol as agent-runner) ---

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

// --- Main ---

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  // Extract Qwen connection details from secrets
  const secrets = containerInput.secrets || {};
  const apiBase = secrets.QWEN_API_BASE || 'http://192.168.65.1:11434/v1';
  const model = secrets.QWEN_MODEL || 'qwen3.5';

  const client = new OpenAI({
    baseURL: apiBase,
    apiKey: 'not-needed', // Local models don't need a key
  });

  const sessionId = `betty-${Date.now()}`;
  const systemPrompt = loadSystemPrompt(containerInput.assistantName);

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  // Clean up stale _close sentinel
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Query loop: run conversation → wait for IPC message → repeat
  try {
    while (true) {
      log(`Processing message (${prompt.length} chars)...`);

      const response = await runConversation(client, model, systemPrompt, prompt, containerInput.chatJid);

      writeOutput({
        status: 'success',
        result: response || null,
        newSessionId: sessionId,
      });

      // Check for close during processing
      if (shouldClose()) {
        log('Close sentinel detected after processing, exiting');
        break;
      }

      // Emit session update marker
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Waiting for next IPC message...');
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars)`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();

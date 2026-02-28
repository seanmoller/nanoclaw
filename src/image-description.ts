import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';

import { readEnvFile } from './env.js';

const VISION_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 300;
const SYSTEM_PROMPT =
  'Describe this food photo for calorie estimation. List specific items with estimated portion sizes and cooking methods. Be concise.';
const FALLBACK_MESSAGE = '[Photo - description unavailable]';

async function describeWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const env = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set in .env');
    return null;
  }

  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  try {
    const openaiModule = await import('openai');
    const OpenAI = openaiModule.default;

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
            {
              type: 'text',
              text: 'What food is in this photo?',
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error('OpenAI Vision API call failed:', err);
    return null;
  }
}

export async function describeImageMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      console.error('Failed to download image message');
      return FALLBACK_MESSAGE;
    }

    const mimeType = msg.message?.imageMessage?.mimetype || 'image/jpeg';
    console.log(
      `Downloaded image message: ${buffer.length} bytes (${mimeType})`,
    );

    const description = await describeWithOpenAI(buffer, mimeType);

    if (!description) {
      return FALLBACK_MESSAGE;
    }

    return description.trim();
  } catch (err) {
    console.error('Image description error:', err);
    return FALLBACK_MESSAGE;
  }
}

export function isImageMessage(msg: WAMessage): boolean {
  return !!msg.message?.imageMessage;
}

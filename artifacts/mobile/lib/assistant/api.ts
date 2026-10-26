import { fetch as expoFetch } from 'expo/fetch';
import type { AssistantSettings } from '@/lib/assistant/types';

function apiUrl(path: string) {
  // On web (Cloudflare Pages, Netlify, or local static preview), the API is a same-origin
  // route under /api/*, so prefer window.location.origin.
  if (
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    window.location.origin.startsWith('http')
  ) {
    return `${window.location.origin}/api${path}`;
  }
  // Native builds and custom clients reach a separately deployed domain.
  // EAS/native APK builds do not have window.location. Use the live Netlify
  // deployment as a safe default so preview APKs can reach the same-origin API.
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim() || 'badboy007.netlify.app';
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  return `${baseUrl.replace(/\/$/, '')}/api${path}`;
}

export async function streamReply(
  message: string,
  settings: AssistantSettings,
  onChunk: (chunk: string) => void,
) {
  const response = await expoFetch(apiUrl('/assistant/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      personality: settings.personality,
      developerMode: settings.developerMode,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(
      body.error ??
        `The assistant could not reply right now (HTTP ${response.status}).`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('The assistant response stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;

  while (!complete) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') {
        complete = true;
        break;
      }
      const event = JSON.parse(payload) as { content?: string; error?: string };
      if (event.error) throw new Error(event.error);
      if (event.content) onChunk(event.content);
    }
  }
}

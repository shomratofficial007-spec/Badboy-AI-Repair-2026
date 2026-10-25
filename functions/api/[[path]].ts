// Cloudflare Pages Function: /api/* routes backed by OpenRouter.
// Directs /api/assistant/chat requests to OpenRouter with streaming SSE.

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_ID = "nvidia/nemotron-3.5-lightning:free";

interface Env {
  OPENROUTER_API_KEY?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function systemInstruction(personality: string, developerMode: boolean) {
  const base =
    "You are JARVIS, a highly intelligent, polite personal AI assistant. Always reply strictly in Bangla (Bengali) language by default. Never respond in Portuguese, Spanish, or any unintended language. If the user explicitly speaks or requests English, you may reply in English. Be clear, precise, helpful, and natural in tone. Never pretend to perform physical or external device actions that are not supported. Ask before sensitive data changes or external actions.";
  const developer =
    "Developer Mode Enabled: Assist the user in building, refining, and debugging their Voice Memory Assistant. Provide clear code snippets, bug diagnoses, and step-by-step instructions. Respect safety, authentication, and data privacy.";
  const custom = personality.trim().slice(0, 1000);
  return [base, developerMode ? developer : "", custom]
    .filter(Boolean)
    .join("\n\n");
}

function extractDeltas(event: string): { texts: string[]; done: boolean } {
  const texts: string[] = [];
  let done = false;
  for (const line of event.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) texts.push(delta);
    } catch {
      // Ignore malformed chunks
    }
  }
  return { texts, done };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/\/+$/, "");
  console.log(`[CF Request] GET ${pathname}`);
  if (pathname === "/api/healthz" || pathname === "/api/health") {
    return jsonResponse({ status: "ok" });
  }
  return jsonResponse({ error: "Endpoint not found." }, 404);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/\/+$/, "");
  console.log(`[CF Request] POST ${pathname}`);
  if (pathname !== "/api/assistant/chat") {
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid assistant message body." }, 400);
  }

  const { message, personality = "", developerMode = false } = (body ?? {}) as {
    message?: unknown;
    personality?: unknown;
    developerMode?: unknown;
  };

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > 4000 ||
    typeof personality !== "string" ||
    typeof developerMode !== "boolean"
  ) {
    return jsonResponse({ error: "Invalid assistant message payload." }, 400);
  }

  const apiKey = context.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    console.error("[CF Function Error] OPENROUTER_API_KEY is missing from environment bindings.");
    return jsonResponse(
      {
        code: "AI_NOT_CONFIGURED",
        error:
          "Add OPENROUTER_API_KEY to your Cloudflare environment variables to activate AI chat.",
      },
      503
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "JARVIS Voice Memory Assistant",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL_ID,
        max_tokens: 8192,
        messages: [
          {
            role: "system",
            content: systemInstruction(personality, developerMode),
          },
          { role: "user", content: message.trim() },
        ],
        stream: true,
      }),
    });
  } catch (err) {
    console.error("[CF Function Error] OpenRouter fetch failed:", err instanceof Error ? err.message : String(err));
    return jsonResponse(
      {
        code: "OPENROUTER_REQUEST_FAILED",
        error: "OpenRouter service could not be reached. Check network connection.",
      },
      502
    );
  }

  if (upstream.status === 429) {
    console.error("[CF Function Error] OpenRouter rate limit (429) reached.");
    return jsonResponse(
      {
        code: "OPENROUTER_RATE_LIMIT",
        error: "OpenRouter model rate limit reached. Please wait a moment and try again.",
      },
      429
    );
  }

  if (!upstream.ok || !upstream.body) {
    let errorText = "";
    try {
      errorText = await upstream.text();
    } catch {
      // Ignore text read failure
    }
    console.error(`[CF Function Error] OpenRouter upstream returned status ${upstream.status}: ${errorText.slice(0, 300)}`);
    return jsonResponse(
      {
        code: "OPENROUTER_REQUEST_FAILED",
        error: `OpenRouter error (${upstream.status}). Please try again later.`,
      },
      502
    );
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let pending = "";
      const send = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          pending = pending.replace(/\r\n/g, "\n");
          let boundary = pending.indexOf("\n\n");
          while (boundary >= 0) {
            const event = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const { texts, done: streamDone } = extractDeltas(event);
            for (const content of texts) send(JSON.stringify({ content }));
            if (streamDone) {
              send("[DONE]");
              controller.close();
              reader.releaseLock();
              return;
            }
            boundary = pending.indexOf("\n\n");
          }
        }
        pending += decoder.decode();
        if (pending.trim()) {
          const { texts } = extractDeltas(pending);
          for (const content of texts) send(JSON.stringify({ content }));
        }
        send("[DONE]");
        controller.close();
      } catch (streamErr) {
        console.error("[CF Function Error] Stream reading interrupted:", streamErr instanceof Error ? streamErr.message : String(streamErr));
        try {
          send(
            JSON.stringify({
              error: "OpenRouter stream interrupted.",
            })
          );
          controller.close();
        } catch {
          // Closed
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Released
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      ...CORS_HEADERS,
    },
  });
};

export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext?: { waitUntil: (promise: Promise<unknown>) => void }
  ): Promise<Response> {
    const context = {
      request,
      env,
      params: {},
      waitUntil: executionContext?.waitUntil
        ? executionContext.waitUntil.bind(executionContext)
        : () => {},
      next: async () => jsonResponse({ error: "Endpoint not found." }, 404),
      data: {},
    };

    if (request.method === "OPTIONS") {
      return onRequestOptions(context as any);
    }
    if (request.method === "GET") {
      return onRequestGet(context as any);
    }
    if (request.method === "POST") {
      return onRequestPost(context as any);
    }
    return jsonResponse({ error: "Method not allowed." }, 405);
  },
};

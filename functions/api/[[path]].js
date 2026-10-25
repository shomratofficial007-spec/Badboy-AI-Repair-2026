// Cloudflare Pages Function: /api/* routes backed by OpenRouter.
// Directs /api/assistant/chat requests to OpenRouter with streaming SSE.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_ID = "nvidia/nemotron-3.5-lightning:free";
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
        },
    });
}
function systemInstruction(personality, developerMode) {
    const base = "You are Badboy, a highly intelligent, polite personal AI assistant. Always reply strictly in Bangla (Bengali) language by default. Never respond in Portuguese, Spanish, or any unintended language. If the user explicitly speaks or requests English, you may reply in English. Be clear, precise, helpful, and natural in tone. When the user asks to play a song or open YouTube, confirm politely in Bangla and state that YouTube search will open on their device. Never claim that music or video is playing inside the chat unless verified. Ask before sensitive data changes or external actions.";
    const developer = "Developer Mode Enabled: Assist the user in building, refining, and executing feature development for their Voice Memory Assistant. Parse feature requests (e.g. 'Badboy, add a new reminder feature to yourself' or 'ব্যাডবয়, একটি নতুন ফিচারের প্রস্তাব কোড করো'), generate structured step-by-step development plans, detail file paths to create or modify, write clean TS/TSX code, outline tests/typechecks, and guide GitHub branch & Pull Request workflows without claiming unverified PR creation or automatic production deployments.";
    const custom = personality.trim().slice(0, 1000);
    return [base, developerMode ? developer : "", custom]
        .filter(Boolean)
        .join("\n\n");
}
function extractDeltas(event) {
    const texts = [];
    let done = false;
    for (const line of event.split("\n")) {
        if (!line.startsWith("data:"))
            continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
            done = true;
            continue;
        }
        if (!data)
            continue;
        try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0)
                texts.push(delta);
        }
        catch {
            // Ignore malformed chunks
        }
    }
    return { texts, done };
}
export async function handleApiRequest(request, env) {
    const url = new URL(request.url);
    const rawPathname = url.pathname.replace(/\/+$/, "");
    const pathname = rawPathname.startsWith("/api")
        ? rawPathname
        : `/api${rawPathname.startsWith("/") ? rawPathname : `/${rawPathname}`}`;
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method === "GET") {
        if (pathname === "/api/healthz" || pathname === "/api/health") {
            return jsonResponse({ status: "ok" });
        }
        return jsonResponse({ error: "Endpoint not found." }, 404);
    }
    if (request.method !== "POST" || pathname !== "/api/assistant/chat") {
        return jsonResponse({ error: "Endpoint not found." }, 404);
    }
    let body;
    try {
        body = await request.json();
    }
    catch {
        return jsonResponse({ error: "Invalid assistant message body." }, 400);
    }
    const { message, personality = "", developerMode = false } = (body ?? {});
    if (typeof message !== "string" ||
        message.trim().length === 0 ||
        message.length > 4000 ||
        typeof personality !== "string" ||
        typeof developerMode !== "boolean") {
        return jsonResponse({ error: "Invalid assistant message payload." }, 400);
    }
    const apiKey = env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
        console.error("[CF Function Error] OPENROUTER_API_KEY is missing from environment bindings.");
        return jsonResponse({
            code: "AI_NOT_CONFIGURED",
            error: "Add OPENROUTER_API_KEY to your Cloudflare environment variables to activate AI chat.",
        }, 503);
    }
    let upstream;
    try {
        upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-Title": "Badboy Voice Memory Assistant",
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
    }
    catch (err) {
        console.error("[CF Function Error] OpenRouter fetch failed:", err instanceof Error ? err.message : String(err));
        return jsonResponse({
            code: "OPENROUTER_REQUEST_FAILED",
            error: "OpenRouter service could not be reached. Check network connection.",
        }, 502);
    }
    if (upstream.status === 429) {
        console.error("[CF Function Error] OpenRouter rate limit (429) reached.");
        return jsonResponse({
            code: "OPENROUTER_RATE_LIMIT",
            error: "OpenRouter model rate limit reached. Please wait a moment and try again.",
        }, 429);
    }
    if (!upstream.ok || !upstream.body) {
        let errorText = "";
        try {
            errorText = await upstream.text();
        }
        catch {
            // Ignore text read failure
        }
        console.error(`[CF Function Error] OpenRouter upstream returned status ${upstream.status}: ${errorText.slice(0, 300)}`);
        return jsonResponse({
            code: "OPENROUTER_REQUEST_FAILED",
            error: `OpenRouter error (${upstream.status}). Please try again later.`,
        }, 502);
    }
    const encoder = new TextEncoder();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
        async start(controller) {
            let pending = "";
            const send = (payload) => controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    pending += decoder.decode(value, { stream: true });
                    pending = pending.replace(/\r\n/g, "\n");
                    let boundary = pending.indexOf("\n\n");
                    while (boundary >= 0) {
                        const event = pending.slice(0, boundary);
                        pending = pending.slice(boundary + 2);
                        const { texts, done: streamDone } = extractDeltas(event);
                        for (const content of texts)
                            send(JSON.stringify({ content }));
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
                    for (const content of texts)
                        send(JSON.stringify({ content }));
                }
                send("[DONE]");
                controller.close();
            }
            catch (streamErr) {
                console.error("[CF Function Error] Stream reading interrupted:", streamErr instanceof Error ? streamErr.message : String(streamErr));
                try {
                    send(JSON.stringify({
                        error: "OpenRouter stream interrupted.",
                    }));
                    controller.close();
                }
                catch {
                    // Closed
                }
            }
            finally {
                try {
                    reader.releaseLock();
                }
                catch {
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
}
export const onRequestOptions = async (context) => {
    return handleApiRequest(context.request, context.env);
};
export const onRequestGet = async (context) => {
    return handleApiRequest(context.request, context.env);
};
export const onRequestPost = async (context) => {
    return handleApiRequest(context.request, context.env);
};
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/api/") ||
            url.pathname === "/api" ||
            url.pathname.startsWith("/assistant/") ||
            url.pathname === "/healthz" ||
            url.pathname === "/health") {
            return handleApiRequest(request, env);
        }
        const assets = env.ASSETS;
        if (assets) {
            return assets.fetch(request);
        }
        return new Response("Not Found", { status: 404 });
    },
};

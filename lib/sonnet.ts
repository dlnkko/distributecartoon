import { getSecrets } from "./config";

export const SONNET_MODEL = "claude-sonnet-5-5";

type ContentBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
};

export type SonnetMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

function headers(apiKey: string) {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim() || "wrkspc_0129j5LedZdN7uikpR2QLKMc";
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-workspace-id": workspaceId,
  };
}

async function postSonnet(body: Record<string, unknown>, signal: AbortSignal | undefined, effort: boolean) {
  const { claudeApiKey } = getSecrets();
  if (!claudeApiKey) throw new Error("CLAUDE_API_KEY is missing.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: headers(claudeApiKey),
    body: JSON.stringify({
      model: SONNET_MODEL,
      ...body,
      ...(effort ? { output_config: { effort: "high" } } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    content?: ContentBlock[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Sonnet failed (${response.status}).`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload?.content || [];
}

async function postWithFallback(body: Record<string, unknown>, signal?: AbortSignal) {
  try {
    return await postSonnet(body, signal, true);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    const message = error instanceof Error ? error.message : "";
    if (status === 400 && /output_config|effort/i.test(message)) return postSonnet(body, signal, false);
    throw error;
  }
}

export async function sonnetText(system: string, user: string, options?: { maxTokens?: number; signal?: AbortSignal }) {
  const content = await postWithFallback(
    {
      max_tokens: options?.maxTokens ?? 8000,
      system,
      messages: [{ role: "user", content: user }],
    },
    options?.signal,
  );
  return content
    .filter((block) => block.type === "text" && block.text?.trim())
    .map((block) => block.text?.trim() || "")
    .join("\n")
    .trim();
}

export async function sonnetTools(options: {
  system: string;
  messages: SonnetMessage[];
  tools: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  maxTokens?: number;
  signal?: AbortSignal;
  forceTool?: boolean;
}) {
  const content = await postWithFallback(
    {
      max_tokens: options.maxTokens ?? 32000,
      system: options.system,
      tools: options.tools,
      ...(options.forceTool ? { tool_choice: { type: "any" } } : {}),
      messages: options.messages,
    },
    options.signal,
  );
  const toolUses = content
    .filter((block) => block.type === "tool_use" && block.name && block.id)
    .map((block) => ({
      id: block.id || "",
      name: block.name || "",
      input: block.input && typeof block.input === "object" ? (block.input as Record<string, unknown>) : {},
    }));
  return { content, toolUses };
}

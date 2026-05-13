const OLLAMA_BASE = 'http://localhost:11434';

export const OLLAMA_CHAT_MODEL = 'llama3.2';
export const OLLAMA_EMBED_MODEL = 'nomic-embed-text';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function ollamaChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_CHAT_MODEL, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    throw new Error(
      `Ollama error ${res.status}: ${res.statusText}. Is Ollama running? Try: ollama serve`
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        if (json.message?.content) onChunk(json.message.content);
      } catch {
        // skip malformed chunk
      }
    }
  }
}

export async function ollamaEmbed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embed error ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

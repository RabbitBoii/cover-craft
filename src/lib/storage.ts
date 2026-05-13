import type { SavedCover, SearchResult } from '../types';

const STORAGE_KEY = 'cc_covers';

export function loadCovers(): SavedCover[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedCover[]) : [];
  } catch {
    return [];
  }
}

export function saveCover(cover: SavedCover): void {
  const covers = loadCovers();
  covers.unshift(cover); // newest first
  localStorage.setItem(STORAGE_KEY, JSON.stringify(covers));
}

export function deleteCover(id: string): void {
  const covers = loadCovers().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(covers));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchCovers(queryEmbedding: number[], topK = 10): SearchResult[] {
  return loadCovers()
    .map((cover) => ({ ...cover, score: cosineSimilarity(queryEmbedding, cover.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

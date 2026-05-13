export interface Mode {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export type TabId = 'setup' | 'generate' | 'output' | 'history';

export type EmbedStatus = 'idle' | 'embedding' | 'done' | 'error';

export interface SavedCover {
  id: string;
  jobTitle: string;
  company: string;
  mode: string;
  modeLabel: string;
  text: string;
  embedding: number[];
  createdAt: string;
  wordCount: number;
}

export interface SearchResult extends SavedCover {
  score: number;
}

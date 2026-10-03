import type { SearchHit } from './types';
const grams = (text: string) => {
  const result = new Set<string>();
  for (let i = 0; i + 2 < text.length; i++) result.add(text.slice(i, i + 3));
  return result;
};

/** Local snapshot index. No network or graph traversal in the keystroke path. */
export class SearchIndex {
  private rows: (SearchHit & { folded: string })[];
  private postings = new Map<string, Set<number>>();
  private pages: number[] = [];
  constructor(rows: [string, string, 'page' | 'block'][]) {
    this.rows = rows.map(([uid, text, kind], i) => {
      const folded = text.toLowerCase();
      if (kind === 'page') this.pages.push(i);
      for (const gram of grams(folded)) {
        let posting = this.postings.get(gram);
        if (!posting) this.postings.set(gram, posting = new Set());
        posting.add(i);
      }
      return { uid, text, kind, score: 0, folded };
    });
  }
  get size() { return this.rows.length; }
  search(query: string, limit: number, kind: 'page' | 'block' | 'all') {
    const needle = query.trim().toLowerCase();
    let candidates: Set<number>;
    if (needle.length < 3) {
      candidates = new Set(kind === 'page' ? this.pages : this.rows.map((_, i) => i));
    } else {
      const lists = [...grams(needle)].map(g => this.postings.get(g) ?? new Set<number>()).sort((a,b) => a.size - b.size);
      candidates = new Set(lists[0]);
      for (const list of lists.slice(1)) for (const i of candidates) if (!list.has(i)) candidates.delete(i);
      // Subsequence matches need only scan titles, not every block in the graph.
      if (kind !== 'block') for (const i of this.pages) candidates.add(i);
    }
    const hits: SearchHit[] = [];
    for (const i of candidates) {
      const hit = this.rows[i]!;
      if (kind !== 'all' && hit.kind !== kind) continue;
      const at = hit.folded.indexOf(needle);
      let score = at < 0 ? 0 : hit.folded === needle ? 100 : at === 0 ? 80 : 60;
      if (!score && hit.kind === 'page') {
        let cursor = 0;
        for (const char of hit.folded) if (char === needle[cursor]) cursor++;
        if (cursor === needle.length) score = 20;
      }
      if (score) hits.push({ uid: hit.uid, text: hit.text, kind: hit.kind, score: score + (hit.kind === 'page' ? 10 : 0) });
    }
    hits.sort((a,b) => b.score - a.score || a.text.length - b.text.length || a.uid.localeCompare(b.uid));
    return { items: hits.slice(0,limit), total: hits.length };
  }
}

export type SearchDocument = { name: string; path: string; text: string };
export type SearchHit<T extends SearchDocument> = { doc: T; score: number; snippet: string };

function normalize(input: string) { return input.normalize('NFKC').toLowerCase(); }

function tokens(input: string): string[] {
  const text = normalize(input);
  const out = new Set<string>();
  for (const word of text.match(/[a-z0-9_./-]{2,}/g) ?? []) out.add(word);
  for (const block of text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []) {
    for (let i = 0; i < block.length - 1; i++) out.add(block.slice(i, i + 2));
    if (block.length === 1) out.add(block);
  }
  return [...out];
}

function snippet(text: string, query: string) {
  const lower = normalize(text); const q = normalize(query).trim(); const index = lower.indexOf(q);
  const start = Math.max(0, index >= 0 ? index - 90 : 0);
  return text.slice(start, start + 240).replace(/\s+/g, ' ').trim();
}

export function smartSearch<T extends SearchDocument>(query: string, docs: readonly T[], limit = 100): SearchHit<T>[] {
  const qTokens = tokens(query); if (!qTokens.length) return [];
  const docTokens = docs.map((doc) => new Set(tokens(doc.text)));
  const df = new Map<string, number>();
  for (const token of qTokens) df.set(token, docTokens.reduce((n, set) => n + Number(set.has(token)), 0));
  const exact = normalize(query).trim();
  return docs.map((doc, index) => {
    const body = docTokens[index]!; const path = normalize(doc.path); const name = normalize(doc.name);
    let score = 0;
    for (const token of qTokens) {
      if (!body.has(token) && !path.includes(token)) continue;
      const idf = Math.log((docs.length + 1) / ((df.get(token) ?? 0) + 1)) + 1;
      score += idf * (path.includes(token) ? 2.4 : 1);
      if (name.includes(token)) score += idf * 2;
    }
    const normalizedText = normalize(doc.text);
    if (exact && path.includes(exact)) score += 8;
    if (exact && normalizedText.includes(exact)) score += 4;
    return { doc, score, snippet: snippet(doc.text, query) };
  }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path)).slice(0, limit);
}

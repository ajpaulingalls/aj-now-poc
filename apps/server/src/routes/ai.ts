import { Hono } from 'hono';

export const aiRoutes = new Hono();

function summarizeText(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'No source text provided.';
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  return sentences.slice(0, 2).join(' ').trim();
}

function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tagMap: Record<string, string[]> = {
    conflict: ['ceasefire', 'war', 'border', 'strike', 'refugee', 'humanitarian'],
    politics: ['election', 'campaign', 'government', 'minister', 'diplomacy'],
    economy: ['market', 'jobs', 'layoffs', 'inflation', 'budget'],
    climate: ['climate', 'summit', 'environment', 'emissions'],
    technology: ['technology', 'ai', 'platform', 'data'],
  };
  const tags = new Set<string>();
  for (const [tag, words] of Object.entries(tagMap)) {
    if (words.some((word) => lower.includes(word))) tags.add(tag);
  }
  if (tags.size === 0) tags.add('field-report');
  return [...tags];
}

aiRoutes.post('/summarize', async (c) => {
  const body = await c.req.json();
  const text = String(body.text || body.body || '');
  return c.json({
    success: true,
    data: {
      summary: summarizeText(text),
      bullets: summarizeText(text)
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .map((item) => item.replace(/[.!?]$/, '')),
      tags: extractTags(`${body.headline || ''} ${text}`),
      disclosure: 'Mock AI response for PoC. Replace with approved transcription/translation/summarization services during integration.',
    },
  });
});

aiRoutes.post('/translate', async (c) => {
  const body = await c.req.json();
  const targetLanguage = body.targetLanguage || 'Arabic';
  const text = String(body.text || '');
  return c.json({
    success: true,
    data: {
      targetLanguage,
      translatedText: `[${targetLanguage} draft translation] ${text}`,
      confidence: 0.74,
      disclosure: 'Mock translation for PoC only.',
    },
  });
});

aiRoutes.post('/transcribe', async (c) => {
  const body = await c.req.json();
  const filename = body.filename || 'field-audio.m4a';
  return c.json({
    success: true,
    data: {
      filename,
      transcript: 'Mock transcript: eyewitnesses described rapidly changing conditions, limited access, and an urgent need for verified information from the field.',
      language: body.language || 'en',
      durationMs: body.durationMs || 42000,
      confidence: 0.81,
      disclosure: 'Mock transcription for PoC only.',
    },
  });
});

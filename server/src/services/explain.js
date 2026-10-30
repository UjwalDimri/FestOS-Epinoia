// Turns reason codes into sentences. Claude only phrases them: it never sees names, contact or medical data,
// and never decides. If the call fails or no key is set, the template sentence is used.
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { REASON_TEXT } from '../shared/enums.js';

let client = null;
function getClient() {
  if (!env.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export function templateExplanation(reasonCodes = []) {
  const parts = reasonCodes.map((c) => REASON_TEXT[c] || c.toLowerCase().replace(/_/g, ' '));
  return parts.length ? `${parts.join('; ')}.` : 'No reasons recorded.';
}

export async function explain(reasonCodes = [], context = {}) {
  const template = templateExplanation(reasonCodes);
  const c = getClient();
  if (!c) return { text: template, source: 'template' };
  try {
    const msg = await c.messages.create({
      model: env.anthropicModel,
      max_tokens: 160,
      system: 'You rewrite operational reason codes into one plain sentence for festival organizers. Do not add facts, names or numbers beyond those given. Do not recommend or decide.',
      messages: [{ role: 'user', content: `Reason codes: ${reasonCodes.join(', ')}\nContext (no personal data): ${JSON.stringify(context)}\nReply with one sentence only.` }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    return { text: text || template, source: 'claude' };
  } catch {
    return { text: template, source: 'template_fallback' };
  }
}

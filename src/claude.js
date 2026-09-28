import Anthropic from '@anthropic-ai/sdk';

const cliente = new Anthropic();
export const MODELO = process.env.MODELO || 'claude-opus-5';

// Llama a Claude y devuelve el texto de la respuesta, o null si se negó a contestar.
// `fallbacks: "default"` hace que, si el modelo rechaza la petición por política,
// el servidor la reintente automáticamente con otro modelo recomendado.
export async function preguntar({ system, mensaje, esfuerzo = 'medium', maxTokens = 8000 }) {
  const respuesta = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: esfuerzo },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: mensaje }],
  });
  if (respuesta.stop_reason === 'refusal') return null;
  return respuesta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Preço da API do Claude por milhão de tokens (US$), para estimar o consumo.
// Escrita de cache (5 minutos) custa 1,25x a entrada; leitura de cache, o valor indicado.
export const MODEL_PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
};
const DEFAULT = MODEL_PRICES['claude-opus-5-5'];

export function costUsd(model, { input = 0, output = 0, cacheRead = 0, cacheWrite = 0 }) {
  const p = MODEL_PRICES[model] || DEFAULT;
  return (input * p.input + output * p.output + cacheRead * p.cacheRead + cacheWrite * p.input * 1.25) / 1e6;
}

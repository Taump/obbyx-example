import type { Request } from 'express';

/** The paid API, shared by both seller variants. Prices are in bytes. */
export interface Route {
  method: 'GET' | 'POST';
  path: string;
  price: number;
  description: string;
  handler: (req: Request) => unknown;
}

let ticks = 0;

export const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/tick',
    price: 500,
    description: 'Increments a counter',
    handler: () => ({ tick: ++ticks }),
  },
  {
    method: 'GET',
    path: '/api/quote',
    price: 1_000,
    description: 'A (fake) price quote',
    handler: (req) => ({
      symbol: String(req.query['symbol'] ?? 'GBYTE').toUpperCase(),
      priceUsd: +(5 + Math.random() * 3).toFixed(4),
    }),
  },
  {
    method: 'POST',
    path: '/api/wordcount',
    price: 3_000,
    description: 'Counts the words of {"text": "..."}',
    handler: (req) => ({
      words: String((req.body as { text?: unknown })?.text ?? '').split(/\s+/).filter(Boolean).length,
    }),
  },
];

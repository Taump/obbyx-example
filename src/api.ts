import type { Request } from 'express';

/**
 * The paid API, shared by both seller variants. Prices are in bytes.
 * `example` is a sample call: the buyer scripts send it, and the x402
 * catalog (Bazaar) shows it to agents.
 */
export interface Route {
  method: 'GET' | 'POST';
  path: string;
  price: number;
  description: string;
  tags: string[];
  example: { input: Record<string, unknown>; output: unknown };
  handler: (req: Request) => unknown;
}

/** Name of the service in the catalog, shared by all routes. */
export const SERVICE_NAME = 'Obbyx Channels Example';

let ticks = 0;

export const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/tick',
    price: 500,
    description: 'Increments a counter',
    tags: ['counter', 'demo'],
    example: { input: {}, output: { tick: 1 } },
    handler: () => ({ tick: ++ticks }),
  },
  {
    method: 'GET',
    path: '/api/quote',
    price: 1_000,
    description: 'A (fake) price quote for a symbol',
    tags: ['prices', 'demo'],
    example: { input: { symbol: 'GBYTE' }, output: { symbol: 'GBYTE', priceUsd: 6.12 } },
    handler: (req) => ({
      symbol: String(req.query['symbol'] ?? 'GBYTE').toUpperCase(),
      priceUsd: +(5 + Math.random() * 3).toFixed(4),
    }),
  },
  {
    method: 'POST',
    path: '/api/wordcount',
    price: 3_000,
    description: 'Counts the words of a text',
    tags: ['text', 'demo'],
    example: { input: { text: 'one voucher per call' }, output: { words: 4 } },
    handler: (req) => ({
      words: String((req.body as { text?: unknown })?.text ?? '').split(/\s+/).filter(Boolean).length,
    }),
  },
];

/** The example call of a route as fetch() arguments: query string for GET, JSON body for POST. */
export function exampleRequest(route: Route): [path: string, init: RequestInit] {
  if (route.method === 'GET') {
    const query = new URLSearchParams(route.example.input as Record<string, string>).toString();
    return [query ? `${route.path}?${query}` : route.path, {}];
  }
  return [
    route.path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(route.example.input),
    },
  ];
}

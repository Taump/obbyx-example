import { FACILITATOR_URL, NETWORK } from './config.js';

// Shows the facilitator's x402 catalog (Bazaar) for this network.
//   pnpm catalog            all entries
//   pnpm catalog prices     search by description, service name and tags
const query = process.argv.slice(2).join(' ');

const url = query
  ? `${FACILITATOR_URL}/discovery/search?network=${NETWORK.caip2}&query=${encodeURIComponent(query)}`
  : `${FACILITATOR_URL}/discovery/resources?network=${NETWORK.caip2}`;
const answer = (await (await fetch(url)).json()) as {
  items?: Entry[];
  resources?: Entry[];
};

interface Entry {
  resource: string;
  description?: string;
  serviceName?: string;
  tags?: string[];
  lastUpdated: string;
  accepts: { scheme: string; amount: string; payTo: string }[];
  extensions?: { bazaar?: { info?: { input?: { method?: string } } } };
}

const entries = answer.items ?? answer.resources ?? [];
console.log(`${entries.length} entries in the catalog of ${FACILITATOR_URL}\n`);
for (const e of entries) {
  const method = e.extensions?.bazaar?.info?.input?.method ?? '';
  const offer = e.accepts[0];
  console.log(`${method} ${e.resource}`);
  console.log(`  ${e.serviceName ?? ''}: ${e.description ?? ''}  [${(e.tags ?? []).join(', ')}]`);
  console.log(`  ${offer?.amount} bytes, ${offer?.scheme}, pay to ${offer?.payTo}, updated ${e.lastUpdated}\n`);
}

import { mkdirSync } from 'node:fs';
import express from 'express';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { ConsumedProofsStore, ObyteBatchServer } from '@obbyx/sdk';
import { ROUTES, SERVICE_NAME } from './api.js';
import { FACILITATOR_URL, MIN_CHANNEL_TIMEOUT, NETWORK, PORT, SELLER_ID, logger, sellerConfig } from './config.js';

// The same seller on the official x402 stack: @x402/express + obbyx's
// ObyteBatchServer. Note: unlike ObytePaywall, repeating a request with an
// already used voucher gets a 402 instead of the stored response.
//
// It also lists the routes in the x402 catalog (Bazaar): each 402 carries a
// Bazaar discovery declaration (extensions.bazaar), and after the first paid
// call the facilitator adds the route to its catalog (GET /discovery/resources).
const { payTo, secret } = sellerConfig();
mkdirSync('data', { recursive: true });

const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
  .register(
    NETWORK.caip2,
    new ObyteBatchServer({
      sellerId: SELLER_ID,
      secret,
      proofs: new ConsumedProofsStore('data/proofs-x402.db'),
      logger,
      minChannelTimeoutSeconds: MIN_CHANNEL_TIMEOUT,
    }),
  )
  // Adds the HTTP method (and route template) to each route's discovery declaration at request time.
  .registerExtension(bazaarResourceServerExtension);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ network: NETWORK.caip2, payTo });
});

app.use(
  paymentMiddleware(
    Object.fromEntries(
      ROUTES.map((r) => [
        `${r.method} ${r.path}`,
        {
          accepts: {
            scheme: 'batch-settlement',
            network: NETWORK.caip2,
            payTo,
            price: `${r.price} bytes`,
          },
          description: r.description,
          mimeType: 'application/json',
          serviceName: SERVICE_NAME,
          tags: r.tags,
          // Bazaar discovery declaration: a sample call and its answer.
          extensions: declareDiscoveryExtension(
            r.method === 'POST'
              ? { bodyType: 'json', input: r.example.input, output: { example: r.example.output } }
              : { input: r.example.input, output: { example: r.example.output } },
          ),
        },
      ]),
    ),
    server,
  ),
);

for (const route of ROUTES) {
  const handler = (req: express.Request, res: express.Response) => res.json(route.handler(req));
  if (route.method === 'GET') app.get(route.path, handler);
  else app.post(route.path, handler);
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Seller (@x402/express) on http://127.0.0.1:${PORT} (${NETWORK.caip2}), paid to ${payTo}`);
});

import { mkdirSync } from 'node:fs';
import express from 'express';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ConsumedProofsStore, ObyteBatchServer } from '@obbyx/sdk';
import { ROUTES } from './api.js';
import { FACILITATOR_URL, MIN_CHANNEL_TIMEOUT, NETWORK, PORT, logger, sellerConfig } from './config.js';

// The same seller on the official x402 stack: @x402/express + obbyx's
// ObyteBatchServer. Note: unlike ObytePaywall, repeating a request with an
// already used voucher gets a 402 instead of the stored response.
const { payTo, secret } = sellerConfig();
mkdirSync('data', { recursive: true });

const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(
  NETWORK.caip2,
  new ObyteBatchServer({
    sellerId: 'obbyx-channels-example',
    secret,
    proofs: new ConsumedProofsStore('data/proofs-x402.db'),
    logger,
    minChannelTimeoutSeconds: MIN_CHANNEL_TIMEOUT,
  }),
);

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

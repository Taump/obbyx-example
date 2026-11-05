import { mkdirSync } from 'node:fs';
import express from 'express';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { ConsumedProofsStore, ObytePaywall } from '@obbyx/sdk';
import { ROUTES } from './api.js';
import { FACILITATOR_URL, MIN_CHANNEL_TIMEOUT, NETWORK, PORT, logger, sellerConfig } from './config.js';

// Seller built with the obbyx SDK (ObytePaywall). Every route accepts only
// payment-channel vouchers (x402 scheme "batch-settlement").
const { payTo, secret } = sellerConfig();
mkdirSync('data', { recursive: true });

const paywall = new ObytePaywall({
  facilitator: new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
  network: NETWORK.caip2,
  payTo,
  secret, // HMAC key that binds each payment to one request
  sellerId: 'obbyx-channels-example',
  store: new ConsumedProofsStore('data/proofs.db'), // one payment = one response
  logger,
  batch: { minChannelTimeoutSeconds: MIN_CHANNEL_TIMEOUT }, // enables channels
});

const app = express();
app.use(express.json());

// Free: lets buyers discover the seller's address and prices.
app.get('/', (_req, res) => {
  res.json({
    network: NETWORK.caip2,
    payTo,
    routes: ROUTES.map((r) => `${r.method} ${r.path}: ${r.price} bytes`),
  });
});

for (const route of ROUTES) {
  const paid = paywall.paid(
    {
      price: { amount: String(route.price) },
      schemes: ['batch-settlement'],
      description: route.description,
      mimeType: 'application/json',
    },
    (req) => ({ body: route.handler(req) }),
  );
  if (route.method === 'GET') app.get(route.path, paid);
  else app.post(route.path, paid);
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Seller on http://127.0.0.1:${PORT} (${NETWORK.caip2}), paid to ${payTo}`);
});

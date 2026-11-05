import { decodePaymentResponseHeader } from '@x402/core/http';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ROUTES, exampleRequest } from './api.js';
import { withBuyer } from './buyer.js';
import { NETWORK, SELLER_URL } from './config.js';

// The same buyer on the official x402 stack: @x402/fetch + obbyx's
// BatchObyteClient. Works with either seller variant. Calls every route in
// turn, so each one gets a paid call (and a catalog entry with seller-x402).
const calls = Number(process.argv[2] ?? ROUTES.length);

await withBuyer(async (buyer) => {
  const client = new x402Client()
    // GBYTE is not a default x402 asset: allow it explicitly, with a cap per payment.
    .setSpendControls({
      allowedAssets: [{ network: NETWORK.caip2, asset: 'base', maxAmountPerPayment: '10000' }],
    })
    .register(NETWORK.caip2, buyer.batch);
  const paidFetch = wrapFetchWithPayment(fetch, client);

  for (let i = 1; i <= calls; i++) {
    const [path, init] = exampleRequest(ROUTES[(i - 1) % ROUTES.length]!);
    const res = await paidFetch(`${SELLER_URL}${path}`, init);
    const header = res.headers.get('PAYMENT-RESPONSE');
    const extra = header ? decodePaymentResponseHeader(header).extra : undefined;
    const cumulative = (extra as { channelState?: { chargedCumulativeAmount?: string } } | undefined)
      ?.channelState?.chargedCumulativeAmount;
    console.log(`#${i} ${path}: HTTP ${res.status}, cumulative ${cumulative ?? '-'}  ${await res.text()}`);
    if (!res.ok) {
      process.exitCode = 1;
      return;
    }
  }
});

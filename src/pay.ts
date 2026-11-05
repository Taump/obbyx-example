import { SpendingBudget, payingFetch } from '@obbyx/sdk';
import { ROUTES, exampleRequest } from './api.js';
import { withBuyer } from './buyer.js';
import { MAX_PRICE, NETWORK, SELLER_URL, gbyte, logger } from './config.js';

// Calls the paid API N times over the open channel (obbyx SDK: payingFetch).
// Each call: 402 offer → sign a voucher → retry with it → 200. Nothing on-chain.
const calls = Number(process.argv[2] ?? 20);

// Limits for this run: per call and in total (bytes).
const budget = new SpendingBudget({
  perCall: new Map([['base', MAX_PRICE]]),
  total: new Map([['base', 200_000n]]),
});

await withBuyer(async (buyer) => {
  const started = Date.now();
  let total = 0n;

  for (let i = 1; i <= calls; i++) {
    const [path, init] = exampleRequest(ROUTES[(i - 1) % ROUTES.length]!);
    const { response, payment } = await payingFetch(`${SELLER_URL}${path}`, init, {
      mechanisms: { batch: buyer.batch }, // channels only, no on-chain fallback
      network: NETWORK.caip2,
      maxAmount: new Map([['base', MAX_PRICE]]),
      budget,
      logger,
    });
    const body = await response.text();

    if (!response.ok || !payment?.success) {
      console.log(`#${i} ${path}: HTTP ${response.status} ${payment?.errorReason ?? '(no payment response)'} ${body}`);
      process.exitCode = 1;
      return;
    }
    const { chargedAmount = '0', channelState } = payment.extra as {
      chargedAmount?: string;
      channelState?: { chargedCumulativeAmount?: string };
    };
    total += BigInt(chargedAmount);
    console.log(`#${i} ${path}: paid ${chargedAmount}, cumulative ${channelState?.chargedCumulativeAmount}  ${body}`);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${calls} calls, ${gbyte(total)}, ${seconds} s, 0 on-chain transactions.`);
});

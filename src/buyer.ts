import { join } from 'node:path';
import obyte from 'obyte';
import { loadWallet, obbyxHome } from '@obbyx/obyte/wallet';
import {
  BatchObyteClient,
  type BatchClientOptions,
  ClientChannelStore,
  CoinReservations,
  ReservingComposer,
} from '@obbyx/x402-obyte';
import { NETWORK, SELLER_URL, logger } from './config.js';

/**
 * Everything a buyer script needs. The wallet and the channel database are the
 * ones of the `obbyx` CLI ($OBBYX_HOME, default ~/.obbyx), so
 * `npx obbyx channel list` shows the same channels.
 */
export function openBuyer() {
  const wallet = loadWallet(NETWORK);
  const home = obbyxHome();
  const client = new obyte.Client(NETWORK.defaultHubUrl, { testnet: NETWORK.testnet });
  const store = new ClientChannelStore(join(home, `channels-${NETWORK.name}.db`));

  const options: BatchClientOptions = {
    client,
    network: NETWORK,
    privateKey: wallet.privateKey,
    store,
    logger,
    // Picks coins for on-chain actions (open, deposit, close) without double use.
    composer: new ReservingComposer({
      client,
      network: NETWORK.caip2,
      address: wallet.address,
      reservations: new CoinReservations(join(home, `coins-${NETWORK.name}.db`)),
      logger,
    }),
    // Never sign a voucher above this price, whatever the seller asks.
    maxAmount: new Map([['base', 10_000n]]),
  };

  return {
    address: wallet.address,
    client,
    store,
    options,
    /** The x402 client for the "batch-settlement" scheme. */
    batch: new BatchObyteClient(options),
    close: () => {
      store.close();
      client.close();
    },
  };
}

/** The seller's address, from PAY_TO or the seller's free `GET /`. */
export async function sellerAddress(): Promise<string> {
  if (process.env['PAY_TO']) return process.env['PAY_TO'];
  const info = (await (await fetch(SELLER_URL)).json()) as { payTo: string };
  return info.payTo;
}

/** Runs a script body with a buyer, prints errors and always closes it. */
export async function withBuyer(body: (buyer: ReturnType<typeof openBuyer>) => Promise<void>) {
  const buyer = openBuyer();
  try {
    await body(buyer);
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    if (code === 'payment_pending') {
      console.error('If the facilitator never received that voucher: npm run channel -- reset --yes');
    }
    process.exitCode = 1;
  } finally {
    buyer.close();
  }
}

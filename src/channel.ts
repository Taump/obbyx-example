import { parseArgs } from 'node:util';
import { explorerUnitUrl, fromDisplay } from '@obbyx/obyte';
import { closeChannel, confirmClose, deposit, hubCall, openChannel } from '@obbyx/x402-obyte';
import { sellerAddress, withBuyer } from './buyer.js';
import { DEFAULT_DEPOSIT, MIN_CHANNEL_TIMEOUT, NETWORK, gbyte } from './config.js';

const USAGE = `Usage: pnpm channel <command>

  open [GBYTE]       open a channel to the seller with a deposit (default ${DEFAULT_DEPOSIT})
  status [--wait]    show the channel; --wait until the deposit is credited
  deposit [GBYTE]    add funds (default ${DEFAULT_DEPOSIT})
  close              close: the seller gets what you spent, you get the rest
  confirm            finish your close yourself if the seller did not
  list               all your channels
  reset [--yes]      forget a voucher stuck with an unknown outcome

Options: --window <seconds> (open), --aa <address> (pick a channel)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    window: { type: 'string', default: String(MIN_CHANNEL_TIMEOUT) },
    aa: { type: 'string' },
    wait: { type: 'boolean' },
    yes: { type: 'boolean' },
  },
});
const [command, amount] = positionals;
const link = (unit: string) => explorerUnitUrl(NETWORK, unit);

await withBuyer(async (buyer) => {
  // The channel to act on: --aa, or the newest channel to the seller.
  const channel = async () => {
    const ch = values.aa
      ? buyer.store.get(values.aa)
      : buyer.store.find(NETWORK.caip2, await sellerAddress(), 'base');
    if (!ch) throw new Error('No channel yet. Open one: pnpm channel open');
    return ch;
  };
  // The channel AA's state on the ledger.
  const onChain = async (aa: string) => {
    const res = await hubCall(() => buyer.client.api.getAaStateVars({ address: aa }), 15_000);
    if (res.kind !== 'ok') throw new Error(`Hub error: ${res.error}`);
    return res.value as { period?: number; balanceB?: number; close_initiated_by?: string };
  };

  switch (command) {
    case 'open': {
      const payTo = await sellerAddress();
      const { aa, unit } = await openChannel(buyer.options, {
        payTo,
        deposit: fromDisplay(amount ?? DEFAULT_DEPOSIT, 9),
        timeout: Number(values.window),
      });
      console.log(`Opened channel ${aa} to ${payTo}\n${link(unit)}`);
      console.log('Usable once the deposit is credited: pnpm channel status --wait');
      break;
    }

    case 'status': {
      const ch = await channel();
      let state = await onChain(ch.aa);
      while (values.wait && state.period === undefined) {
        process.stdout.write('.');
        await new Promise((r) => setTimeout(r, 15_000));
        state = await onChain(ch.aa);
      }
      console.log(`Channel ${ch.aa} to ${ch.payTo}`);
      console.log(
        state.period === undefined
          ? '  deposit: not credited yet (wait for stability, or use --wait)'
          : `  deposit: ${gbyte(state.balanceB ?? 0)}, period ${state.period}` +
              (state.close_initiated_by ? ', CLOSING' : ''),
      );
      console.log(`  spent:   ${gbyte(ch.committed)}${ch.pending ? ' (+1 voucher with unknown outcome)' : ''}`);
      if (ch.maxSigned > ch.committed) {
        console.log(`  signed:  ${gbyte(ch.maxSigned)} (a close declares this: the seller may hold that voucher)`);
      }
      break;
    }

    case 'deposit': {
      const ch = await channel();
      const unit = await deposit(buyer.options, ch.aa, fromDisplay(amount ?? DEFAULT_DEPOSIT, 9));
      console.log(`Deposited to ${ch.aa}\n${link(unit)}`);
      break;
    }

    case 'close': {
      const ch = await channel();
      if (ch.pending) throw new Error('A voucher has an unknown outcome; repeat that request or reset it first');
      // Declares the HIGHEST amount ever signed in this period, not the last
      // confirmed one: if the seller holds a higher voucher, declaring less lets
      // it take the whole channel with a fraud proof. At worst this pays for one
      // request that was not served.
      const unit = await closeChannel(buyer.options, ch.aa, ch.period, ch.maxSigned);
      console.log(`Closing ${ch.aa}, spent ${gbyte(ch.maxSigned)}\n${link(unit)}`);
      console.log(`The seller's watcher confirms in ~2 min. If not, after ${ch.timeout} s: pnpm channel confirm`);
      break;
    }

    case 'confirm': {
      const ch = await channel();
      const unit = await confirmClose(buyer.options, ch.aa, ch.period);
      console.log(`Close confirmed\n${link(unit)}`);
      break;
    }

    case 'list': {
      const all = buyer.store.list().filter((c) => c.network === NETWORK.caip2);
      if (all.length === 0) console.log('No channels.');
      for (const c of all) {
        const signed = c.maxSigned > c.committed ? ` (signed ${gbyte(c.maxSigned)})` : '';
        console.log(`${c.aa}  seller ${c.payTo}  spent ${gbyte(c.committed)}${signed}`);
      }
      break;
    }

    // While a voucher's outcome is unknown no new one is signed (no double
    // payment). If the facilitator never got it, it is safe to forget. Even
    // if it did, the next voucher re-syncs with the facilitator's amount, and
    // a close still declares it (maxSigned is never lowered).
    case 'reset': {
      const ch = await channel();
      if (!ch.pending) {
        console.log('Nothing to reset.');
      } else if (!values.yes) {
        console.log(`Stuck voucher: cumulative ${ch.pending.amountSpent} bytes. Run again with --yes to forget it.`);
      } else {
        buyer.store.dropPending(ch.aa);
        console.log('Forgotten; the channel is usable again.');
      }
      break;
    }

    default:
      console.log(USAGE);
  }
});

# x402 payment channels on Obyte

A small paid HTTP API where every request is paid with an **off-chain voucher**
over an Obyte payment channel, using [obbyx](https://github.com/Taump/obbyx)
and the x402 scheme `batch-settlement`.

The buyer deposits once into a channel. After that each call is instant and
has no network fee. The seller is paid on-chain once, when the channel closes.

Testnet only by default: no real money is involved.

## How it works

```
buyer                         seller API               facilitator           seller watcher
  │ open channel: deposit 0.0005 GBYTE (one on-chain unit)
  │
  │ GET /api/tick ──────────────▶│
  │◀─ 402 + offer ──────────────│   price, bound to this exact request
  │ sign a voucher: "I have spent 500 bytes in total"
  │ GET /api/tick + voucher ────▶│── settle ──────────▶│── store voucher ───▶│
  │◀─ 200 + response ───────────│◀── ok ──────────────│◀── stored ──────────│
  │
  │ ...more calls, each voucher raises the total: 1500, 4500, ...
  │
  │ close channel ──────────────────────────────────────────────────────────▶ the watcher confirms:
  │                                                                           seller gets the total,
  │                                                                           buyer gets the rest
```

- **Facilitator**: checks vouchers against the ledger.
- **Watcher**: stores the seller's vouchers and closes channels. If the buyer
  tries to close declaring less than they signed, the watcher proves it.
- Both are obbyx services. `docker-compose.yml` builds and runs them for you.

## Files

| File                  | What it is                                                     |
| --------------------- | -------------------------------------------------------------- |
| `src/api.ts`          | The paid routes and their prices                               |
| `src/seller.ts`       | Seller with the obbyx SDK (`ObytePaywall`)                     |
| `src/seller-x402.ts`  | Same seller with the official `@x402/express`                  |
| `src/channel.ts`      | Buyer: open, check, top up and close a channel                 |
| `src/pay.ts`          | Buyer: pay for many calls with the obbyx SDK (`payingFetch`)   |
| `src/pay-x402.ts`     | Same buyer with the official `@x402/fetch`                     |
| `src/buyer.ts`        | Buyer wallet, hub connection and channel database              |
| `src/config.ts`       | Settings from `.env`                                           |
| `docker-compose.yml`  | obbyx facilitator + watcher, built straight from GitHub        |

| Route                  | Price       |
| ---------------------- | ----------- |
| `GET /api/tick`        | 500 bytes   |
| `GET /api/quote`       | 1000 bytes  |
| `POST /api/wordcount`  | 3000 bytes  |

## Requirements

- Node.js 24+ and pnpm
- Docker (for the facilitator and the watcher)

```sh
pnpm install
cp .env.example .env
```

## Run it

### 1. Wallets

Two wallets: the buyer in `~/.obbyx`, the seller in `~/.obbyx-seller`.

```sh
npx obbyx init                                  # buyer
OBBYX_HOME=~/.obbyx-seller npx obbyx init       # seller

npx obbyx faucet                                # free testnet bytes, once a day
OBBYX_HOME=~/.obbyx-seller npx obbyx faucet

echo "PAY_TO=$(OBBYX_HOME=~/.obbyx-seller npx obbyx address)" >> .env
echo "SELLER_SECRET=$(openssl rand -hex 32)" >> .env
```

The seller needs bytes too: the watcher refuses to work with less than
100 000 bytes, because it may have to send transactions to protect the seller.
Faucet bytes are spendable once stable (minutes, sometimes up to ~2 h):
`npx obbyx balance`.

### 2. Facilitator and watcher

```sh
docker compose up -d --build      # the first build takes a few minutes
curl http://127.0.0.1:4021/health
```

### 3. Seller

```sh
pnpm seller                       # http://127.0.0.1:3402
```

### 4. Buyer: open a channel

```sh
pnpm channel open 0.0005          # deposit 0.0005 GBYTE
pnpm channel status --wait        # wait until the deposit is credited
```

### 5. Buyer: pay

```sh
pnpm pay 20
```

Example output:

```text
#1 /api/tick: paid 500, cumulative 500  {"tick":1}
#2 /api/quote?symbol=GBYTE: paid 1000, cumulative 1500  {"symbol":"GBYTE","priceUsd":6.7635}
#3 /api/wordcount: paid 3000, cumulative 4500  {"words":4}
...
20 calls, 0.00003 GBYTE, 1.2 s, 0 on-chain transactions.
```

### 6. Buyer: close the channel

```sh
pnpm channel close                # the watcher confirms in ~2 minutes
pnpm channel status
```

## The official x402 packages

The same flow works with the official `@x402/*` packages. obbyx adds the Obyte
scheme to them:

```sh
pnpm seller:x402                  # @x402/express + ObyteBatchServer
pnpm pay:x402 10                  # @x402/fetch + BatchObyteClient
```

## Channel commands

```text
pnpm channel open [GBYTE]       open a channel to the seller (default 0.0005)
pnpm channel status [--wait]    deposit and amount spent
pnpm channel deposit <GBYTE>    add funds
pnpm channel close              close: the seller gets what you spent, you get the rest
pnpm channel confirm            finish your close yourself if the seller did not confirm it
pnpm channel list               all your channels
pnpm channel reset [--yes]      forget a voucher stuck with an unknown outcome
```

Options: `--window <seconds>` for `open`, `--aa <address>` to pick a channel.
The channels are shared with the obbyx CLI: `npx obbyx channel list`.

## Settings (`.env`)

| Variable              | Default                 | Meaning                                                |
| --------------------- | ----------------------- | ------------------------------------------------------ |
| `NETWORK`             | `obyte:testnet`         | Network for everything, including the Docker services  |
| `PAY_TO`              |                         | Seller's address (where the money goes)                |
| `SELLER_SECRET`       |                         | Seller's secret that binds each payment to one request |
| `OBBYX_SELLER_HOME`   | `~/.obbyx-seller`       | Seller wallet, used by the watcher                     |
| `FACILITATOR_URL`     | `http://127.0.0.1:4021` |                                                        |
| `SELLER_URL`          | `http://127.0.0.1:3402` | Where the buyer scripts send requests                  |
| `PORT`                | `3402`                  | Seller port                                            |
| `MIN_CHANNEL_TIMEOUT` | `3600`                  | Smallest dispute window (seconds) a channel may have   |

`OBBYX_HOME` (default `~/.obbyx`) selects the buyer wallet.

Livenet means real GBYTE, and obbyx has not been run on mainnet yet. The
scripts refuse `NETWORK=obyte:livenet` unless `ALLOW_LIVENET=1` is also set.

## Troubleshooting

| Error                  | Fix                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `No channel yet`       | `pnpm channel open`                                                                                     |
| `channel_not_funded`   | The deposit is not stable yet: `pnpm channel status --wait`                                             |
| `channel_exhausted`    | The deposit is used up: `pnpm channel deposit 0.0005`                                                   |
| `…watcher_unavailable` | The watcher is down or has < 100 000 bytes: `docker compose logs watcher`                               |
| `payment_pending`      | A previous voucher has an unknown outcome (e.g. the facilitator was down). If the facilitator never received it: `pnpm channel reset --yes` |
| `"pino-pretty"` error  | Run `pnpm install` (it installs `pino-pretty`)                                                          |

The services log JSON. To read it:
`docker compose logs -f --no-log-prefix watcher | npx pino-pretty`.

## Why it is safe

| Risk                                       | Protection                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| The buyer spends more than the deposit     | Checked against the channel balance on the ledger                                    |
| One voucher pays for two requests          | Each voucher raises the total by exactly the price and is bound to one request       |
| The seller loses a paid voucher            | A call succeeds only after the watcher has stored the voucher                        |
| The buyer closes declaring less than spent | The watcher answers with the buyer's own signed voucher (fraud proof)                |
| The seller asks too much                   | Price caps: `maxAmount`, `SpendingBudget`, `setSpendControls`                         |
| A call fails halfway                       | No new voucher is signed until the outcome of the last one is known                  |

More: [payment channels](https://github.com/Taump/obbyx/blob/master/docs/guide/channels.md),
[security](https://github.com/Taump/obbyx/blob/master/docs/guide/security.md).

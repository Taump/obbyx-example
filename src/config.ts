import { existsSync } from 'node:fs';
import { getNetwork, toDisplay } from '@obbyx/obyte';
import { createLogger } from '@obbyx/obyte/logger';

// Settings shared by all scripts, from the environment or .env.
if (existsSync('.env')) process.loadEnvFile('.env');

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] || fallback;
  if (value === undefined) {
    console.error(`Missing ${name}: set it in .env (see .env.example)`);
    process.exit(1);
  }
  return value;
};

// "testnet" and "obyte:testnet" both work.
const networkName = env('NETWORK', 'obyte:testnet');
export const NETWORK = getNetwork(networkName.includes(':') ? networkName : `obyte:${networkName}`);

if (!NETWORK.testnet && process.env['ALLOW_LIVENET'] !== '1') {
  console.error('NETWORK is livenet (real GBYTE). Set ALLOW_LIVENET=1 if you really mean it.');
  process.exit(1);
}

export const FACILITATOR_URL = env('FACILITATOR_URL', 'http://127.0.0.1:4021');
export const SELLER_URL = env('SELLER_URL', 'http://127.0.0.1:3402');
export const PORT = Number(env('PORT', '3402'));
export const MIN_CHANNEL_TIMEOUT = Number(env('MIN_CHANNEL_TIMEOUT', '3600'));

/** Seller-only settings (read lazily so buyer scripts do not need them). */
export const sellerConfig = () => ({ payTo: env('PAY_TO'), secret: env('SELLER_SECRET') });

export const logger = createLogger({
  level: (process.env['LOG_LEVEL'] as never) ?? 'warn',
  pretty: process.env['LOG_PRETTY'] === '1',
});

export const gbyte = (bytes: bigint | number | string) => `${toDisplay(BigInt(bytes), 9)} GBYTE`;

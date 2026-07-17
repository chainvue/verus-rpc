/**
 * Gated example (requires your own daemon): send currency and wait for the
 * txid via opid polling. NOT run against mainnet — set the env vars to point
 * at your own node. Uses testnet dust amounts.
 *
 *   VERUS_RPC_URL=http://127.0.0.1:18843 \
 *   VERUS_RPC_USER=... VERUS_RPC_PASS=... \
 *   pnpm i && node --experimental-strip-types examples/wallet-send.ts "destination@"
 */
import { formatAmount, parseAmount, VerusClient } from "@chainvue/verus-rpc";

const url = process.env["VERUS_RPC_URL"];
if (url === undefined) {
  console.error("Set VERUS_RPC_URL/USER/PASS to your own daemon. This example moves funds — read it first.");
  process.exit(1);
}

const destination = process.argv[2];
if (destination === undefined) {
  console.error("Usage: wallet-send.ts <destination@>");
  process.exit(1);
}

// Credentials are optional and must be passed together — omit both for a
// public gateway, supply both for your own daemon.
const user = process.env["VERUS_RPC_USER"];
const pass = process.env["VERUS_RPC_PASS"];
const client = new VerusClient({
  url,
  ...(user !== undefined && pass !== undefined ? { user, pass } : {}),
});

const balance = await client.wallet.getBalance();
console.log(`balance: ${formatAmount(balance)}`);

const amount = parseAmount("0.0001"); // dust
const { opid, txid } = await client.wallet.sendCurrencyAndWait({
  fromAddress: "*",
  outputs: [{ address: destination, amount }],
});
console.log(`sent ${formatAmount(amount)} — opid ${opid} → txid ${txid}`);

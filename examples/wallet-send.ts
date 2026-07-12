/**
 * Gated example (requires your own daemon): send currency and wait for the
 * txid via opid polling. NOT run against mainnet — set the env vars to point
 * at your own node. Uses testnet dust amounts.
 *
 *   VERUS_RPC_URL=http://127.0.0.1:18843 \
 *   VERUS_RPC_USER=... VERUS_RPC_PASS=... \
 *   npx tsx examples/wallet-send.ts "destination@"
 */
import { formatAmount, parseAmount, VerusClient } from "verus-rpc";

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

const client = new VerusClient({
  url,
  user: process.env["VERUS_RPC_USER"] ?? "",
  pass: process.env["VERUS_RPC_PASS"] ?? "",
});

const balance = await client.wallet.getBalance();
console.log(`balance: ${formatAmount(balance)}`);

const amount = parseAmount("0.0001"); // dust
const { opid, txid } = await client.wallet.sendCurrencyAndWait({
  fromAddress: "*",
  outputs: [{ address: destination, amount }],
});
console.log(`sent ${formatAmount(amount)} — opid ${opid} → txid ${txid}`);

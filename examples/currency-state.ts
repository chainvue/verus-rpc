/**
 * Zero-setup example: read a currency definition + reserves against mainnet.
 * Shows the amounts invariant — reserves/weights are bigint, formatted with
 * formatAmount, never float.
 *
 *   npx tsx examples/currency-state.ts Bridge.vETH
 */
import { formatAmount, VerusClient } from "verus-rpc";

const currency = process.argv[2] ?? "Bridge.vETH";

const client = new VerusClient({ url: "https://api.verus.services", user: "public", pass: "public" });

const def = await client.currency.getCurrency({ currency });
console.log(`${def.fullyqualifiedname ?? def.name} (${def.currencyid})`);

const state = def.bestcurrencystate ?? def.lastconfirmedcurrencystate;
if (state?.reservecurrencies !== undefined) {
  console.log("  reserves:");
  for (const reserve of state.reservecurrencies) {
    // weight is a 1e8-scaled fraction, same convention as amounts.
    console.log(
      `    ${reserve.currencyid}: ${formatAmount(reserve.reserves)} ` +
        `(weight ${formatAmount(reserve.weight)}, price ${formatAmount(reserve.priceinreserve)})`,
    );
  }
} else {
  console.log(`  supply: ${state ? formatAmount(state.supply) : "n/a"}`);
}

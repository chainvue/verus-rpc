/**
 * Zero-setup example: look up a VerusID against the public mainnet RPC.
 * No daemon, no credentials.
 *
 *   pnpm i && node --experimental-strip-types examples/read-identity.ts "Verus Coin Foundation@"
 */
import { VerusClient } from "@chainvue/verus-rpc";

const name = process.argv[2] ?? "Verus Coin Foundation@";

// Public nodes take no credentials — omit both user and pass.
const client = new VerusClient({ url: "https://api.verus.services" });

const result = await client.identity.getIdentity({ nameOrAddress: name });
console.log(`${result.fullyqualifiedname ?? name}`);
console.log(`  i-address:  ${result.identity.identityaddress}`);
console.log(`  status:     ${result.status ?? "unknown"}`);
console.log(`  primaries:  ${result.identity.primaryaddresses.join(", ")}`);
console.log(`  min sigs:   ${result.identity.minimumsignatures}`);

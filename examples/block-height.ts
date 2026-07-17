/**
 * Zero-setup example: the smallest possible call — current block height.
 * No daemon, no credentials.
 *
 *   pnpm i && node --experimental-strip-types examples/block-height.ts
 */
import { VerusClient } from "@chainvue/verus-rpc";

// Public nodes take no credentials — omit both user and pass.
const client = new VerusClient({ url: "https://api.verus.services" });

const height = await client.chain.getBlockCount();
const info = await client.chain.getInfo();
console.log(`VRSC block height: ${height} (daemon ${info.VRSCversion})`);

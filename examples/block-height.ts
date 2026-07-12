/**
 * Zero-setup example: the smallest possible call — current block height.
 *
 *   npx tsx examples/block-height.ts
 */
import { VerusClient } from "verus-rpc";

const client = new VerusClient({ url: "https://api.verus.services", user: "public", pass: "public" });

const height = await client.chain.getBlockCount();
const info = await client.chain.getInfo();
console.log(`VRSC block height: ${height} (daemon ${info.VRSCversion})`);

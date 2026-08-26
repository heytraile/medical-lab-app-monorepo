import { sendSysmexCbc, sendIflashOru } from "./analyzers";

const cmd = process.argv[2];
const barcode = process.argv[3];

async function main() {
  if (cmd === "sysmex") {
    await sendSysmexCbc(barcode);
  } else if (cmd === "iflash") {
    await sendIflashOru(barcode);
  } else {
    console.log("Usage: tsx src/cli.ts <sysmex|iflash> [barcode]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

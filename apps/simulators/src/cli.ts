import {
  sendSysmexCbc,
  sendMindrayChem,
  sendIflashOru,
  sendProlyte,
} from "./analyzers";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const cmd = process.argv[2];
const barcode =
  argValue("--barcode") ??
  (process.argv[3] && !process.argv[3].startsWith("--")
    ? process.argv[3]
    : undefined);

async function main() {
  if (cmd === "sysmex") {
    await sendSysmexCbc(barcode);
  } else if (cmd === "mindray") {
    await sendMindrayChem(barcode);
  } else if (cmd === "iflash") {
    await sendIflashOru(barcode, {
      queryOrders: process.argv.includes("--query"),
    });
  } else if (cmd === "prolyte") {
    await sendProlyte(barcode);
  } else {
    console.log(
      "Usage: tsx src/cli.ts <sysmex|mindray|iflash|prolyte> [--barcode ACC] [--query]",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

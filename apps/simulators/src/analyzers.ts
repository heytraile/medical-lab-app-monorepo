import * as net from "net";
import { buildAstmFrame, ASTM, wrapMllp } from "@drax-lis/protocols";

const EDGE_HOST = process.env.EDGE_HOST ?? "127.0.0.1";
const SYSMEX_PORT = Number(process.env.SYSMEX_TCP_PORT ?? 5001);
const IFLASH_PORT = Number(process.env.IFLASH_TCP_PORT ?? 5004);
const BARCODE = process.env.SIM_BARCODE ?? "DH20260125001";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Canned Sysmex-like ASTM E1394 result session over TCP. */
export async function sendSysmexCbc(barcode = BARCODE) {
  const records = [
    `H|\\^&|||XS-1000i^1.0|||||||P|E1394-97|${timestamp()}`,
    `P|1||PAT001||Doe^Jane||19900101|F`,
    `O|1|${barcode}|^1^1|^^^CBC|R|${timestamp()}|||||N`,
    `R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F`,
    `R|2|^^^RBC|4.6|10*6/uL|3.8-5.5|N||F`,
    `R|3|^^^HGB|13.8|g/dL|12.0-16.0|N||F`,
    `R|4|^^^PLT|245|10*3/uL|150-400|N||F`,
    `L|1|N`,
  ];

  const payload = Buffer.concat(
    records.map((text, i) =>
      buildAstmFrame(i + 1, text, i === records.length - 1),
    ),
  );

  // Prefixed ENQ/EOT session bytes (edge Phase 0 accepts the framed body)
  const session = Buffer.concat([
    Buffer.from([ASTM.ENQ]),
    payload,
    Buffer.from([ASTM.EOT]),
  ]);

  await sendTcp(EDGE_HOST, SYSMEX_PORT, session);
  console.log(`[sim] Sysmex CBC for ${barcode} → ${EDGE_HOST}:${SYSMEX_PORT}`);
}

/** Canned YHLO iFlash-like HL7 ORU^R01 over MLLP. */
export async function sendIflashOru(barcode = BARCODE) {
  const ts = timestamp();
  const msg = [
    `MSH|^~\\&|YHLO|iFlash1200|||${ts}||ORU^R01|MSG001|P|2.3.1`,
    `PID|1||PAT001||Doe^Jane||19900101|F`,
    `OBR|1|${barcode}|${barcode}|TSH^Thyroid Stimulating Hormone^YHLO|||${ts}`,
    `OBX|1|NM|TSH^TSH^YHLO||2.45|mIU/L|0.35-4.94|N|||F`,
  ].join("\r");

  await sendTcp(EDGE_HOST, IFLASH_PORT, wrapMllp(msg));
  console.log(`[sim] iFlash ORU for ${barcode} → ${EDGE_HOST}:${IFLASH_PORT}`);
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sendTcp(host: string, port: number, data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(data, () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`timeout connecting to ${host}:${port}`));
    });
    socket.on("error", reject);
  });
}

export async function runLoop() {
  console.log("[sim] Analyzer simulators ready. Sending canned results every 30s…");
  console.log(`[sim] Edge host=${EDGE_HOST} sysmex=${SYSMEX_PORT} iflash=${IFLASH_PORT}`);
  // Initial burst after a short wait for edge to bind
  await sleep(2000);
  for (;;) {
    try {
      await sendSysmexCbc();
      await sleep(1000);
      await sendIflashOru(`${BARCODE}-IA`);
    } catch (err) {
      console.warn(`[sim] send failed (is edge-engine up?):`, err);
    }
    await sleep(30_000);
  }
}

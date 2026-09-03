import * as net from "net";
import * as fs from "fs";
import {
  ASTM,
  sendAstmSession,
  wrapMllp,
  unwrapMllp,
  formatProlyteBlock,
} from "@drax-lis/protocols";
import {
  analytesForOrder,
  analyzerHasWork,
  type AnalyzerId,
  type SimAnalyte,
} from "@drax-lis/catalog";
import { resolveOrderForBarcode, isSimStrict } from "./order-context";

const EDGE_HOST = process.env.EDGE_HOST ?? "127.0.0.1";
const SYSMEX_PORT = Number(process.env.SYSMEX_TCP_PORT ?? 5001);
const MINDRAY_PORT = Number(process.env.MINDRAY_TCP_PORT ?? 5003);
const IFLASH_PORT = Number(process.env.IFLASH_TCP_PORT ?? 5004);
const BARCODE = process.env.SIM_BARCODE ?? "DHDEMO0001";
const PROLYTE_PATH = process.env.PROLYTE_SERIAL_PATH ?? "";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function flagChar(flag?: SimAnalyte["flag"]): string {
  switch (flag) {
    case "high":
      return "H";
    case "low":
      return "L";
    case "normal":
      return "N";
    default:
      return "N";
  }
}

async function sendAstmTcp(
  host: string,
  port: number,
  records: string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      const ackWaiters: Array<(ok: boolean) => void> = [];

      socket.on("data", (data) => {
        for (const b of data) {
          if (b === ASTM.ACK) {
            ackWaiters.shift()?.(true);
          } else if (b === ASTM.NAK) {
            ackWaiters.shift()?.(false);
          }
        }
      });

      void sendAstmSession({
        write: (buf) =>
          new Promise<void>((res, rej) => {
            socket.write(buf, (err) => (err ? rej(err) : res()));
          }),
        waitForAck: (timeoutMs = 5000) =>
          new Promise<boolean>((res) => {
            const t = setTimeout(() => {
              const idx = ackWaiters.indexOf(waiter);
              if (idx >= 0) ackWaiters.splice(idx, 1);
              res(false);
            }, timeoutMs);
            const waiter = (ok: boolean) => {
              clearTimeout(t);
              res(ok);
            };
            ackWaiters.push(waiter);
          }),
        records,
      })
        .then(() => {
          socket.end();
          resolve();
        })
        .catch((err) => {
          socket.destroy();
          reject(err);
        });
    });
    socket.setTimeout(15_000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`timeout connecting to ${host}:${port}`));
    });
    socket.on("error", reject);
  });
}

function buildAstmRecords(
  headerModel: string,
  barcode: string,
  orderCode: string,
  analytes: SimAnalyte[],
): string[] {
  const ts = timestamp();
  const records = [
    `H|\\^&|||${headerModel}|||||||P|E1394-97|${ts}`,
    `P|1||PAT001||Doe^Jane||19900101|F`,
    `O|1|${barcode}|^1^1|^^^${orderCode}|R|${ts}|||||N`,
  ];
  analytes.forEach((a, i) => {
    const ref =
      a.referenceLow != null && a.referenceHigh != null
        ? `${a.referenceLow}-${a.referenceHigh}`
        : "";
    records.push(
      `R|${i + 1}|^^^${a.instrumentCode}|${a.value}|${a.units}|${ref}|${flagChar(a.flag)}||F`,
    );
  });
  records.push(`L|1|N`);
  return records;
}

/** Full ENQ/ACK framed CBC session → Sysmex TCP listener. */
export async function sendSysmexCbc(
  barcode = BARCODE,
  orderedCatalogCodes?: string[],
) {
  const ordered =
    orderedCatalogCodes ?? (await resolveOrderForBarcode(barcode));
  if (isSimStrict() && ordered.length === 0) {
    console.log(`[sim] Sysmex skipped — no order for ${barcode}`);
    return;
  }
  if (!analyzerHasWork("sysmex_xs1000i", ordered)) {
    console.log(`[sim] Sysmex skipped — no haematology on order for ${barcode}`);
    return;
  }

  const analytes = analytesForOrder("sysmex_xs1000i", ordered);
  const records = buildAstmRecords("XS-1000i^1.0", barcode, "CBC", analytes);
  await sendAstmTcp(EDGE_HOST, SYSMEX_PORT, records);
  console.log(
    `[sim] Sysmex CBC (${analytes.length} results) for ${barcode} → ${EDGE_HOST}:${SYSMEX_PORT}`,
  );
}

/** Mindray chemistry panel over ASTM on :5003. */
export async function sendMindrayChem(
  barcode = BARCODE,
  orderedCatalogCodes?: string[],
) {
  const ordered =
    orderedCatalogCodes ?? (await resolveOrderForBarcode(barcode));
  if (isSimStrict() && ordered.length === 0) {
    console.log(`[sim] Mindray skipped — no order for ${barcode}`);
    return;
  }
  if (!analyzerHasWork("mindray_bs240", ordered)) {
    console.log(`[sim] Mindray skipped — no chemistry on order for ${barcode}`);
    return;
  }

  const analytes = analytesForOrder("mindray_bs240", ordered);
  const records = buildAstmRecords("BS-240^Mindray", barcode, "CHEM", analytes);
  await sendAstmTcp(EDGE_HOST, MINDRAY_PORT, records);
  console.log(
    `[sim] Mindray CHEM (${analytes.length} results) for ${barcode} → ${EDGE_HOST}:${MINDRAY_PORT}`,
  );
}

function readMllpMessage(
  socket: net.Socket,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf: Buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const { messages, remainder } = unwrapMllp(buf);
      buf = Buffer.from(remainder);
      if (messages[0]) {
        cleanup();
        resolve(messages[0]);
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("MLLP read timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(t);
      socket.off("data", onData);
      socket.off("error", onErr);
    };
    socket.on("data", onData);
    socket.on("error", onErr);
  });
}

/** iFlash ORU over MLLP; waits for ACK^R01. */
export async function sendIflashOru(
  barcode = BARCODE,
  opts: { queryOrders?: boolean; orderedCatalogCodes?: string[] } = {},
) {
  const ordered =
    opts.orderedCatalogCodes ??
    (await resolveOrderForBarcode(barcode));
  if (isSimStrict() && ordered.length === 0) {
    console.log(`[sim] iFlash skipped — no order for ${barcode}`);
    return;
  }
  if (!analyzerHasWork("yhlo_iflash1200", ordered)) {
    console.log(`[sim] iFlash skipped — no immunoassay on order for ${barcode}`);
    return;
  }

  const analytes = analytesForOrder("yhlo_iflash1200", ordered);

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(
      { host: EDGE_HOST, port: IFLASH_PORT },
      () => {
        void (async () => {
          try {
            if (opts.queryOrders) {
              const ts = timestamp();
              const qry = [
                `MSH|^~\\&|YHLO|iFlash1200|DRAX_LIS|DRAX|${ts}||QRY^Q02|Q${ts}|P|2.3.1`,
                `QRD|${ts}|R|I|Q${ts}||||${barcode}`,
              ].join("\r");
              socket.write(wrapMllp(qry));
              await readMllpMessage(socket, 5000);
              console.log(`[sim] iFlash QRY for ${barcode} answered`);
            }

            const ts = timestamp();
            const lines = [
              `MSH|^~\\&|YHLO|iFlash1200|||${ts}||ORU^R01|MSG${ts}|P|2.3.1`,
              `PID|1||PAT001||Doe^Jane||19900101|F`,
            ];

            for (const [i, analyte] of analytes.entries()) {
              const primaryCatalog = analyte.catalogCodes[0] ?? analyte.instrumentCode;
              lines.push(
                `OBR|${i + 1}|${barcode}|${barcode}|${analyte.instrumentCode}^${primaryCatalog}^YHLO|||${ts}`,
              );
              const ref =
                analyte.referenceLow != null && analyte.referenceHigh != null
                  ? `${analyte.referenceLow}-${analyte.referenceHigh}`
                  : "";
              lines.push(
                `OBX|${i + 1}|NM|${analyte.instrumentCode}^${analyte.instrumentCode}^YHLO||${analyte.value}|${analyte.units}|${ref}|${flagChar(analyte.flag)}|||F`,
              );
            }

            socket.write(wrapMllp(lines.join("\r")));
            const ack = await readMllpMessage(socket, 5000);
            if (!ack.includes("MSA|AA")) {
              throw new Error(`unexpected ACK: ${ack.slice(0, 80)}`);
            }
            socket.end();
            resolve();
          } catch (err) {
            socket.destroy();
            reject(err);
          }
        })();
      },
    );
    socket.setTimeout(15_000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`timeout connecting to ${EDGE_HOST}:${IFLASH_PORT}`));
    });
    socket.on("error", reject);
  });
  console.log(
    `[sim] iFlash ORU (${analytes.length} results) for ${barcode} → ${EDGE_HOST}:${IFLASH_PORT}`,
  );
}

/** Write ProLyte multi-line ASCII block to a PTY path. */
export async function sendProlyte(
  barcode = BARCODE,
  orderedCatalogCodes?: string[],
) {
  const path = PROLYTE_PATH;
  if (!path) {
    throw new Error(
      "Set PROLYTE_SERIAL_PATH to the simulator-side PTY (see docs/LOCAL_DEV.md socat recipe)",
    );
  }

  const ordered =
    orderedCatalogCodes ?? (await resolveOrderForBarcode(barcode));
  if (isSimStrict() && ordered.length === 0) {
    console.log(`[sim] ProLyte skipped — no order for ${barcode}`);
    return;
  }
  if (!analyzerHasWork("diamond_prolyte", ordered)) {
    console.log(`[sim] ProLyte skipped — no electrolytes on order for ${barcode}`);
    return;
  }

  const analytes = analytesForOrder("diamond_prolyte", ordered);
  const ionMap: Record<string, number> = {
    NA: 140.2,
    K: 4.15,
    CL: 102.0,
    LI: 0.85,
  };
  for (const a of analytes) {
    const num = Number(a.value);
    if (!Number.isNaN(num)) {
      ionMap[a.instrumentCode] = num;
    }
  }

  const block = formatProlyteBlock({
    barcode,
    na: ionMap.NA ?? 140.2,
    k: ionMap.K ?? 4.15,
    cl: ionMap.CL ?? 102.0,
    li: ionMap.LI,
  });
  await fs.promises.appendFile(path, block, "utf8");
  console.log(
    `[sim] ProLyte electrolytes (${analytes.length} ions) for ${barcode} → ${path}`,
  );
}

export async function runLoop() {
  console.log(
    "[sim] Analyzer simulators ready. Sending order-aware results every 30s…",
  );
  console.log(
    `[sim] Edge host=${EDGE_HOST} sysmex=${SYSMEX_PORT} mindray=${MINDRAY_PORT} iflash=${IFLASH_PORT} strict=${isSimStrict()}`,
  );
  await sleep(2000);
  for (;;) {
    try {
      const ordered = await resolveOrderForBarcode(BARCODE);
      if (isSimStrict() && ordered.length === 0) {
        console.log(
          `[sim] No order for ${BARCODE} — waiting (SIM_STRICT=1). Accession a specimen first.`,
        );
      } else {
        await sendSysmexCbc(BARCODE, ordered);
        await sleep(800);
        await sendMindrayChem(BARCODE, ordered);
        await sleep(800);
        await sendIflashOru(BARCODE, { orderedCatalogCodes: ordered });
        await sleep(800);
        if (PROLYTE_PATH) {
          await sendProlyte(BARCODE, ordered);
        }
      }
    } catch (err) {
      console.warn(`[sim] send failed (is edge-engine up?):`, err);
    }
    await sleep(30_000);
  }
}

export async function sendAllForBarcode(barcode: string) {
  const ordered = await resolveOrderForBarcode(barcode);
  await sendSysmexCbc(barcode, ordered);
  await sendMindrayChem(barcode, ordered);
  await sendIflashOru(barcode, { orderedCatalogCodes: ordered });
  if (PROLYTE_PATH) {
    await sendProlyte(barcode, ordered);
  }
}

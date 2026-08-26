import * as net from "net";
import * as fs from "fs";
import {
  ASTM,
  sendAstmSession,
  wrapMllp,
  unwrapMllp,
  formatProlyteBlock,
} from "@drax-lis/protocols";

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

/**
 * ACK-aware TCP ASTM E1381 session (instrument / client side).
 */
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

/** Full ENQ/ACK framed CBC session → Sysmex TCP listener. */
export async function sendSysmexCbc(barcode = BARCODE) {
  const records = [
    `H|\\^&|||XS-1000i^1.0|||||||P|E1394-97|${timestamp()}`,
    `P|1||PAT001||Doe^Jane||19900101|F`,
    `O|1|${barcode}|^1^1|^^^CBC|R|${timestamp()}|||||N`,
    `R|1|^^^WBC|6.5|10*3/uL|4.0-11.0|N||F`,
    `R|2|^^^RBC|4.6|10*6/uL|3.8-5.5|N||F`,
    `R|3|^^^HGB|13.8|g/dL|12.0-16.0|N||F`,
    `R|4|^^^HCT|41.2|%|36.0-46.0|N||F`,
    `R|5|^^^PLT|245|10*3/uL|150-400|N||F`,
    `L|1|N`,
  ];
  await sendAstmTcp(EDGE_HOST, SYSMEX_PORT, records);
  console.log(`[sim] Sysmex CBC for ${barcode} → ${EDGE_HOST}:${SYSMEX_PORT}`);
}

/** Mindray chemistry panel over ASTM on :5003. */
export async function sendMindrayChem(barcode = BARCODE) {
  const records = [
    `H|\\^&|||BS-240^Mindray|||||||P|E1394-97|${timestamp()}`,
    `P|1||PAT002||Smith^John||19850505|M`,
    `O|1|${barcode}|^1^1|^^^CHEM|R|${timestamp()}|||||N`,
    `R|1|^^^GLU|95|mg/dL|70-100|N||F`,
    `R|2|^^^BUN|18|mg/dL|7-20|N||F`,
    `R|3|^^^CREA|0.9|mg/dL|0.6-1.2|N||F`,
    `R|4|^^^ALT|55|U/L|7-56|N||F`,
    `R|5|^^^AST|42|U/L|10-40|H||F`,
    `L|1|N`,
  ];
  await sendAstmTcp(EDGE_HOST, MINDRAY_PORT, records);
  console.log(
    `[sim] Mindray CHEM for ${barcode} → ${EDGE_HOST}:${MINDRAY_PORT}`,
  );
}

/**
 * iFlash ORU over MLLP; waits for ACK^R01.
 * Optional QRY round-trip when opts.queryOrders is true.
 */
export async function sendIflashOru(
  barcode = BARCODE,
  opts: { queryOrders?: boolean } = {},
) {
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
            const msg = [
              `MSH|^~\\&|YHLO|iFlash1200|||${ts}||ORU^R01|MSG${ts}|P|2.3.1`,
              `PID|1||PAT001||Doe^Jane||19900101|F`,
              `OBR|1|${barcode}|${barcode}|TSH^Thyroid Stimulating Hormone^YHLO|||${ts}`,
              `OBX|1|NM|TSH^TSH^YHLO||2.45|mIU/L|0.35-4.94|N|||F`,
            ].join("\r");
            socket.write(wrapMllp(msg));
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
    `[sim] iFlash ORU for ${barcode} → ${EDGE_HOST}:${IFLASH_PORT}`,
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

/** Write ProLyte multi-line ASCII block to a PTY path. */
export async function sendProlyte(barcode = BARCODE) {
  const path = PROLYTE_PATH;
  if (!path) {
    throw new Error(
      "Set PROLYTE_SERIAL_PATH to the simulator-side PTY (see docs/LOCAL_DEV.md socat recipe)",
    );
  }
  const block = formatProlyteBlock({
    barcode,
    na: 140.2,
    k: 4.15,
    cl: 102.0,
    li: 0.85,
  });
  await fs.promises.appendFile(path, block, "utf8");
  console.log(`[sim] ProLyte electrolytes for ${barcode} → ${path}`);
}

export async function runLoop() {
  console.log(
    "[sim] Analyzer simulators ready. Sending canned results every 30s…",
  );
  console.log(
    `[sim] Edge host=${EDGE_HOST} sysmex=${SYSMEX_PORT} mindray=${MINDRAY_PORT} iflash=${IFLASH_PORT}`,
  );
  await sleep(2000);
  for (;;) {
    try {
      await sendSysmexCbc();
      await sleep(800);
      await sendMindrayChem();
      await sleep(800);
      await sendIflashOru();
    } catch (err) {
      console.warn(`[sim] send failed (is edge-engine up?):`, err);
    }
    await sleep(30_000);
  }
}

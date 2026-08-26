import * as net from "net";

const PORT = Number(process.env.ZEBRA_PRINTER_PORT ?? 9100);

/**
 * Fake Zebra: listens on TCP 9100 and logs received ZPL.
 */
export function startZebraSimulator() {
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on("data", (d) => chunks.push(d));
    socket.on("end", () => {
      const zpl = Buffer.concat(chunks).toString("utf8");
      console.log("──────── ZPL RECEIVED ────────");
      console.log(zpl.trim() || "(empty)");
      console.log("──────────────────────────────");
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[sim] Fake Zebra listening on :${PORT}`);
  });

  return server;
}

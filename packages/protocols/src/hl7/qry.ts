/**
 * HL7 QRY^Q02 helpers for host-query (instrument asks LIS for orders by barcode).
 */

export type ParsedQry = {
  messageControlId: string;
  /** Specimen / barcode id from QRD or QRF */
  barcode?: string;
  rawSegments: string[];
};

/**
 * Parse QRY^Q02. Barcode is typically in QRD-8 (Who Subject Filter)
 * or the first QRF field.
 */
export function parseQry(message: string): ParsedQry {
  const segments = message
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let messageControlId = "";
  let barcode: string | undefined;

  for (const seg of segments) {
    const fields = seg.split("|");
    const type = fields[0]?.slice(0, 3);
    if (type === "MSH") {
      messageControlId = fields[9] ?? "";
    } else if (type === "QRD") {
      // QRD-8 Who Subject Filter (index 8); tolerate off-by-one vendor variants
      const who = fields[8] || fields[9] || "";
      barcode = who.split("^")[0] || barcode;
    } else if (type === "QRF" && !barcode) {
      barcode = (fields[1] ?? "").split("^")[0] || undefined;
    }
  }

  return { messageControlId, barcode, rawSegments: segments };
}

export type OrderedTestPayload = {
  code: string;
  name?: string;
};

/**
 * Build a minimal DSR^Q03-style order reply the edge can MLLP-wrap.
 * Many instruments accept OBR list in a simplified ACK/DSR; we emit
 * MSH + MSA + QRD echo + one OBR per ordered test.
 */
export function buildOrderResponse(opts: {
  originalQry: string;
  barcode: string;
  orderedTests: OrderedTestPayload[];
  patientName?: string;
}): string {
  const parsed = parseQry(opts.originalQry);
  const msh = opts.originalQry
    .split(/\r\n|\r|\n/)
    .find((s) => s.startsWith("MSH|"));
  const fields = msh?.split("|") ?? [];
  const sendingApp = fields[2] ?? "ANALYZER";
  const sendingFac = fields[3] ?? "";
  const receivingApp = fields[4] ?? "DRAX_LIS";
  const receivingFac = fields[5] ?? "";
  const version = fields[11] ?? "2.5";
  const ts = hl7Timestamp();
  const ctrl = parsed.messageControlId || String(Date.now());

  const lines = [
    `MSH|^~\\&|${receivingApp}|${receivingFac}|${sendingApp}|${sendingFac}|${ts}||DSR^Q03|RSP${ctrl}|P|${version}`,
    `MSA|AA|${ctrl}`,
    `QRD|${ts}|R|I|Q${ctrl}|||||${opts.barcode}`,
  ];

  if (opts.patientName) {
    const [first, ...rest] = opts.patientName.split(" ");
    const last = rest.join(" ") || first;
    lines.push(`PID|||${opts.barcode}||${last}^${first}`);
  }

  opts.orderedTests.forEach((t, i) => {
    const name = t.name ?? t.code;
    lines.push(
      `OBR|${i + 1}|${opts.barcode}||${t.code}^${name}|||${ts}`,
    );
  });

  return lines.join("\r");
}

function hl7Timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** True on lab production images and when explicitly enabled for staging. */
export function isProductionHardened(): boolean {
  if (process.env.EDGE_HARDENING === "true") return true;
  if (process.env.EDGE_HARDENING === "false") return false;
  return process.env.NODE_ENV === "production";
}

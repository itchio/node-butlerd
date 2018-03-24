import * as crypto from "crypto";

export function sha256(str: string) {
  const h = crypto.createHash("sha256");
  const hashBuf = h.update(str, "utf8").digest();
  const hexCodes = [];
  for (let i = 0; i < hashBuf.length; i++) {
    const value = hashBuf[i];
    const stringValue = value.toString(16);
    const padding = "00";
    const paddedValue = (padding + stringValue).slice(-padding.length);
    hexCodes.push(paddedValue);
  }
  return hexCodes.join("");
}

import "server-only";
import { createHmac } from "node:crypto";
export function connectionProof(secret: string, operation: "confirm-pairing" | "acknowledge-provisioning", fields: Array<string | number>): string {
  return createHmac("sha256", secret).update(JSON.stringify(["stellar-connection-v1", operation, ...fields.map(String)])).digest("base64url");
}

import { createHash } from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const compareCodePoints = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export const canonicalize = (value: JsonValue): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => compareCodePoints(left, right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(",")}}`;
};

export const canonicalDigest = (value: JsonValue): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;

export type CreateIntent = { requestId: string; name: string };
export function intentStorageKey(subject: string, tenantId: string) {
  return `stellar.platform.create:${encodeURIComponent(subject)}:${encodeURIComponent(tenantId)}`;
}
export function parseIntent(raw: string | null): CreateIntent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("name" in value) || !("requestId" in value) ||
      typeof value.name !== "string" || typeof value.requestId !== "string" ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9 .,'&()_-]{0,78}[A-Za-z0-9])?$/.test(value.name) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.requestId)) return null;
    return { name: value.name, requestId: value.requestId };
  } catch { return null; }
}
export function newIntent(name: string, requestId: string): CreateIntent | null {
  return parseIntent(JSON.stringify({ name: name.trim(), requestId }));
}

/** Explicit resolution clears only this actor and tenant, never another pending request. */
export function discardIntent(storage: Pick<Storage, "removeItem">, subject: string, tenantId: string) {
  storage.removeItem(intentStorageKey(subject, tenantId));
}

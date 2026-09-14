import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { durableJson, syncDirectory } from "./storage.js";

type Owner = { version: 1; pid: number; token: string };

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export class DataLease {
  private constructor(readonly directory: string, readonly token: string) {}

  static async acquire(data: string): Promise<DataLease> {
    await mkdir(data, { recursive: true, mode: 0o700 });
    const canonicalData = await realpath(data);
    const directory = path.join(canonicalData, ".runner-lease");
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = randomUUID();
      try {
        await mkdir(directory, { mode: 0o700 });
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;
        const recovery = path.join(canonicalData, ".runner-lease-recovery");
        try { await mkdir(recovery, { mode: 0o700 }); }
        catch (guardFailure) {
          if ((guardFailure as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Another local runner is recovering this data directory");
          throw guardFailure;
        }
        try {
          await syncDirectory(canonicalData);
          const info = await lstat(directory);
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe local runner lease path");
          let owner: Owner | null = null;
          try {
            const ownerFile = path.join(directory, "owner.json");
            if ((await lstat(ownerFile)).isSymbolicLink()) throw new Error("Unsafe local runner owner path");
            owner = JSON.parse(await readFile(ownerFile, "utf8")) as Owner;
          } catch (readFailure) {
            if ((readFailure as NodeJS.ErrnoException).code !== "ENOENT" && !(readFailure instanceof SyntaxError)) throw readFailure;
          }
          if (owner?.version === 1 && alive(owner.pid)) throw new Error("Another local runner owns this data directory");
          if (!owner) {
            const age = Date.now() - (await stat(directory)).mtimeMs;
            if (age < 10_000) throw new Error("Another local runner is acquiring this data directory");
          }
          const stale = `${directory}.stale-${randomUUID()}`;
          await rename(directory, stale);
          await syncDirectory(canonicalData);
          await rm(stale, { recursive: true, force: true });
        } finally {
          await rm(recovery, { recursive: true, force: true });
          await syncDirectory(canonicalData);
        }
        continue;
      }
      try {
        await syncDirectory(canonicalData);
        await durableJson(path.join(directory, "owner.json"), { version: 1, pid: process.pid, token } satisfies Owner);
        return new DataLease(directory, token);
      } catch (writeFailure) {
        await rm(directory, { recursive: true, force: true });
        await syncDirectory(canonicalData);
        throw writeFailure;
      }
    }
    throw new Error("Could not acquire local runner data directory");
  }

  async release(): Promise<void> {
    let owner: Owner;
    try { owner = JSON.parse(await readFile(path.join(this.directory, "owner.json"), "utf8")) as Owner; }
    catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === "ENOENT") return;
      throw failure;
    }
    if (owner.token !== this.token || owner.pid !== process.pid) throw new Error("Local runner ownership changed");
    await rm(this.directory, { recursive: true });
    await syncDirectory(path.dirname(this.directory));
  }
}

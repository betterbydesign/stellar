import type { Workspace } from "../../lib/platform/http";
import { platformRequest, PlatformRequestError } from "./client";

/** Bootstrap only a missing personal account; never recover access by granting it. */
export async function loadAccount(organizationId: string | null, request = platformRequest): Promise<Workspace> {
  try { return await request<Workspace>("workspace"); }
  catch (error) {
    if (organizationId || !(error instanceof PlatformRequestError) || error.code !== "WORKSPACE_NOT_PROVISIONED") throw error;
    await request("workspace", {});
    return request<Workspace>("workspace");
  }
}

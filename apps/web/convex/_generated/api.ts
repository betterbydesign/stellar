/* eslint-disable */
/**
 * Offline-compatible utilities for referencing Convex functions.
 * Regenerate this file with `convex codegen` once a deployment is configured.
 */
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi } from "convex/server";
import type * as platform from "../platform.js";
import type * as proposals from "../proposals.js";

const fullApi: ApiFromModules<{
  platform: typeof platform;
  proposals: typeof proposals;
}> = anyApi as any;

export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

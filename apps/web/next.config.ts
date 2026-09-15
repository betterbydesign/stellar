import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    // The repository root owns the shared agent harness and instructions.
    agentRules: false,
    // Separate the authenticated launcher from a web-only dev server's lock and
    // generated output. Build/start still share the ordinary production directory.
    distDir: phase === PHASE_DEVELOPMENT_SERVER && process.env.STELLAR_LOCAL_MODE === "1"
      ? ".next-local" : ".next",
  };
}

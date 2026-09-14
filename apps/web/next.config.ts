import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repository root owns the shared agent harness and instructions.
  agentRules: false,
};

export default nextConfig;

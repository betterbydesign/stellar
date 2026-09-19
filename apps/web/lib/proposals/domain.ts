import {
  ChangeProposalSchema,
  PrepareChangeSchema,
  type ChangeProposal,
  type PrepareChange,
} from "@stellar/contracts";

export type ProposalStatus = "proposed" | "approved" | "rejected" | "cancelled" | "expired";
export type ProposalAction = "approve" | "reject" | "cancel";
export type ProposalProvenance = {
  adapter: "runner-prepare" | "offline-test";
  version: string;
};
export type ProposalJob = {
  tenantId: string;
  projectId: string;
  initiatingActor: { subject: string; identityNamespace: string };
  requestId: string;
  sourceRevision: string;
  commandDigest: string;
  provenance: ProposalProvenance;
  createdAt: number;
  expiresAt: number;
  status: Exclude<ProposalStatus, "expired">;
};

export const PROPOSAL_EXECUTION_POLICY = Object.freeze({
  providerEnabled: false,
  sourceApplicationEnabled: false,
  maximumSpendUsd: 0,
} as const);
export type ProposalSummary = {
  id: string;
  jobId: string;
  projectId: string;
  status: ProposalStatus;
  digest: string;
  sourceRevision: string;
  expiresAt: number;
  createdAt: number;
};
export type ProposalDetail = ProposalSummary & {
  prepareChange: PrepareChange;
  sourceProposal: ChangeProposal;
  initiatingActor: { subject: string; identityNamespace: string };
  provenance: ProposalProvenance;
  decision: null | {
    action: ProposalAction;
    actorSubject: string;
    requestId: string;
    decidedAt: number;
  };
  decisionHistory: Array<{
    action: ProposalAction;
    actorSubject: string;
    requestId: string;
    decidedAt: number;
  }>;
  application: { status: "unavailable"; code: "RUNNER_DISCONNECTED" };
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validProposalRequestId(value: string): boolean {
  return REQUEST_ID_PATTERN.test(value);
}

export function validDigest(value: string): boolean {
  return SHA256_PATTERN.test(value);
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(sorted(value));
  if (json === undefined) throw new Error("INVALID_PROPOSAL");
  return json;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type SealInput = {
  tenantId: string;
  projectId: string;
  initiatingActor: { subject: string; identityNamespace: string };
  requestId: string;
  prepareChange: unknown;
  sourceProposal: unknown;
  createdAt: number;
  expiresAt: number;
  provenance: ProposalProvenance;
};

export async function sealProposal(input: SealInput) {
  const prepareChange = PrepareChangeSchema.parse(input.prepareChange);
  const sourceProposal = ChangeProposalSchema.parse(input.sourceProposal);
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.tenantId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.projectId) ||
    !/^\S{1,512}$/.test(input.initiatingActor.subject) ||
    !/^\S{1,256}$/.test(input.initiatingActor.identityNamespace) ||
    !validProposalRequestId(input.requestId) ||
    !VERSION_PATTERN.test(input.provenance.version) ||
    !["runner-prepare", "offline-test"].includes(input.provenance.adapter) ||
    !Number.isSafeInteger(input.createdAt) ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.createdAt < 0 ||
    input.expiresAt <= input.createdAt ||
    input.expiresAt - input.createdAt > 24 * 60 * 60 * 1000 ||
    prepareChange.projectId !== sourceProposal.projectId ||
    prepareChange.sessionId !== sourceProposal.sessionId ||
    prepareChange.targetId !== sourceProposal.targetId ||
    prepareChange.expectedRevision !== sourceProposal.baseRevision ||
    canonicalJson(prepareChange.command) !== canonicalJson(sourceProposal.command)
  ) {
    throw new Error("INVALID_PROPOSAL");
  }
  const prepareJson = canonicalJson(prepareChange);
  const sourceProposalJson = canonicalJson(sourceProposal);
  if (prepareJson.length > 4096 || sourceProposalJson.length > 32768) {
    throw new Error("INVALID_PROPOSAL");
  }
  const scope = {
    version: 1,
    tenantId: input.tenantId,
    projectId: input.projectId,
    actor: input.initiatingActor,
    requestId: input.requestId,
    prepareChange,
    sourceProposal,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    provenance: input.provenance,
  };
  return {
    prepareChange,
    sourceProposal,
    prepareJson,
    sourceProposalJson,
    digest: await sha256(canonicalJson(scope)),
    commandDigest: await sha256(canonicalJson(prepareChange)),
  };
}

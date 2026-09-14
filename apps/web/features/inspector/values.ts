import { CommandSchema, type Command, type StyleControl, type StyleValue, type TokenDefinition } from "@stellar/contracts";

export const propertyLabel: Record<StyleControl["property"], string> = {
  color: "Text color", "background-color": "Background color",
  "padding-inline": "Inline padding", "padding-block": "Block padding",
  gap: "Gap", "border-radius": "Corner radius",
};

export function formatValue(value: StyleValue | null): string {
  if (!value) return "Not authored here";
  if (value.kind === "color") return value.hex;
  if (value.kind === "length") return `${value.amount}${value.unit}`;
  return `var(${value.name})`;
}

export function parseLocalValue(
  control: StyleControl,
  input: { mode: "literal" | "token"; hex: string; amount: string; unit: string; token: string },
): { value: StyleValue | null; error: string | null } {
  if (input.mode === "token") {
    if (!control.allowedTokenNames.includes(input.token)) return { value: null, error: "Choose an allowed token." };
    return { value: { kind: "token", name: input.token }, error: null };
  }
  if (control.valueType === "color") {
    if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(input.hex))
      return { value: null, error: "Enter a 6- or 8-digit hex color." };
    return { value: { kind: "color", hex: input.hex }, error: null };
  }
  const amount = Number(input.amount);
  if (!input.amount.trim() || !Number.isFinite(amount) ||
    control.min === null || control.max === null || amount < control.min || amount > control.max)
    return { value: null, error: `Enter a number from ${control.min} to ${control.max}.` };
  if (input.unit !== "px" && input.unit !== "rem" || !control.allowedUnits.includes(input.unit))
    return { value: null, error: "Choose an allowed unit." };
  return { value: { kind: "length", amount, unit: input.unit }, error: null };
}

export function localCommand(control: StyleControl, value: StyleValue): Command | null {
  const parsed = CommandSchema.safeParse({ type: "style.set", property: control.property, scopeId: control.scopeId, value });
  return parsed.success ? parsed.data : null;
}

export function isLocalCommandAllowed(control: StyleControl, command: Command): boolean {
  if (command.type === "token.set" || command.property !== control.property || command.scopeId !== control.scopeId) return false;
  if (command.type === "style.reset") return control.provenance === "override" && control.authoredValue !== null;
  const value = command.value;
  if (value.kind === "token") return control.allowedTokenNames.includes(value.name);
  if (value.kind !== control.valueType) return false;
  if (value.kind === "color") return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value.hex);
  return control.allowedUnits.includes(value.unit) && control.min !== null && control.max !== null &&
    value.amount >= control.min && value.amount <= control.max;
}

export function isTokenCommandAllowed(target: TokenDefinition, command: Command): boolean {
  if (command.type !== "token.set" || !target.editable) return false;
  const value = command.value;
  if (value.kind !== target.valueType) return false;
  if (value.kind === "color") return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value.hex);
  return target.allowedUnits.includes(value.unit) && target.min !== null && target.max !== null &&
    value.amount >= target.min && value.amount <= target.max;
}

export function parseTokenValue(
  target: TokenDefinition,
  input: { hex: string; amount: string; unit: string },
): { command: Command | null; error: string | null } {
  let value: unknown;
  if (target.valueType === "color") {
    if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(input.hex))
      return { command: null, error: "Enter a 6- or 8-digit hex color." };
    value = { kind: "color", hex: input.hex };
  } else {
    const amount = Number(input.amount);
    if (!input.amount.trim() || !Number.isFinite(amount) || target.min === null || target.max === null ||
      amount < target.min || amount > target.max) return { command: null, error: `Enter a number from ${target.min} to ${target.max}.` };
    if (input.unit !== "px" && input.unit !== "rem" || !target.allowedUnits.includes(input.unit))
      return { command: null, error: "Choose an allowed unit." };
    value = { kind: "length", amount, unit: input.unit };
  }
  const parsed = CommandSchema.safeParse({ type: "token.set", value });
  return parsed.success ? { command: parsed.data, error: null } : { command: null, error: "Unsupported token value." };
}

export function readOnlyExplanation(reason: string | null): string {
  const reasons: Record<string, string> = {
    "repeated-component": "This component appears more than once; a single instance has no safe source owner.",
    "dynamic-source": "This element is generated dynamically and has no stable editable declaration.",
    "ambiguous-owner": "Several source declarations could own this style.",
    "unsupported-source": "This source pattern is outside the supported editor rules.",
    inherited: "This value is inherited; no owned override is available here.",
    "alias-cycle": "The token aliases form a cycle and cannot be changed here.",
    "unknown-token": "The token definition cannot be resolved to an approved leaf.",
    "scope-ambiguous": "The declaration's responsive scope is ambiguous.",
  };
  return reason ? reasons[reason] ?? "This source target is read-only." : "This source target is read-only.";
}

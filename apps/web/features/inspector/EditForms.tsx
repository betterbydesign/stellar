"use client";

import { useState } from "react";
import type { Command, StyleControl, TokenDefinition } from "@stellar/contracts";
import { localCommand, parseLocalValue, parseTokenValue } from "./values";
import styles from "./Inspector.module.css";

type Change = (command: Command | null, error: string | null, description: string) => void;

export function LocalEditForm({ control, disabled, onChange }: {
  control: StyleControl; disabled: boolean; onChange: Change;
}) {
  const authored = control.authoredValue ?? control.resolvedValue;
  const [mode, setMode] = useState<"literal" | "token">(authored?.kind === "token" ? "token" : "literal");
  const [hex, setHex] = useState(authored?.kind === "color" ? authored.hex : "#000000");
  const [amount, setAmount] = useState(authored?.kind === "length" ? String(authored.amount) : String(control.min ?? 0));
  const [unit, setUnit] = useState(authored?.kind === "length" ? authored.unit : control.allowedUnits[0] ?? "px");
  const [token, setToken] = useState(authored?.kind === "token" ? authored.name : control.allowedTokenNames[0] ?? "");
  const [error, setError] = useState<string | null>(null);

  function change(next: { mode: "literal" | "token"; hex: string; amount: string; unit: string; token: string }) {
    const parsed = parseLocalValue(control, next);
    const command = parsed.value ? localCommand(control, parsed.value) : null;
    const issue = parsed.error ?? (command ? null : "This value is not supported.");
    setError(issue);
    onChange(command, issue, `${control.property} · ${control.scopeId}`);
  }

  const input = { mode, hex, amount, unit, token };
  return <div className={styles.form}>
    <label className={styles.field}>
      <span>Value type</span>
      <select value={mode} disabled={disabled} onChange={(event) => {
        const nextMode = event.target.value as "literal" | "token";
        setMode(nextMode); change({ ...input, mode: nextMode });
      }}>
        <option value="literal">Local value</option>
        {control.allowedTokenNames.length > 0 && <option value="token">Allowed token reference</option>}
      </select>
    </label>
    {mode === "token" ? <label className={styles.field}>
      <span>Token reference</span>
      <select value={token} disabled={disabled} onChange={(event) => {
        setToken(event.target.value); change({ ...input, token: event.target.value });
      }}>
        {control.allowedTokenNames.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </label> : control.valueType === "color" ? <label className={styles.field}>
      <span>Hex color</span>
      <input value={hex} disabled={disabled} spellCheck={false} aria-invalid={!!error} onChange={(event) => {
        setHex(event.target.value); change({ ...input, hex: event.target.value });
      }} />
    </label> : <div className={styles.row}>
      <label className={styles.field}>
        <span>Length</span>
        <input type="number" step="any" min={control.min ?? undefined} max={control.max ?? undefined}
          value={amount} disabled={disabled} aria-invalid={!!error} onChange={(event) => {
            setAmount(event.target.value); change({ ...input, amount: event.target.value });
          }} />
      </label>
      <label className={styles.field}>
        <span>Unit</span>
        <select value={unit} disabled={disabled} onChange={(event) => {
          setUnit(event.target.value as "px" | "rem"); change({ ...input, unit: event.target.value as "px" | "rem" });
        }}>
          {control.allowedUnits.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>}
    {control.valueType === "length" && <small>Allowed: {control.min}–{control.max} {control.allowedUnits.join(" or ")}</small>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.hint}>Changing this field creates an unsaved draft. Review the source patch before applying.</p>
  </div>;
}

export function TokenEditForm({ target, disabled, onChange }: {
  target: TokenDefinition; disabled: boolean; onChange: Change;
}) {
  const [hex, setHex] = useState(target.authoredValue.kind === "color" ? target.authoredValue.hex : "#000000");
  const [amount, setAmount] = useState(target.authoredValue.kind === "length" ? String(target.authoredValue.amount) : String(target.min ?? 0));
  const [unit, setUnit] = useState(target.authoredValue.kind === "length" ? target.authoredValue.unit : target.allowedUnits[0] ?? "px");
  const [error, setError] = useState<string | null>(null);
  const input = { hex, amount, unit };

  function change(next: typeof input) {
    const result = parseTokenValue(target, next);
    setError(result.error);
    onChange(result.command, result.error, `Shared token ${target.tokenName}`);
  }

  return <div className={styles.form}>
    {target.valueType === "color" ? <label className={styles.field}>
      <span>Concrete token color</span>
      <input value={hex} disabled={disabled} spellCheck={false} aria-invalid={!!error} onChange={(event) => {
        setHex(event.target.value); change({ ...input, hex: event.target.value });
      }} />
    </label> : <div className={styles.row}>
      <label className={styles.field}>
        <span>Concrete token length</span>
        <input type="number" step="any" min={target.min ?? undefined} max={target.max ?? undefined}
          value={amount} disabled={disabled} aria-invalid={!!error} onChange={(event) => {
            setAmount(event.target.value); change({ ...input, amount: event.target.value });
          }} />
      </label>
      <label className={styles.field}>
        <span>Unit</span>
        <select value={unit} disabled={disabled} onChange={(event) => {
          setUnit(event.target.value as "px" | "rem"); change({ ...input, unit: event.target.value as "px" | "rem" });
        }}>
          {target.allowedUnits.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>}
    {target.valueType === "length" && <small>Allowed: {target.min}–{target.max} {target.allowedUnits.join(" or ")}</small>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.hint}>This edits the approved concrete base definition. Semantic aliases remain references.</p>
  </div>;
}

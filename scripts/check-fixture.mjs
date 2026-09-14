import { readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { parse } from "@astrojs/compiler";
import postcss from "postcss";
import { parseProjectManifest, resolveTokenLeaf } from "@stellar/contracts";

export const fixtureRoot = fileURLToPath(new URL("../fixtures/astro-style-lab/", import.meta.url));

function allNodes(node) {
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

function matchesAnchor(node, locator) {
  if (!/^[.#][A-Za-z][\w-]*$/.test(locator)) return false;
  const attribute = node.attributes?.find((item) => item.name === (locator[0] === "#" ? "id" : "class") && item.kind === "quoted");
  return locator[0] === "#" ? attribute?.value === locator.slice(1) : attribute?.value.split(/\s+/).includes(locator.slice(1));
}

function mediaContext(rule) {
  const ancestors = [];
  for (let parent = rule.parent; parent?.type !== "root"; parent = parent?.parent) {
    if (!parent || parent.type !== "atrule" || parent.name !== "media") return undefined;
    ancestors.push(parent.params.trim());
  }
  return ancestors.length === 0 ? null : ancestors.length === 1 ? ancestors[0] : undefined;
}

// Checks the controlled fixture's authored identities, not arbitrary Astro/CSS semantics.
// It never executes frontmatter or acts as the future source writer/cascade resolver.
export async function validateFixture(root = fixtureRoot) {
  const errors = [];
  let manifest;
  try {
    const canonicalRoot = await realpath(root);
    const texts = new Map();
    const asts = new Map();
    const styles = new Map();
    async function source(file) {
      if (!texts.has(file)) {
        const path = await realpath(resolve(root, file));
        const within = relative(canonicalRoot, path);
        if (isAbsolute(within) || within === ".." || within.startsWith("../")) throw new Error("Source path escapes fixture: " + file);
        texts.set(file, await readFile(path, "utf8"));
      }
      return texts.get(file);
    }
    async function astro(file) {
      if (!asts.has(file)) {
        const result = await parse(await source(file), { position: true });
        if (result.diagnostics.some((item) => item.severity === 1)) throw new Error("Astro parse failed: " + file);
        asts.set(file, allNodes(result.ast));
      }
      return asts.get(file);
    }
    async function css(file) {
      if (!styles.has(file)) styles.set(file, postcss.parse(await source(file), { from: file }));
      return styles.get(file);
    }
    async function declaration(ref, required) {
      const rules = [];
      (await css(ref.file)).walkRules((rule) => {
        if (rule.selector.trim() === ref.selector && mediaContext(rule) === ref.atRule) rules.push(rule);
      });
      if (rules.length !== 1) {
        errors.push("CSS identity must match one rule: " + ref.file + " " + ref.selector + " " + ref.scopeId);
        return null;
      }
      const declarations = rules[0].nodes.filter((node) => node.type === "decl" && node.prop === ref.property);
      if (declarations.length > 1 || (required && declarations.length !== 1) || declarations.some((node) => node.important)) {
        errors.push("CSS declaration is missing, duplicated or important: " + ref.selector + " " + ref.property);
        return null;
      }
      return declarations[0] ?? null;
    }
    manifest = parseProjectManifest(JSON.parse(await source(".stellar/project.json")));
    for (const page of manifest.pages) await astro(page.sourceFile);
    for (const file of manifest.allowedCssFiles) await css(file);
    const owners = new Map();
    for (const target of manifest.targets) {
      const matches = (await astro(target.source.file)).filter((node) => matchesAnchor(node, target.source.locator));
      if (matches.length !== 1) {
        errors.push("Source anchor must match one authored node: " + target.anchor);
        continue;
      }
      owners.set(target.anchor, matches[0]);
      const page = manifest.pages.find((item) => item.id === target.pageId);
      if (target.editable && (target.source.file !== page.sourceFile || target.source.componentDefinitionFile !== null)) errors.push("Editable target must be uniquely owned by its page: " + target.anchor);
      if (target.readOnlyReason === "dynamic-source" && !allNodes(matches[0]).some((node) => node.type === "expression")) errors.push("Dynamic fixture case lacks an expression: " + target.anchor);
      if (target.readOnlyReason === "repeated-component") {
        const definition = target.source.componentDefinitionFile;
        if (!definition || target.source.file !== definition || target.source.componentCallSiteFile !== page.sourceFile) {
          errors.push("Shared component owner mismatch: " + target.anchor);
        } else {
          const instances = (await astro(page.sourceFile)).filter((node) => node.type === "component" && node.name === basename(definition, ".astro"));
          if (instances.length < 2) errors.push("Repeated fixture component requires two call sites: " + target.anchor);
        }
      }
    }
    const fallbacks = new Map();
    for (const rule of manifest.styleRules) {
      const owner = owners.get(rule.anchor);
      if (!owner || !matchesAnchor(owner, rule.fallback.selector) || !matchesAnchor(owner, rule.override.selector)) errors.push("CSS selectors do not bind to target owner: " + rule.anchor);
      fallbacks.set(rule, await declaration(rule.fallback, true));
      await declaration(rule.override, false);
    }
    for (const token of manifest.tokens) {
      const authored = await declaration(token.source, true);
      let definitions = 0;
      for (const style of styles.values()) style.walkDecls(token.name, () => { definitions++; });
      if (definitions !== 1) errors.push("Token must have exactly one authored definition: " + token.name);
      if (!authored) continue;
      if (token.kind === "alias") {
        if (authored.value.trim() !== "var(" + token.reference + ")") errors.push("Alias source differs from manifest: " + token.name);
      } else {
        const value = authored.value.trim();
        if (token.valueType === "color" && !/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) errors.push("Concrete color token must be a supported literal: " + token.name);
        if (token.valueType === "length") {
          const match = /^(\d+(?:\.\d+)?|\.\d+)(px|rem)$/.exec(value);
          if (!match || !token.allowedUnits.includes(match[2]) || Number(match[1]) < token.min || Number(match[1]) > token.max) errors.push("Concrete length token violates declared bounds: " + token.name);
        }
        for (const anchor of token.impact.anchors) {
          const related = manifest.styleRules.filter((rule) => rule.anchor === anchor).some((rule) => {
            const references = [...(fallbacks.get(rule)?.value ?? "").matchAll(/var\((--[\w-]+)\)/g)];
            return references.some((match) => resolveTokenLeaf(manifest, match[1])?.id === token.id);
          });
          if (!related) errors.push("Declared token impact lacks an authored fallback reference: " + token.name + " " + anchor);
        }
      }
    }
  } catch (error) {
    errors.push(error.name === "ZodError" ? "Fixture manifest failed contract validation" : error.code === "ENOENT" ? "Fixture references a missing source file" : error.message);
  }
  return { errors, pages: manifest?.pages.length ?? 0, targets: manifest?.targets.length ?? 0, rules: manifest?.styleRules.length ?? 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateFixture();
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Fixture source validation passed: " + result.pages + " pages, " + result.targets + " targets, " + result.rules + " style rules.");
}

#!/usr/bin/env ts-node

/**
 * ebnf-check.ts
 * A lightweight validator for the simple EBNF flavor produced by g4-to-ebnf.ts.
 * - Rules look like:  Name ::= RHS ;
 * - RHS may use: | ( ) ? * +  quoted strings '...' or "..." and char classes [...]
 * - Comments: (* ... *)  // ...  /* ... *\/
 */

import { readFileSync } from "fs";
import * as path from "path";

// ---- CLI ----
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: ts-node ebnf-check.ts <file.ebnf> [--start <ruleName>]");
  process.exit(1);
}
const filePath = args[0];
let startOverride = "";
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--start") startOverride = args[i + 1] ?? "";
}

// ---- Types ----
type Rule = { name: string; rhs: string; line: number };

// ---- Utils ----
const read = (p: string) => readFileSync(p, "utf8");

// Comments: (* ... *), //..., /* ... */
function stripComments(src: string): string {
  let s = src;
  s = s.replace(/\(\*[\s\S]*?\*\)/g, "");      // (* ... *)
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");      // /* ... */
  s = s.replace(/(^|\s)\/\/.*$/gm, (_m, p1) => (p1 ? p1 : "")); // // ...
  return s;
}

// Extract rules: Name ::= ... ;
function extractRules(src: string): Rule[] {
  const rules: Rule[] = [];
  const re = /(^|\n)\s*([A-Za-z_]\w*)\s*::=\s*([\s\S]*?)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[2];
    const rhs = m[3].trim();
    const upTo = src.slice(0, m.index);
    const line = (upTo.match(/\n/g) || []).length + 1;
    rules.push({ name, rhs, line });
  }
  return rules;
}

function isUpperIdent(id: string) { return /^[A-Z_][A-Z0-9_]*$/.test(id); }
function isLowerIdent(id: string) { return /^[a-z_][A-Za-z0-9_]*$/.test(id); }

// Scan a RHS and validate bracket/quote balance; also split top-level alternates.
function splitAlternatives(rhs: string): { alts: string[], errors: string[] } {
  const alts: string[] = [];
  const errs: string[] = [];

  let i = 0, depthPar = 0, depthBr = 0;
  let current = "";
  while (i < rhs.length) {
    const ch = rhs[i];

    // quoted strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch; i++;
      while (i < rhs.length) {
        const c = rhs[i];
        current += c; i++;
        if (c === "\\" && i < rhs.length) { current += rhs[i]; i++; continue; }
        if (c === quote) break;
      }
      continue;
    }

    // character class [...]
    if (ch === "[" ) {
      depthBr++; current += ch; i++;
      while (i < rhs.length && depthBr > 0) {
        const c = rhs[i];
        current += c; i++;
        if (c === "\\" && i < rhs.length) { current += rhs[i]; i++; continue; }
        else if (c === "[") depthBr++;
        else if (c === "]") depthBr--;
      }
      continue;
    }

    if (ch === "(") { depthPar++; current += ch; i++; continue; }
    if (ch === ")") { depthPar--; if (depthPar < 0) errs.push("Unbalanced ')'"); current += ch; i++; continue; }

    if (ch === "|" && depthPar === 0 && depthBr === 0) {
      alts.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += ch; i++;
  }
  if (depthPar !== 0) errs.push("Unbalanced parentheses");
  if (depthBr !== 0) errs.push("Unbalanced '[' or ']'");
  if (current.trim().length) alts.push(current.trim());

  // empty alternatives like "A | | B"
  if (alts.some(a => a.length === 0)) errs.push("Empty alternative '|' detected");

  return { alts, errors: errs };
}

// Pull identifiers referenced in an alternative (ignoring quotes and char classes)
function referencedIdents(expr: string): string[] {
  // Remove quoted strings and char classes to avoid fake hits
  let s = expr
    .replace(/'([^'\\]|\\.)*'/g, " ")
    .replace(/"([^"\\]|\\.)*"/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
  // Remove operators and punctuation
  s = s.replace(/[()?*+]/g, " ");
  // Now grab identifiers
  const ids = s.match(/\b[A-Za-z_]\w*\b/g) || [];
  return ids;
}

// First identifier in an alt (ignoring strings, classes, parens that start the alt)
function firstIdentifier(expr: string): string | null {
  // Strip leading grouping parentheses
  let s = expr.trim();
  // Consume leading parenthesized groups, strings, and classes
  for (;;) {
    s = s.trim();
    if (s.startsWith("'") || s.startsWith('"')) {
      // skip a string
      const quote = s[0];
      let i = 1;
      while (i < s.length) {
        if (s[i] === "\\" && i + 1 < s.length) { i += 2; continue; }
        if (s[i] === quote) { i++; break; }
        i++;
      }
      s = s.slice(i);
      continue;
    }
    if (s.startsWith("[")) {
      // skip a char class
      let i = 1, depth = 1;
      while (i < s.length && depth > 0) {
        if (s[i] === "\\" && i + 1 < s.length) { i += 2; continue; }
        if (s[i] === "[") depth++;
        else if (s[i] === "]") depth--;
        i++;
      }
      s = s.slice(i);
      continue;
    }
    if (s.startsWith("(")) {
      let i = 1, depth = 1;
      while (i < s.length && depth > 0) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") depth--;
        i++;
      }
      s = s.slice(i);
      continue;
    }
    break;
  }
  const m = s.match(/\b[A-Za-z_]\w*\b/);
  return m ? m[0] : null;
}

// ---- Main ----
const raw = read(filePath);
const stripped = stripComments(raw);
const rules = extractRules(stripped);

// Collect rule names
const ruleNames = new Set(rules.map(r => r.name));
const lowerRuleNames = new Set([...ruleNames].filter(isLowerIdent));
const upperRuleNames = new Set([...ruleNames].filter(isUpperIdent));

// Start symbol heuristic / override
let startRule = startOverride ||
                (rules.find(r => isLowerIdent(r.name))?.name) ||
                (rules[0]?.name || "");

const errors: string[] = [];
const warnings: string[] = [];

// Duplicates
{
  const seen = new Map<string, number>();
  for (const r of rules) {
    if (seen.has(r.name)) {
      errors.push(`Duplicate rule '${r.name}' at line ${r.line} (first at line ${seen.get(r.name)})`);
    } else {
      seen.set(r.name, r.line);
    }
  }
}

// Per-rule checks
const depGraph = new Map<string, Set<string>>();
for (const r of rules) {
  const { alts, errors: balErrs } = splitAlternatives(r.rhs);
  balErrs.forEach(e => errors.push(`Rule '${r.name}' line ${r.line}: ${e}`));

  const deps = new Set<string>();
  for (const alt of alts) {
    // Empty alt already flagged; find refs
    const ids = referencedIdents(alt);
    for (const id of ids) {
      // Skip self-quantifiers, operators etc. (already stripped)
      if (id === r.name) deps.add(id);
      else if (ruleNames.has(id)) deps.add(id);
      else if (isUpperIdent(id)) {
        // looks like a token referenced but not defined as a rule (ok if using literals)
        if (!upperRuleNames.has(id)) {
          warnings.push(`Rule '${r.name}' line ${r.line}: token '${id}' referenced but not defined as a lexer rule`);
        }
      } else if (!isUpperIdent(id)) {
        // lowercase or mixed-case nonterminal referenced but missing
        if (!ruleNames.has(id)) {
          errors.push(`Rule '${r.name}' line ${r.line}: reference to undefined rule '${id}'`);
        }
      }
    }
    // Direct left recursion?
    const first = firstIdentifier(alt);
    if (first === r.name) {
      warnings.push(`Rule '${r.name}' line ${r.line}: direct left recursion in alternative '${alt}'`);
    }
  }
  depGraph.set(r.name, deps);
}

// Unreachable rules (from startRule)
if (!startRule) {
  warnings.push("No start rule inferred (file has no rules).");
} else {
  const reachable = new Set<string>();
  const stack = [startRule];
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const deps = depGraph.get(cur);
    if (deps) for (const d of deps) if (!reachable.has(d)) stack.push(d);
  }
  for (const r of rules) {
    if (!reachable.has(r.name) && isLowerIdent(r.name)) {
      warnings.push(`Parser rule '${r.name}' at line ${r.line} is not reachable from start '${startRule}'`);
    }
  }
}

// Report
const rel = path.relative(process.cwd(), filePath);
if (errors.length === 0 && warnings.length === 0) {
  console.log(`✔ ${rel} looks good${startRule ? ` (start = ${startRule})` : ""}.`);
} else {
  console.log(`${rel} validation results:${startRule ? ` (start = ${startRule})` : ""}`);
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log("  - " + e);
  }
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log("  - " + w);
  }
  if (errors.length === 0) {
    console.log("\nNo blocking errors; only warnings. ✅");
  } else {
    process.exitCode = 1;
  }
}

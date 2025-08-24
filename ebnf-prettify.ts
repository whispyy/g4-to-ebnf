#!/usr/bin/env ts-node

/**
 * ebnf-prettify.ts
 *
 * Pretty-prints EBNF in the flavor we’ve been generating:
 *   - Rules:  Name ::= RHS ;
 *   - Operators:  | ( ) ? * + ,  and string/charclass literals: '…' "…" [...]
 *   - Comments supported and preserved:  (* … *), // …, and /* … *\/
 *
 * Features:
 *   - Splits top-level alternatives onto separate lines aligned under '::='
 *   - Normalizes spaces around tokens; quantifiers stick to previous atom
 *   - Optional --width N soft wrap (breaks after '|' first, then at token boundaries)
 *   - --inplace to write back to the file; otherwise prints to stdout
 *
 * Usage:
 *   npx ts-node ebnf-prettify.ts path/to/file.ebnf > pretty.ebnf
 *   npx ts-node ebnf-prettify.ts --inplace --width 100 path/to/file.ebnf
 */

import { readFileSync, writeFileSync } from "fs";
import * as path from "path";

// ---------------- CLI ----------------
const argv = process.argv.slice(2);
let inPlace = false;
let width = 100;
const files: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--inplace" || a === "-i") inPlace = true;
  else if (a === "--width" && i + 1 < argv.length) {
    width = Math.max(40, parseInt(argv[++i], 10) || width);
  } else if (a.startsWith("--width=")) {
    const v = parseInt(a.split("=")[1], 10);
    if (!Number.isNaN(v)) width = Math.max(40, v);
  } else if (a.startsWith("-")) {
    console.error(`Unknown option: ${a}`);
    process.exit(1);
  } else {
    files.push(a);
  }
}
if (files.length !== 1) {
  console.error("Usage: ts-node ebnf-prettify.ts [--inplace] [--width N] <file.ebnf>");
  process.exit(1);
}
const filePath = files[0];

// ---------------- Tokenizer ----------------
type TokType =
  | "ws"
  | "ident"
  | "string"
  | "charclass"
  | "op"      // ::= | ( ) ? * + , ;
  | "comment";

type Tok = { type: TokType; text: string };

function tokenize(src: string): Tok[] {
  const tks: Tok[] = [];
  let i = 0;
  const N = src.length;

  const push = (type: TokType, text: string) => tks.push({ type, text });

  while (i < N) {
    const ch = src[i];

    // whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < N && /\s/.test(src[j])) j++;
      push("ws", src.slice(i, j));
      i = j;
      continue;
    }

    // comments: (* ... *), //..., /* ... */
    if (ch === "(" && src[i + 1] === "*") {
      let j = i + 2;
      while (j < N && !(src[j] === "*" && src[j + 1] === ")")) j++;
      j = Math.min(N, j + 2);
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < N && src[j] !== "\n") j++;
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      let j = i + 2;
      while (j < N && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j = Math.min(N, j + 2);
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }

    // strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < N) {
        const c = src[j];
        if (c === "\\" && j + 1 < N) { j += 2; continue; }
        if (c === quote) { j++; break; }
        j++;
      }
      push("string", src.slice(i, j));
      i = j;
      continue;
    }

    // char class [...]
    if (ch === "[") {
      let j = i + 1;
      let depth = 1;
      while (j < N && depth > 0) {
        const c = src[j];
        if (c === "\\" && j + 1 < N) { j += 2; continue; }
        if (c === "[") depth++;
        else if (c === "]") depth--;
        j++;
      }
      push("charclass", src.slice(i, j));
      i = j;
      continue;
    }

    // multi-char op ::= 
    if (ch === ":" && src.slice(i, i + 3) === "::=") {
      push("op", "::=");
      i += 3;
      continue;
    }

    // single-char ops
    if ("|()?,;+*".includes(ch)) {
      push("op", ch);
      i++;
      continue;
    }

    // identifier
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < N && /[A-Za-z0-9_]/.test(src[j])) j++;
      push("ident", src.slice(i, j));
      i = j;
      continue;
    }

    // anything else, emit as ident-ish to keep content (rare)
    push("ident", ch);
    i++;
  }

  return tks;
}

// ---------------- Rule extraction ----------------
type Rule = { name: string; rhs: Tok[]; leadingComments: string[] };

function extractRules(tokens: Tok[]): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  let leadComments: string[] = [];

  function skipWs(): void {
    while (i < tokens.length && tokens[i].type === "ws") i++;
  }

  while (i < tokens.length) {
    // Capture leading comments
    while (i < tokens.length && tokens[i].type === "comment") {
      leadComments.push(tokens[i].text);
      i++;
      // collect following spaces/newlines with the comment for fidelity
      if (i < tokens.length && tokens[i].type === "ws") {
        leadComments[leadComments.length - 1] += tokens[i].text;
        i++;
      }
    }
    skipWs();
    if (i >= tokens.length) break;

    // Expect IDENT ::= RHS ;
    if (tokens[i].type !== "ident") {
      // not a rule start; flush stray token into output as a comment block
      // (we'll just skip until next newline-ish)
      i++;
      continue;
    }
    const name = tokens[i].text;
    i++;
    skipWs();
    if (!(tokens[i] && tokens[i].type === "op" && tokens[i].text === "::=")) {
      // Not a proper rule; continue scanning
      continue;
    }
    i++; // consume '::='

    // Collect RHS tokens until top-level ';'
    const rhs: Tok[] = [];
    let depthPar = 0;
    while (i < tokens.length) {
      const tk = tokens[i];
      if (tk.type === "op" && tk.text === "(") depthPar++;
      if (tk.type === "op" && tk.text === ")") depthPar = Math.max(0, depthPar - 1);

      if (tk.type === "op" && tk.text === ";" && depthPar === 0) {
        i++; // consume ';'
        break;
      }
      rhs.push(tk);
      i++;
    }

    rules.push({ name, rhs, leadingComments: leadComments });
    leadComments = [];

    // swallow trailing whitespace/comments between rules into leadComments for next rule
    while (i < tokens.length && (tokens[i].type === "ws" || tokens[i].type === "comment")) {
      leadComments.push(tokens[i].text);
      i++;
    }
  }

  return rules;
}

// ---------------- Formatting ----------------

function joinTokensNicely(toks: Tok[]): string {
  // normalize: spaces around operators, but:
  // - no space after '(' or before ')'
  // - quantifiers ? * + stick to the previous token
  // - comma becomes ", "
  // - strings/charclasses untouched
  let out = "";
  let prev: Tok | null = null;

  const needSpaceBetween = (a: Tok | null, b: Tok): boolean => {
    if (!a) return false;
    if (a.type === "comment" || b.type === "comment") return true;

    // No space before ) or quantifier
    if (b.type === "op" && (b.text === ")" || b.text === "?" || b.text === "*" || b.text === "+")) return false;
    // No space after (
    if (a.type === "op" && a.text === "(") return false;

    // Around '::=' and '|'
    if (b.type === "op" && (b.text === "::=" || b.text === "|")) return true;
    if (a.type === "op" && (a.text === "::=" || a.text === "|")) return true;

    // Comma handled specially below
    if (b.type === "op" && b.text === ",") return false;
    if (a.type === "op" && a.text === ",") return true;

    // Default: separate identifiers/strings/classes/closing paren
    if ((a.type === "ident" || a.type === "string" || a.type === "charclass" || (a.type === "op" && a.text === ")")) &&
        (b.type === "ident" || b.type === "string" || b.type === "charclass" || (b.type === "op" && b.text === "("))) {
      return true;
    }
    return false;
  };

  for (const tk of toks) {
    if (tk.type === "ws") continue;

    if (tk.type === "comment") {
      // force onto its own line
      if (!out.endsWith("\n")) out += "\n";
      out += tk.text.trimEnd();
      out += "\n";
      prev = null;
      continue;
    }

    if (needSpaceBetween(prev, tk)) out += " ";

    if (tk.type === "op") {
      if (tk.text === ",") out += ", ";
      else if (tk.text === "(" || tk.text === ")" || tk.text === "?" || tk.text === "*" || tk.text === "+") out += tk.text;
      else if (tk.text === "|") out += " | ";
      else if (tk.text === "::=") out += " ::= ";
      else out += tk.text;
    } else {
      out += tk.text;
    }
    prev = tk;
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

function splitTopLevelAlternatives(rhs: Tok[]): Tok[][] {
  const alts: Tok[][] = [];
  let cur: Tok[] = [];
  let depthPar = 0;

  for (const tk of rhs) {
    if (tk.type === "op" && tk.text === "(") depthPar++;
    if (tk.type === "op" && tk.text === ")") depthPar = Math.max(0, depthPar - 1);
    if (depthPar === 0 && tk.type === "op" && tk.text === "|") {
      alts.push(cur);
      cur = [];
      continue;
    }
    cur.push(tk);
  }
  alts.push(cur);
  return alts;
}

function softWrap(text: string, max: number, hangingIndent: string): string {
  if (text.length <= max) return text;
  // Prefer to break after ' | ' boundaries if present, then at spaces
  const parts = text.split(/\s\|\s/g);
  if (parts.length > 1) {
    // rebuild with newlines + aligned '| '
    return parts
      .map((p, idx) => (idx === 0 ? p : hangingIndent + "| " + p))
      .join("\n");
  }
  // fallback: break at spaces
  const words = text.split(/\s+/);
  let out = "";
  let line = "";
  for (const w of words) {
    if ((line + (line ? " " : "") + w).length > max) {
      out += (out ? "\n" : "") + line;
      line = hangingIndent + w;
    } else {
      line += (line ? " " : "") + w;
    }
  }
  if (line) out += (out ? "\n" : "") + line;
  return out;
}

function formatRule(r: Rule): string {
  const alts = splitTopLevelAlternatives(r.rhs).map(joinTokensNicely);
  const head = `${r.name} ::= `;
  const indent = " ".repeat(head.length);

  // Place first alt after ::= if it fits, else on next line
  let out = "";
  if (r.leadingComments.length) out += r.leadingComments.join("");

  if (alts.length === 1) {
    const line = head + alts[0];
    out += softWrap(line, width, indent) + " ;";
    return out;
    }

  // multiple alternatives: each on its own line, with aligned bars
  const first = head + alts[0];
  let body = first + "\n";
  for (let i = 1; i < alts.length; i++) {
    body += indent + "| " + alts[i] + (i === alts.length - 1 ? "" : "\n");
  }
  out += softWrap(body, width, indent) + " ;";
  return out;
}

// ---------------- Main ----------------
const raw = readFileSync(filePath, "utf8");
const tokens = tokenize(raw);
const rules = extractRules(tokens);
if (rules.length === 0) {
  // fallback: just normalize whitespace overall
  const fallback = raw.replace(/[ \t]+/g, " ").replace(/[ \t]+\n/g, "\n").trim() + "\n";
  if (inPlace) writeFileSync(filePath, fallback, "utf8");
  else process.stdout.write(fallback);
  process.exit(0);
}

const pieces: string[] = [];
for (const r of rules) pieces.push(formatRule(r));

// Keep a single trailing newline
const result = pieces.join("\n\n") + "\n";
if (inPlace) {
  writeFileSync(filePath, result, "utf8");
  console.log(`Formatted ${path.basename(filePath)} (${rules.length} rules).`);
} else {
  process.stdout.write(result);
}

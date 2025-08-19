#!/usr/bin/env ts-node

/**
 * g4-to-ebnf.ts
 *
 * A pragmatic converter from ANTLR4 .g4 grammars to a simple EBNF flavor.
 * - Keeps rules and operators (: | ( ) ? * +) as much as possible
 * - Converts `name: rhs;` into `name ::= rhs ;`
 * - Removes or simplifies ANTLR-specific features:
 *   - grammar headers, options/imports/tokens/channels/modes blocks
 *   - @actions, semantic predicates, {...}, {...}? (predicates), -> commands
 *   - element labels (x=ID), labeled alts (#AltName), rule params/returns/locals
 *   - lexer commands (-> skip, -> channel(HIDDEN), etc.)
 * - Treats fragment rules like normal lexer rules (keeps their name & rhs)
 *
 * Limitations:
 * - Doesn’t fully parse ANTLR; uses careful regexes + token-ish passes.
 * - Complement sets (~) and some set ops are preserved literally.
 * - If your grammar uses exotic features, you may need light manual edits after.
 */

import { readFileSync } from "fs";
import * as path from "path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: ts-node g4-to-ebnf.ts path/to/Grammar.g4 > Grammar.ebnf");
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf8");

// ---------- Helpers ----------
const removeBlockComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "");

const removeLineComments = (s: string) =>
  s.replace(/(^|\s)\/\/.*$/gm, (_match, p1) => (p1 ? p1 : ""));

const collapseWhitespace = (s: string) =>
  s.replace(/[ \t]+/g, " ").replace(/\r/g, "");

// Removes all @... { ... } action blocks (single or nested braces).
function stripAtActions(s: string): string {
  // Matches e.g. @members { ... } or @parser::members { ... }
  return s.replace(/@[a-zA-Z_][\w:]*\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
}

// Remove braces blocks that are semantic actions/predicates in rules.
// We try to avoid touching character classes [ ... ].
function stripBracedCode(s: string): string {
  // { ... } or {...}? (predicate) — remove them entirely.
  return s.replace(/\{(?:[^{}]|\{[^{}]*\})*\}\??/g, "");
}

// Remove -> commands (e.g., -> skip, -> channel(HIDDEN), -> more)
function stripLexerCommands(s: string): string {
  // Match "->" up to next ; or | (keep the ; or |)
  return s.replace(/->[^;|)]+/g, "");
}

// Remove rule parameters, returns, locals e.g. name[params] returns[...] locals[...]
function stripRuleAnnotations(s: string): string {
  return s
    // name [ ... ]
    .replace(/([a-zA-Z_]\w*)\s*\[[^\]]*\]/g, "$1")
    // returns [ ... ]
    .replace(/\breturns\s*\[[^\]]*\]/gi, "")
    // locals [ ... ]
    .replace(/\blocals\s*\[[^\]]*\]/gi, "");
}

// Remove labeled alts: `#Name`
function stripLabeledAlternatives(s: string): string {
  return s.replace(/#[A-Za-z_]\w*/g, "");
}

// Remove element labels `x=ID` → `ID`, `t+=ID` → `ID`
function stripElementLabels(s: string): string {
  return s.replace(/\b[A-Za-z_]\w*\s*\+=\s*|\b[A-Za-z_]\w*\s*=\s*/g, "");
}

// Strip `options { ... }`, `tokens { ... }`, `channels { ... }`, `import ...;`, `mode NAME;`
function stripTopLevelBlocks(s: string): string {
  let out = s;
  out = out.replace(/\boptions\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\btokens\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\bchannels\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\bimport\s+[^;]+;/gi, "");
  out = out.replace(/\bmode\s+[A-Za-z_]\w*\s*;/g, "");
  return out;
}

// Strip `grammar Xxx;`, `parser grammar Xxx;`, `lexer grammar Xxx;`
function stripGrammarHeader(s: string): string {
  return s.replace(/\b(?:parser\s+|lexer\s+)?grammar\s+[A-Za-z_]\w*\s*;/gi, "");
}

// Normalize spacing around rule separators and operators
function tidyOperators(s: string): string {
  return s
    .replace(/\|/g, " | ")
    .replace(/:/g, " : ")
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .replace(/\?/g, " ? ")
    .replace(/\*/g, " * ")
    .replace(/\+/g, " + ")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, " ;\n"); // one rule per line
}

// Extract rules roughly: [fragment] NAME ':' ... ';'
type Rule = { name: string; isLexer: boolean; rhs: string; isFragment: boolean };

function extractRules(s: string): Rule[] {
  const rules: Rule[] = [];
  // We’ll scan semi-colon terminated chunks and look for "name : rhs ;"
  const pieces = s.split(/;(?![^\[]*\])/g); // split by ; not inside [...]
  for (let piece of pieces) {
    const trimmed = piece.trim();
    if (!trimmed) continue;

    // Handle "fragment NAME : ... "
    const fragMatch = trimmed.match(/^fragment\s+([A-Z_]\w*)\s*:\s*([\s\S]*)$/);
    if (fragMatch) {
      const [, name, rhsRaw] = fragMatch;
      const rhs = rhsRaw.trim();
      rules.push({ name, isLexer: true, rhs, isFragment: true });
      continue;
    }

    // Lexer rule: UPPERNAME : ...
    const lexMatch = trimmed.match(/^([A-Z_]\w*)\s*:\s*([\s\S]*)$/);
    if (lexMatch) {
      const [, name, rhsRaw] = lexMatch;
      const rhs = rhsRaw.trim();
      rules.push({ name, isLexer: true, rhs, isFragment: false });
      continue;
    }

    // Parser rule: lowername : ...
    const parMatch = trimmed.match(/^([a-z_]\w*)\s*:\s*([\s\S]*)$/);
    if (parMatch) {
      const [, name, rhsRaw] = parMatch;
      const rhs = rhsRaw.trim();
      rules.push({ name, isLexer: false, rhs, isFragment: false });
      continue;
    }

    // Not a rule; ignore stray stuff.
  }
  return rules;
}

// Post-process RHS:
// - remove predicates/actions/commands already stripped at top-level, but do a safety pass
// - collapse whitespace inside RHS, remove trailing pipes, etc.
function cleanRHS(rhs: string): string {
  let r = rhs;
  r = stripLexerCommands(r);
  r = stripBracedCode(r);
  r = stripLabeledAlternatives(r);
  r = stripElementLabels(r);
  // Keep character classes and quoted strings verbatim; reduce spaces elsewhere.
  r = r.replace(/\s+/g, " ").trim();
  // Remove trailing pipe if any
  r = r.replace(/\|\s*$/, "").trim();
  return r;
}

// ---------- Pipeline ----------
let text = raw;

// 1) Remove comments & actions early
text = removeBlockComments(text);
text = removeLineComments(text);
text = stripAtActions(text);

// 2) Strip top-level ANTLR structures
text = stripGrammarHeader(text);
text = stripTopLevelBlocks(text);

// 3) Remove rule annotations/labels/predicates/actions/commands
text = stripRuleAnnotations(text);
text = stripLabeledAlternatives(text);
text = stripElementLabels(text);
text = stripLexerCommands(text);
text = stripBracedCode(text);

// 4) Normalize operators a bit (mainly to help splitting)
text = collapseWhitespace(text);

// 5) Extract rules
const rules = extractRules(text);

// 6) Emit EBNF
const lines: string[] = [];
lines.push("(* Auto-converted from ANTLR4 by g4-to-ebnf.ts — edit as needed. *)");
lines.push("");

for (const rule of rules) {
  const rhs = cleanRHS(rule.rhs);

  // Minimal prettification: ensure spaces around | and parentheses
  const pretty = tidyOperators(rhs).trim();

  // We pick a simple EBNF flavor: name ::= rhs ;
  // (You can change to '=' or ':' as you wish.)
  const header = `${rule.name} ::=`;
  const body = ` ${pretty.replace(/\s*;\s*$/g, "")} ;`;

  // Optional comment for fragments to remind the user
  if (rule.isFragment) {
    lines.push(`(* fragment *) ${header}${body}`);
  } else {
    lines.push(`${header}${body}`);
  }
}

const out = lines.join("\n");
process.stdout.write(out);

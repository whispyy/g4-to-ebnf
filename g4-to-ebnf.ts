#!/usr/bin/env ts-node

/**
 * g4-to-ebnf.ts
 *
 * Converts one or two ANTLR4 .g4 grammars (parser and/or lexer) into a simple EBNF.
 * - If two files are provided (any order), outputs:
 *     (* Parser rules from X.g4 *) ... 
 *     (* Lexer rules from Y.g4  *) ...
 * - If a single file contains both kinds of rules, they’re split into sections.
 * - Strips ANTLR-specific constructs (actions, predicates, commands, headers, etc.).
 *
 * Limitations: heuristic, not a full ANTLR parser. See comments near the end.
 */

import { readFileSync } from "fs";
import * as path from "path";

// ---------- CLI ----------
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.error("Usage: ts-node g4-to-ebnf.ts <Grammar.g4> [OtherGrammar.g4] > out.ebnf");
  process.exit(1);
}

// ---------- Core types ----------
type Rule = {
  name: string;
  isLexer: boolean;      // UPPERCASE rule names are treated as lexer rules
  rhs: string;
  isFragment: boolean;   // for lexer fragments
};

type GrammarKind = "parser" | "lexer" | "unknown";

type ProcessedFile = {
  filePath: string;
  kind: GrammarKind;
  rules: Rule[];
};

// ---------- Utilities ----------
const sl = (p: string) => p.replace(/\\/g, "/");

// Remove /* ... */ comments
const removeBlockComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// Remove // line comments (IMPORTANT: escape the slashes)
const removeLineComments = (s: string) =>
  s.replace(/(^|\s)\/\/.*$/gm, (_m, p1) => (p1 ? p1 : ""));

// collapse spaces, keep newlines meaningful later
const collapseWhitespace = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\r/g, "");

// Strip @members / @actions blocks with nested braces
function stripAtActions(s: string): string {
  return s.replace(/@[a-zA-Z_][\w:]*\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
}

// Remove braces blocks for code actions/predicates, incl. {...}?
function stripBracedCode(s: string): string {
  return s.replace(/\{(?:[^{}]|\{[^{}]*\})*\}\??/g, "");
}

// Remove lexer commands entirely, including their (...) args and comma-separated lists
function stripLexerCommands(s: string): string {
  // Matches: -> skip
  //          -> channel(HIDDEN)
  //          -> type(ID)
  //          -> pushMode(M), more
  //          -> mode(MYMODE)
  // Removes the whole "-> ..." chunk, including any (...) and comma-separated commands.
  return s.replace(
    /->\s*[a-zA-Z_]\w*(?:\s*\([^()]*\))?(?:\s*,\s*[a-zA-Z_]\w*(?:\s*\([^()]*\))?)*\s*/g,
    ""
  );
}

// Remove rule annotations: params/returns/locals and element labels
function stripRuleAnnotations(s: string): string {
  return s
    .replace(/([a-zA-Z_]\w*)\s*\[[^\]]*\]/g, "$1") // name[...]
    .replace(/\breturns\s*\[[^\]]*\]/gi, "")
    .replace(/\blocals\s*\[[^\]]*\]/gi, "");
}

// Remove labeled alts (#Alt) and element labels (x=ID / t+=ID)
const stripLabeledAlternatives = (s: string) => s.replace(/#[A-Za-z_]\w*/g, "");
const stripElementLabels = (s: string) =>
  s.replace(/\b[A-Za-z_]\w*\s*\+=\s*|\b[A-Za-z_]\w*\s*=\s*/g, "");

// Strip headers/blocks: grammar X; options/tokens/channels/import/mode
function stripTopLevelBlocks(s: string): string {
  let out = s;
  out = out.replace(/\boptions\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\btokens\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\bchannels\s*\{[^}]*\}\s*;?/gi, "");
  out = out.replace(/\bimport\s+[^;]+;/gi, "");
  out = out.replace(/\bmode\s+[A-Za-z_]\w*\s*;/g, "");
  return out;
}

// Strip "grammar X;", "parser grammar X;", "lexer grammar X;"
function stripGrammarHeader(s: string): string {
  return s.replace(/\b(?:parser\s+|lexer\s+)?grammar\s+[A-Za-z_]\w*\s*;/gi, "");
}

// Normalize spacing around operators
function tidyOperators(s: string): string {
  let out = "";
  let inSingle = false, inDouble = false, inClass = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    // Enter/exit string or class contexts
    if (!inDouble && !inClass && ch === "'") { inSingle = !inSingle; out += ch; continue; }
    if (!inSingle && !inClass && ch === '"') { inDouble = !inDouble; out += ch; continue; }
    if (!inSingle && !inDouble && ch === "[") { inClass = true; out += ch; continue; }
    if (inClass) {
      out += ch;
      if (ch === "\\" && i + 1 < s.length) { out += s[++i]; }      // escape inside [...]
      else if (ch === "]") inClass = false;
      continue;
    }
    if (inSingle || inDouble) {
      out += ch;
      if (ch === "\\" && i + 1 < s.length) { out += s[++i]; }       // escape in strings
      continue;
    }

    // Outside of strings/classes: add spaces around grammar operators
    if (ch === '|' || ch === ':' || ch === '(' || ch === ')' || ch === '?' || ch === '*' || ch === '+') {
      out += ` ${ch} `;
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}


// Extract rules by scanning for "name : ... ;"
function extractRules(s: string): Rule[] {
  const rules: Rule[] = [];
  const pieces = s.split(/;(?![^\[]*\])/g); // split by ; not inside [...]
  for (let piece of pieces) {
    const trimmed = piece.trim();
    if (!trimmed) continue;

    // fragment LEXRULE : ...
    const fragMatch = trimmed.match(/^fragment\s+([A-Z_]\w*)\s*:\s*([\s\S]*)$/);
    if (fragMatch) {
      const [, name, rhsRaw] = fragMatch;
      rules.push({ name, isLexer: true, rhs: rhsRaw.trim(), isFragment: true });
      continue;
    }

    // Lexer rule (UPPER)
    const lexMatch = trimmed.match(/^([A-Z_]\w*)\s*:\s*([\s\S]*)$/);
    if (lexMatch) {
      const [, name, rhsRaw] = lexMatch;
      rules.push({ name, isLexer: true, rhs: rhsRaw.trim(), isFragment: false });
      continue;
    }

    // Parser rule (lower)
    const parMatch = trimmed.match(/^([a-z_]\w*)\s*:\s*([\s\S]*)$/);
    if (parMatch) {
      const [, name, rhsRaw] = parMatch;
      rules.push({ name, isLexer: false, rhs: rhsRaw.trim(), isFragment: false });
      continue;
    }
  }
  return rules;
}

function cleanRHS(rhs: string): string {
  let r = rhs;
  r = stripLexerCommands(r);
  r = stripBracedCode(r);
  r = stripLabeledAlternatives(r);
  r = stripElementLabels(r);
  r = r.replace(/\s+/g, " ").trim();
  r = r.replace(/\|\s*$/, "").trim();
  return r;
}

// Try to infer file "kind" from header text or majority of rules
function inferGrammarKind(originalText: string, rules: Rule[]): GrammarKind {
  const header = originalText.slice(0, 500);
  if (/\blexer\s+grammar\b/i.test(header)) return "lexer";
  if (/\bparser\s+grammar\b/i.test(header)) return "parser";
  // fallback: majority of rule kinds
  const lexCount = rules.filter(r => r.isLexer).length;
  const parCount = rules.filter(r => !r.isLexer).length;
  if (lexCount && !parCount) return "lexer";
  if (parCount && !lexCount) return "parser";
  return "unknown";
}

// Process one file into rules + metadata
function processFile(filePath: string): ProcessedFile {
  const raw = readFileSync(filePath, "utf8");

  let text = raw;
  text = removeBlockComments(text);
  text = removeLineComments(text);
  text = stripAtActions(text);
  const forKindDetection = text; // keep a copy before we remove headers

  text = stripGrammarHeader(text);
  text = stripTopLevelBlocks(text);
  text = stripRuleAnnotations(text);
  text = stripLabeledAlternatives(text);
  text = stripElementLabels(text);
  text = stripLexerCommands(text);
  text = stripBracedCode(text);
  text = collapseWhitespace(text);

  const rules = extractRules(text);
  const kind = inferGrammarKind(forKindDetection, rules);

  return { filePath, kind, rules };
}

// Emit a single rule in basic EBNF flavor
function emitRule(r: Rule): string {
  const rhs = tidyOperators(cleanRHS(r.rhs)).trim().replace(/\s*;\s*$/g, "");
  const header = `${r.name} ::=`;
  const body = ` ${rhs} ;`;
  return r.isFragment ? `(* fragment *) ${header}${body}` : `${header}${body}`;
}

// ---------- Main ----------
const processed: ProcessedFile[] = args.map(processFile);

// Gather all rules; also remember which came from which file for comments.
const allParserRules: { rule: Rule; from: string }[] = [];
const allLexerRules: { rule: Rule; from: string }[] = [];

for (const pf of processed) {
  for (const r of pf.rules) {
    if (r.isLexer) {
      allLexerRules.push({ rule: r, from: sl(pf.filePath) });
    } else {
      allParserRules.push({ rule: r, from: sl(pf.filePath) });
    }
  }
}

// Build header
const lines: string[] = [];
if (processed.length === 2) {
  const A = sl(processed[0].filePath);
  const B = sl(processed[1].filePath);
  lines.push(`(* Source files: ${A} , ${B} *)`);
} else {
  lines.push(`(* Source file: ${sl(processed[0].filePath)} *)`);
}
lines.push("");

// Emit parser section (if any)
if (allParserRules.length > 0) {
  const fromSet = new Set(allParserRules.map(x => x.from));
  const fromStr = Array.from(fromSet).join(", ");
  lines.push(`(* ======================== *)`);
  lines.push(`(* Parser rules from: ${fromStr} *)`);
  lines.push(`(* ======================== *)`);
  lines.push("");
  for (const { rule } of allParserRules) {
    lines.push(emitRule(rule));
  }
  lines.push("");
}

// Emit lexer section (if any)
if (allLexerRules.length > 0) {
  const fromSet = new Set(allLexerRules.map(x => x.from));
  const fromStr = Array.from(fromSet).join(", ");
  lines.push(`(* ======================= *)`);
  lines.push(`(* Lexer rules from: ${fromStr} *)`);
  lines.push(`(* ======================= *)`);
  lines.push("");
  for (const { rule } of allLexerRules) {
    lines.push(emitRule(rule));
  }
  lines.push("");
}

// If no rules at all, warn
if (allParserRules.length === 0 && allLexerRules.length === 0) {
  lines.push("(* No rules were found after stripping ANTLR-specific constructs. *)");
}

process.stdout.write(lines.join("\n"));

/**
 * Notes & Limitations:
 * - Complement sets (~) and complex lexer sets are kept as-is; some EBNF consumers may need tweaks.
 * - Channels/modes/commands aren’t translated (intentionally dropped).
 * - Deeply nested code in { ... } could be over-stripped in exotic cases.
 * - If you need a specific EBNF dialect (ISO/Wirth), we can adjust the emitter.
 */

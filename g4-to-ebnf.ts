#!/usr/bin/env node

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

import { readFileSync, existsSync, writeFileSync } from "fs";
import * as path from "path";

// ---------- Error Handling ----------
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// ---------- CLI ----------
const args = process.argv.slice(2);

// Parse command line arguments
let formatOutput = false;
let formatWidth = 100;
let outputFile: string | null = null;
const grammarFiles: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--help' || arg === '-h') {
    console.log(`
G4 to EBNF Converter v1.0.0

Usage: g4-to-ebnf <Grammar.g4> [OtherGrammar.g4] [options]

Arguments:
  Grammar.g4        ANTLR4 grammar file (required)
  OtherGrammar.g4   Second ANTLR4 grammar file (optional)

Options:
  --help, -h        Show this help message
  --version, -v     Show version information
  --format          Format the output EBNF for better readability
  --prettify        Alias for --format
  --width N         Set line width for formatting (default: 100)
  --output FILE     Write output to file instead of stdout

Examples:
  g4-to-ebnf MyLexer.g4 > output.ebnf
  g4-to-ebnf MyLexer.g4 MyParser.g4 > combined.ebnf
  g4-to-ebnf MyLexer.g4 --format --width 80 > formatted.ebnf
  g4-to-ebnf MyLexer.g4 --prettify --output result.ebnf
`);
    process.exit(0);
  } else if (arg === '--version' || arg === '-v') {
    console.log('1.0.0');
    process.exit(0);
  } else if (arg === '--format' || arg === '--prettify') {
    formatOutput = true;
  } else if (arg === '--width' && i + 1 < args.length) {
    formatWidth = Math.max(40, parseInt(args[++i], 10) || formatWidth);
  } else if (arg.startsWith('--width=')) {
    const v = parseInt(arg.split('=')[1], 10);
    if (!Number.isNaN(v)) formatWidth = Math.max(40, v);
  } else if (arg === '--output' && i + 1 < args.length) {
    outputFile = args[++i];
  } else if (arg.startsWith('--output=')) {
    outputFile = arg.split('=')[1];
  } else if (arg.startsWith('-')) {
    console.error(`Unknown option: ${arg}`);
    console.error("Use --help for more information");
    process.exit(1);
  } else {
    grammarFiles.push(arg);
  }
}

// Handle help flag (legacy check)
if (args.includes('--help') || args.includes('-h')) {
  // Already handled above
}

// Handle version flag (legacy check)
if (args.includes('--version') || args.includes('-v')) {
  // Already handled above
}

if (grammarFiles.length < 1 || grammarFiles.length > 2) {
  console.error("Usage: g4-to-ebnf <Grammar.g4> [OtherGrammar.g4] [options]");
  console.error("Use --help for more information");
  process.exit(1);
}

// Validate input files exist
for (const filePath of grammarFiles) {
  if (!existsSync(filePath)) {
    console.error(`Error: File '${filePath}' does not exist`);
    process.exit(1);
  }
  if (!filePath.toLowerCase().endsWith('.g4')) {
    console.error(`Warning: File '${filePath}' does not have .g4 extension`);
  }
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
  try {
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
  } catch (error) {
    console.error(`Error processing file '${filePath}':`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Emit a single rule in basic EBNF flavor
function emitRule(r: Rule): string {
  const rhs = tidyOperators(cleanRHS(r.rhs)).trim().replace(/\s*;\s*$/g, "");
  const header = `${r.name} ::=`;
  const body = ` ${rhs} ;`;
  return r.isFragment ? `(* fragment *) ${header}${body}` : `${header}${body}`;
}

// ---------- EBNF Formatting Functions ----------
// Extracted and adapted from ebnf-prettify.ts

type TokType = "ws" | "ident" | "string" | "charclass" | "op" | "comment";
type Tok = { type: TokType; text: string };

function tokenizeEBNF(src: string): Tok[] {
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

type EBNFRule = { name: string; rhs: Tok[]; leadingComments: string[] };

function extractEBNFRules(tokens: Tok[]): EBNFRule[] {
  const rules: EBNFRule[] = [];
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

function joinTokensNicely(toks: Tok[]): string {
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

function formatEBNFRule(r: EBNFRule, width: number): string {
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

function formatEBNF(ebnfContent: string, width: number): string {
  const tokens = tokenizeEBNF(ebnfContent);
  const rules = extractEBNFRules(tokens);
  
  if (rules.length === 0) {
    // fallback: just normalize whitespace overall
    return ebnfContent.replace(/[ \t]+/g, " ").replace(/[ \t]+\n/g, "\n").trim() + "\n";
  }

  const pieces: string[] = [];
  for (const r of rules) pieces.push(formatEBNFRule(r, width));

  // Keep a single trailing newline
  return pieces.join("\n\n") + "\n";
}

// ---------- Main ----------
const processed: ProcessedFile[] = grammarFiles.map(processFile);

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

const output = lines.join("\n");

// Apply formatting if requested
const finalOutput = formatOutput ? formatEBNF(output, formatWidth) : output;

// Write output to file or stdout
if (outputFile) {
  writeFileSync(outputFile, finalOutput, "utf8");
  console.error(`Generated EBNF written to: ${outputFile}`);
} else {
  process.stdout.write(finalOutput);
}

/**
 * Notes & Limitations:
 * - Complement sets (~) and complex lexer sets are kept as-is; some EBNF consumers may need tweaks.
 * - Channels/modes/commands aren’t translated (intentionally dropped).
 * - Deeply nested code in { ... } could be over-stripped in exotic cases.
 * - If you need a specific EBNF dialect (ISO/Wirth), we can adjust the emitter.
 */

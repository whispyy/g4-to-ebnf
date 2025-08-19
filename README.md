

### Generate EBNF from Lexer.g4 or Lexer+Parser

npm run g4-to-ebnf --silent -- examples/QQLLexer.g4 > QQLLexer.ebnf

npm run g4-to-ebnf --silent -- examples/QQLLexer.g4 examples/QQLParser.g4 > QQLLexerParser.ebnf

### Check generated EBNF

npm run check-ebnf QQLLexerParser.ebnf
lexer grammar SimpleLexer;

// Simple tokens
ID: [a-zA-Z_][a-zA-Z0-9_]*;
NUMBER: [0-9]+;
STRING: '"' (~["\r\n] | '\\' .)* '"';

// Operators
PLUS: '+';
MINUS: '-';
MULTIPLY: '*';
DIVIDE: '/';
ASSIGN: '=';

// Delimiters
LPAREN: '(';
RPAREN: ')';
SEMICOLON: ';';

// Whitespace
WS: [ \t\r\n]+ -> skip;

// Comments
COMMENT: '//' ~[\r\n]* -> skip;
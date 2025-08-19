#!/bin/bash
set -e

echo "🚀 Running integration tests for g4-to-ebnf..."

# Create test output directory
mkdir -p test-output

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_exit_code="${3:-0}"
    
    echo -e "\n${YELLOW}Testing: $test_name${NC}"
    echo "Command: $command"
    
    if eval "$command"; then
        if [ $? -eq $expected_exit_code ]; then
            echo -e "${GREEN}✅ PASSED: $test_name${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}❌ FAILED: $test_name (unexpected exit code)${NC}"
            ((TESTS_FAILED++))
        fi
    else
        if [ $? -eq $expected_exit_code ]; then
            echo -e "${GREEN}✅ PASSED: $test_name (expected failure)${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}❌ FAILED: $test_name${NC}"
            ((TESTS_FAILED++))
        fi
    fi
}

# Test 1: Check if build artifacts exist
run_test "Build artifacts exist" "test -f dist/g4-to-ebnf.js && test -f dist/ebnf-check.js"

# Test 2: Help/usage messages
run_test "g4-to-ebnf shows usage when no args" "npm run g4-to-ebnf 2>&1 | grep -i usage" 1
run_test "ebnf-check shows usage when no args" "npm run check-ebnf 2>&1 | grep -i usage" 1

# Test 3: Create a simple test grammar file
cat > test-output/TestLexer.g4 << 'EOF'
lexer grammar TestLexer;

// Simple tokens
ID: [a-zA-Z_][a-zA-Z0-9_]*;
NUMBER: [0-9]+;
STRING: '"' (~["\r\n] | '\\' .)* '"';

// Whitespace
WS: [ \t\r\n]+ -> skip;

// Comments
COMMENT: '//' ~[\r\n]* -> skip;
EOF

# Test 4: Create a simple parser grammar
cat > test-output/TestParser.g4 << 'EOF'
parser grammar TestParser;

options {
    tokenVocab = TestLexer;
}

program: statement* EOF;

statement: assignment | expression ';';

assignment: ID '=' expression;

expression: ID | NUMBER | STRING;
EOF

# Test 5: Convert single lexer grammar
run_test "Convert single lexer grammar" "npm run g4-to-ebnf -- test-output/TestLexer.g4 > test-output/TestLexer.ebnf"

# Test 6: Convert paired grammars
run_test "Convert paired grammars" "npm run g4-to-ebnf -- test-output/TestLexer.g4 test-output/TestParser.g4 > test-output/TestCombined.ebnf"

# Test 7: Validate generated EBNF files
if [ -f "test-output/TestLexer.ebnf" ]; then
    run_test "Validate lexer EBNF" "npm run check-ebnf -- test-output/TestLexer.ebnf"
fi

if [ -f "test-output/TestCombined.ebnf" ]; then
    run_test "Validate combined EBNF" "npm run check-ebnf -- test-output/TestCombined.ebnf"
fi

# Test 8: Check EBNF content structure
if [ -f "test-output/TestLexer.ebnf" ]; then
    run_test "EBNF contains rule definitions" "grep -q '::=' test-output/TestLexer.ebnf"
    run_test "EBNF contains lexer rules" "grep -q 'ID ::=' test-output/TestLexer.ebnf"
fi

if [ -f "test-output/TestCombined.ebnf" ]; then
    run_test "Combined EBNF has parser section" "grep -q 'Parser rules' test-output/TestCombined.ebnf"
    run_test "Combined EBNF has lexer section" "grep -q 'Lexer rules' test-output/TestCombined.ebnf"
fi

# Test 9: Error handling - invalid file
run_test "Handle non-existent file gracefully" "npm run g4-to-ebnf -- non-existent-file.g4 2>&1" 1

# Test 10: Error handling - invalid EBNF
echo "invalid ebnf content without proper rules" > test-output/invalid.ebnf
run_test "Detect invalid EBNF" "npm run check-ebnf -- test-output/invalid.ebnf" 1

# Test 11: Check if examples directory exists and test with real files
if [ -d "examples" ]; then
    echo -e "\n${YELLOW}Testing with example files...${NC}"
    for g4_file in examples/*.g4; do
        if [ -f "$g4_file" ]; then
            base_name=$(basename "$g4_file" .g4)
            run_test "Convert example: $base_name" "npm run g4-to-ebnf -- '$g4_file' > test-output/example_${base_name}.ebnf"
            if [ -f "test-output/example_${base_name}.ebnf" ]; then
                run_test "Validate example: $base_name" "npm run check-ebnf -- test-output/example_${base_name}.ebnf"
            fi
        fi
    done
fi

# Summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}💥 Some tests failed!${NC}"
    exit 1
fi
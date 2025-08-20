#!/bin/bash

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
    
    echo -e "\n${YELLOW}Testing: $test_name${NC}"
    echo "Command: $command"
    
    if eval "$command" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Check if build artifacts exist
run_test "Build artifacts exist" "test -f dist/g4-to-ebnf.js && test -f dist/ebnf-check.js"

# Test 2: Help commands work
run_test "g4-to-ebnf help works" "npm run g4-to-ebnf -- --help"
run_test "ebnf-check help works" "npm run check-ebnf -- --help"

# Test 3: Version commands work
run_test "g4-to-ebnf version works" "npm run g4-to-ebnf -- --version"
run_test "ebnf-check version works" "npm run check-ebnf -- --version"

# Test 4: Create a simple test grammar file
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

# Test 5: Convert single lexer grammar
run_test "Convert single lexer grammar" "npm run g4-to-ebnf -- test-output/TestLexer.g4 > test-output/TestLexer.ebnf"

# Test 6: Validate generated EBNF file
if [ -f "test-output/TestLexer.ebnf" ]; then
    run_test "Validate lexer EBNF" "npm run check-ebnf -- test-output/TestLexer.ebnf"
fi

# Test 7: Check EBNF content structure
if [ -f "test-output/TestLexer.ebnf" ]; then
    run_test "EBNF contains rule definitions" "grep -q '::=' test-output/TestLexer.ebnf"
    run_test "EBNF contains lexer rules" "grep -q 'ID ::=' test-output/TestLexer.ebnf"
fi

# Test 8: Test with example files if they exist
if [ -d "examples" ] && [ -f "examples/SimpleLexer.g4" ]; then
    run_test "Convert example grammar" "npm run g4-to-ebnf -- examples/SimpleLexer.g4 > test-output/example.ebnf"
    if [ -f "test-output/example.ebnf" ]; then
        run_test "Validate example EBNF" "npm run check-ebnf -- test-output/example.ebnf"
    fi
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
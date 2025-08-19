# G4 to EBNF Converter

[![CI Pipeline](https://gitlab.com/whispyy/g4-to-ebnf/badges/main/pipeline.svg)](https://gitlab.com/whispyy/g4-to-ebnf/-/pipelines)
[![npm version](https://badge.fury.io/js/g4-to-ebnf.svg)](https://badge.fury.io/js/g4-to-ebnf)

Convert ANTLR4 grammar files (.g4) to Extended Backus-Naur Form (EBNF) with validation and CI/CD support.

## Features

- ✅ **Convert ANTLR4 grammars** - Supports both lexer and parser rules
- ✅ **Handle complex constructs** - Strips actions, predicates, and ANTLR-specific syntax
- ✅ **Validate output** - Built-in EBNF syntax validation
- ✅ **CI/CD ready** - Complete GitLab CI pipeline included
- ✅ **Docker support** - Containerized for consistent environments
- ✅ **TypeScript** - Full type safety and modern JavaScript features

## Installation

### Global Installation (Recommended)
```bash
npm install -g g4-to-ebnf
```

### Local Installation
```bash
npm install g4-to-ebnf
```

### Docker
```bash
docker pull whispyy/g4-to-ebnf:latest
```

## Usage

### Command Line Interface

#### Convert Single Grammar File
```bash
# Convert a lexer grammar
g4-to-ebnf MyLexer.g4 > output.ebnf

# Convert a parser grammar
g4-to-ebnf MyParser.g4 > output.ebnf
```

#### Convert Paired Grammars
```bash
# Convert lexer + parser together
g4-to-ebnf MyLexer.g4 MyParser.g4 > combined.ebnf
```

#### Validate Generated EBNF
```bash
# Check EBNF syntax and structure
ebnf-check output.ebnf

# Validate with custom start rule
ebnf-check output.ebnf --start myStartRule
```

### Examples

#### Basic Conversion
```bash
# Generate EBNF from a simple lexer
npm run g4-to-ebnf --silent -- examples/SimpleLexer.g4 > exemples/SimpleLexer.ebnf

# Generate EBNF from lexer + parser pair
npm run g4-to-ebnf --silent -- examples/SimpleLexer.g4 examples/SimpleParser.g4 > exemples/SimpleComplete.ebnf

# Validate the generated EBNF
npm run check-ebnf exemples/SimpleLexer.ebnf
```

### Docker Usage

```bash
# Convert grammar files using Docker
docker run --rm -v $(pwd):/app/input -v $(pwd)/output:/app/output \
  whispyy/g4-to-ebnf:latest /app/input/MyGrammar.g4 > /app/output/MyGrammar.ebnf

# Validate EBNF using Docker
docker run --rm -v $(pwd):/app/input \
  whispyy/g4-to-ebnf:latest node dist/ebnf-check.js /app/input/MyGrammar.ebnf
```

## Development

### Prerequisites
- Node.js >= 14.0.0
- npm >= 6.0.0

### Setup
```bash
git clone https://github.com/whispyy/g4-to-ebnf.git
cd g4-to-ebnf
npm install
```

### Build
```bash
# Compile TypeScript to JavaScript
npm run build

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Development mode (with ts-node)
npm run dev:g4-to-ebnf examples/MyGrammar.g4
npm run dev:check-ebnf output.ebnf
```

## CI/CD Integration

### GitLab CI

This project includes a complete GitLab CI pipeline (`.gitlab-ci.yml`) with the following stages:

1. **Build** - Compile TypeScript and create artifacts
2. **Test** - Run integration tests
3. **Convert** - Automatically convert all `.g4` files found in the repository
4. **Validate** - Check all generated EBNF files for syntax errors

#### Pipeline Features
- ✅ Automatic discovery and conversion of `.g4` files
- ✅ Paired grammar detection (e.g., `MyLexer.g4` + `MyParser.g4`)
- ✅ Comprehensive validation of generated EBNF
- ✅ Artifact storage for generated files
- ✅ Optional npm publishing for releases

#### Environment Variables
Set these in your GitLab CI/CD settings:
- `NPM_TOKEN` - For publishing to npm registry (optional)

### GitHub Actions

For GitHub users, here's an equivalent workflow:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: mkdir -p output
      - run: find . -name "*.g4" -not -path "./node_modules/*" | xargs -I {} npm run g4-to-ebnf -- {} > output/{}.ebnf
      - run: find output -name "*.ebnf" | xargs -I {} npm run check-ebnf -- {}
```

## API Reference

### g4-to-ebnf

Converts ANTLR4 grammar files to EBNF format.

**Usage:**
```bash
g4-to-ebnf <Grammar.g4> [OtherGrammar.g4] > output.ebnf
```

**Features:**
- Strips ANTLR-specific constructs (actions, predicates, commands)
- Handles both lexer and parser rules
- Supports fragment rules
- Maintains rule structure and alternatives

### ebnf-check

Validates EBNF files for syntax correctness and structural issues.

**Usage:**
```bash
ebnf-check <file.ebnf> [--start <ruleName>]
```

**Validation Features:**
- Syntax validation (brackets, quotes, operators)
- Rule reference checking
- Duplicate rule detection
- Reachability analysis
- Left recursion detection

## Limitations

- **Heuristic parsing** - Uses regex-based parsing, not a full ANTLR parser
- **EBNF dialect** - Produces a simple EBNF flavor; may need adjustment for specific consumers
- **Complex constructs** - Some advanced ANTLR features may require manual review
- **Nested actions** - Deeply nested code blocks might be over-stripped in rare cases

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Ensure CI pipeline passes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### v1.0.0
- Initial release
- ANTLR4 to EBNF conversion
- EBNF validation
- CI/CD pipeline support
- Docker containerization

## Support

- 📖 [Documentation](https://github.com/whispyy/g4-to-ebnf/wiki)
- 🐛 [Issue Tracker](https://github.com/whispyy/g4-to-ebnf/issues)
- 💬 [Discussions](https://github.com/whispyy/g4-to-ebnf/discussions)

---

Made with ❤️ for the ANTLR and EBNF communities
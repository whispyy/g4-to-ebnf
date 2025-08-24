# G4 to EBNF Converter

[![CI/CD Pipeline](https://github.com/whispyy/g4-to-ebnf/actions/workflows/ci.yml/badge.svg)](https://github.com/whispyy/g4-to-ebnf/actions/workflows/ci.yml)
[![Publish to NPM](https://github.com/whispyy/g4-to-ebnf/actions/workflows/publish.yml/badge.svg)](https://github.com/whispyy/g4-to-ebnf/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/g4-to-ebnf.svg)](https://www.npmjs.com/package/g4-to-ebnf)
[![npm downloads](https://img.shields.io/npm/dm/g4-to-ebnf.svg)](https://www.npmjs.com/package/g4-to-ebnf)
[![Docker](https://img.shields.io/docker/v/whispyy/g4-to-ebnf?label=docker)](https://hub.docker.com/r/whispyy/g4-to-ebnf)

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

# Convert with formatting for better readability
g4-to-ebnf MyLexer.g4 --format > formatted.ebnf
g4-to-ebnf MyLexer.g4 --prettify --width 80 > pretty.ebnf
```

#### Convert Paired Grammars
```bash
# Convert lexer + parser together
g4-to-ebnf MyLexer.g4 MyParser.g4 > combined.ebnf

# Convert with formatting and save to file
g4-to-ebnf MyLexer.g4 MyParser.g4 --format --output combined.ebnf
```

#### Validate Generated EBNF
```bash
# Check EBNF syntax and structure
ebnf-check output.ebnf

# Validate with custom start rule
ebnf-check output.ebnf --start myStartRule
```

#### Format Existing EBNF Files
```bash
# Format an existing EBNF file (standalone tool)
ebnf-prettify input.ebnf > formatted.ebnf

# Format in-place with custom width
ebnf-prettify --inplace --width 120 input.ebnf
```

### Examples

#### Basic Conversion
```bash
# Generate EBNF from a simple lexer
npm run g4-to-ebnf --silent -- examples/SimpleLexer.g4 > exemples/SimpleLexer.ebnf

# Generate formatted EBNF from lexer + parser pair
npm run g4-to-ebnf --silent -- examples/SimpleLexer.g4 examples/SimpleParser.g4 --format > exemples/SimpleComplete.ebnf

# Validate the generated EBNF
npm run check-ebnf exemples/SimpleLexer.ebnf

# Format existing EBNF files
npm run prettify-ebnf exemples/SimpleLexer.ebnf > exemples/SimpleLexer_formatted.ebnf
```

### Docker Usage

```bash
# Convert grammar files using Docker
docker run --rm -v $(pwd):/app/input -v $(pwd)/output:/app/output \
  whispyy/g4-to-ebnf:latest /app/input/MyGrammar.g4 > /app/output/MyGrammar.ebnf

# Validate EBNF using Docker
docker run --rm -v $(pwd):/app/input \
  whispyy/g4-to-ebnf:latest node dist/ebnf-check.js /app/input/MyGrammar.ebnf

# Format EBNF using Docker
docker run --rm -v $(pwd):/app/input -v $(pwd)/output:/app/output \
  whispyy/g4-to-ebnf:latest node dist/ebnf-prettify.js /app/input/MyGrammar.ebnf > /app/output/MyGrammar_formatted.ebnf
```

## Development

### Prerequisites
- Node.js >= 22.0.0
- npm >= 10.0.0

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
npm run dev:prettify-ebnf output.ebnf
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

This project includes comprehensive GitHub Actions workflows:

#### 1. CI/CD Pipeline (`.github/workflows/ci.yml`)
- **Triggers**: Push to main/develop, Pull Requests
- **Features**:
  - ✅ Multi-version Node.js testing (16, 18, 20)
  - ✅ Automatic grammar discovery and conversion
  - ✅ EBNF validation with detailed reporting
  - ✅ Package structure verification
  - ✅ Artifact storage for generated files

#### 2. NPM Publishing (`.github/workflows/publish.yml`)
- **Triggers**: Version tags (v1.0.0, v1.2.3, etc.) or manual dispatch
- **Features**:
  - ✅ Automated npm publishing
  - ✅ GitHub release creation
  - ✅ Docker image publishing (multi-platform)
  - ✅ Version management from git tags
  - ✅ Comprehensive pre-publish validation

#### Setup for NPM Publishing
See [`NPM-PUBLISHING-SETUP.md`](NPM-PUBLISHING-SETUP.md) for detailed setup instructions.

**Quick Setup**:
1. Create npm access token at [npmjs.com](https://www.npmjs.com)
2. Add `NPM_TOKEN` secret to your GitHub repository
3. Create and push a version tag: `git tag v1.0.0 && git push origin v1.0.0`
4. The workflow automatically publishes to npm and creates a GitHub release

#### Environment Variables
Set these in your GitHub repository secrets:
- `NPM_TOKEN` - For publishing to npm registry (required for publishing)
- `DOCKERHUB_USERNAME` - Docker Hub username (optional)
- `DOCKERHUB_TOKEN` - Docker Hub access token (optional)

**Note**: Docker publishing is completely optional. If you don't configure the Docker Hub secrets, the workflow will skip Docker publishing and only publish to npm, which works perfectly fine.

## API Reference

### g4-to-ebnf

Converts ANTLR4 grammar files to EBNF format.

**Usage:**
```bash
g4-to-ebnf <Grammar.g4> [OtherGrammar.g4] [options]
```

**Options:**
- `--format, --prettify` - Format the output EBNF for better readability
- `--width N` - Set line width for formatting (default: 100)
- `--output FILE` - Write output to file instead of stdout
- `--help, -h` - Show help message
- `--version, -v` - Show version information

**Features:**
- Strips ANTLR-specific constructs (actions, predicates, commands)
- Handles both lexer and parser rules
- Supports fragment rules
- Maintains rule structure and alternatives
- Optional pretty-printing with configurable line width

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

### ebnf-prettify

Formats and pretty-prints EBNF files for better readability.

**Usage:**
```bash
ebnf-prettify [--inplace] [--width N] <file.ebnf>
```

**Options:**
- `--inplace, -i` - Modify the file in-place instead of printing to stdout
- `--width N` - Set maximum line width for formatting (default: 100, minimum: 40)

**Features:**
- Splits top-level alternatives onto separate lines aligned under '::='
- Normalizes spaces around tokens and operators
- Preserves comments and maintains proper indentation
- Configurable line width with intelligent wrapping
- Handles complex EBNF constructs including nested rules

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
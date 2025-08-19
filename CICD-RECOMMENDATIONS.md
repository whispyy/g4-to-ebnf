# CI/CD Recommendations for G4-to-EBNF

## Overview

Your G4-to-EBNF project is now production-ready with a complete CI/CD pipeline. This document provides comprehensive recommendations for deployment and usage in continuous integration environments.

## GitLab CI Pipeline

### Pipeline Stages

The included `.gitlab-ci.yml` provides a 4-stage pipeline:

1. **Build** - Compiles TypeScript to JavaScript
2. **Test** - Runs integration tests
3. **Convert** - Automatically converts all `.g4` files in the repository
4. **Validate** - Checks all generated EBNF files for syntax errors

### Key Features

✅ **Automatic Grammar Discovery** - Finds all `.g4` files in your repository  
✅ **Paired Grammar Support** - Automatically combines `*Lexer.g4` + `*Parser.g4` files  
✅ **Comprehensive Validation** - Validates all generated EBNF files  
✅ **Artifact Storage** - Stores generated EBNF files for download  
✅ **Error Reporting** - Clear error messages and exit codes  

### Usage in Your Project

1. **Copy the pipeline file** to your grammar repository:
   ```bash
   cp .gitlab-ci.yml /path/to/your/grammar/project/
   ```

2. **Add grammar files** to your repository:
   ```
   grammars/
   ├── MyLexer.g4
   ├── MyParser.g4
   └── AnotherGrammar.g4
   ```

3. **Commit and push** - The pipeline will automatically:
   - Convert `MyLexer.g4` → `MyLexer.ebnf`
   - Convert `MyParser.g4` → `MyParser.ebnf`
   - Convert `MyLexer.g4` + `MyParser.g4` → `MyComplete.ebnf`
   - Convert `AnotherGrammar.g4` → `AnotherGrammar.ebnf`
   - Validate all generated EBNF files

## Environment Variables

Set these in your GitLab CI/CD settings:

| Variable | Purpose | Required |
|----------|---------|----------|
| `NPM_TOKEN` | For publishing to npm registry | Optional |

## Customization Options

### Custom Grammar Locations

If your grammars are in a specific directory, modify the pipeline:

```yaml
# In .gitlab-ci.yml, update the find command:
- find ./src/grammars -name "*.g4" | while read -r g4_file; do
```

### Custom Validation Rules

Add custom validation by modifying the validate stage:

```yaml
validate_ebnf:
  script:
    - |
      for ebnf_file in output/*.ebnf; do
        # Standard validation
        npm run check-ebnf -- "$ebnf_file"
        
        # Custom validation (example)
        if ! grep -q "program ::=" "$ebnf_file"; then
          echo "Warning: No 'program' rule found in $ebnf_file"
        fi
      done
```

### Notification Integration

Add Slack/Teams notifications:

```yaml
notify_success:
  stage: .post
  script:
    - curl -X POST -H 'Content-type: application/json' 
      --data '{"text":"✅ EBNF conversion completed successfully"}' 
      $SLACK_WEBHOOK_URL
  when: on_success
```

## Docker Integration

### Building Docker Images

```bash
# Build the Docker image
docker build -t your-registry/g4-to-ebnf:latest .

# Push to registry
docker push your-registry/g4-to-ebnf:latest
```

### Using in CI

```yaml
convert_with_docker:
  stage: convert
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker run --rm -v $PWD:/workspace your-registry/g4-to-ebnf:latest
      /workspace/grammars/MyGrammar.g4 > output/MyGrammar.ebnf
```

## GitHub Actions Alternative

For GitHub users, here's an equivalent workflow:

```yaml
# .github/workflows/ebnf-conversion.yml
name: EBNF Conversion
on: [push, pull_request]

jobs:
  convert-and-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Run tests
        run: npm test
      
      - name: Convert grammars
        run: |
          mkdir -p output
          find . -name "*.g4" -not -path "./node_modules/*" | while read -r g4_file; do
            base_name=$(basename "$g4_file" .g4)
            npm run g4-to-ebnf -- "$g4_file" > "output/${base_name}.ebnf"
          done
      
      - name: Validate EBNF
        run: |
          for ebnf_file in output/*.ebnf; do
            npm run check-ebnf -- "$ebnf_file"
          done
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ebnf-files
          path: output/
```

## Best Practices

### 1. Grammar Organization

```
project/
├── grammars/
│   ├── lexer/
│   │   ├── CommonLexer.g4
│   │   └── SpecialLexer.g4
│   └── parser/
│       ├── CommonParser.g4
│       └── SpecialParser.g4
├── generated/
│   └── ebnf/
└── .gitlab-ci.yml
```

### 2. Version Control

- **Include source grammars** in version control
- **Exclude generated EBNF** from version control (add to `.gitignore`)
- **Use CI artifacts** for generated files

```gitignore
# .gitignore
generated/
output/
*.ebnf
```

### 3. Quality Gates

Add quality gates to prevent bad grammars:

```yaml
quality_gate:
  stage: validate
  script:
    - |
      error_count=0
      for ebnf_file in output/*.ebnf; do
        if ! npm run check-ebnf -- "$ebnf_file"; then
          ((error_count++))
        fi
      done
      if [ $error_count -gt 0 ]; then
        echo "❌ $error_count EBNF files failed validation"
        exit 1
      fi
      echo "✅ All EBNF files passed validation"
  allow_failure: false
```

### 4. Caching Strategy

Optimize build times with caching:

```yaml
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - dist/
  policy: pull-push
```

## Monitoring and Alerts

### Pipeline Monitoring

Set up monitoring for:
- ✅ Conversion success rate
- ✅ Validation error trends
- ✅ Build duration
- ✅ Artifact size

### Alert Conditions

Configure alerts for:
- ❌ Pipeline failures
- ❌ Validation errors
- ❌ Missing grammar files
- ❌ Build timeouts

## Integration Examples

### 1. Documentation Generation

```yaml
generate_docs:
  stage: .post
  dependencies:
    - convert_grammars
  script:
    - |
      echo "# Generated EBNF Files" > GRAMMAR_DOCS.md
      for ebnf_file in output/*.ebnf; do
        echo "## $(basename $ebnf_file)" >> GRAMMAR_DOCS.md
        echo '```ebnf' >> GRAMMAR_DOCS.md
        cat "$ebnf_file" >> GRAMMAR_DOCS.md
        echo '```' >> GRAMMAR_DOCS.md
      done
  artifacts:
    paths:
      - GRAMMAR_DOCS.md
```

### 2. Release Automation

```yaml
release:
  stage: deploy
  script:
    - |
      # Create release with EBNF files
      gh release create v${CI_COMMIT_TAG} output/*.ebnf \
        --title "Grammar Release ${CI_COMMIT_TAG}" \
        --notes "Automatically generated EBNF files"
  only:
    - tags
```

### 3. Quality Metrics

```yaml
metrics:
  stage: .post
  script:
    - |
      total_rules=$(grep -c "::=" output/*.ebnf || echo 0)
      total_files=$(ls output/*.ebnf | wc -l || echo 0)
      echo "Generated $total_files EBNF files with $total_rules total rules"
      
      # Send metrics to monitoring system
      curl -X POST "$METRICS_ENDPOINT" \
        -d "ebnf.files.count=$total_files" \
        -d "ebnf.rules.count=$total_rules"
```

## Troubleshooting

### Common Issues

1. **Pipeline hangs during tests**
   - Check for infinite loops in test scripts
   - Add timeouts to test commands

2. **Grammar files not found**
   - Verify file paths in pipeline
   - Check `.gitignore` doesn't exclude grammar files

3. **Validation failures**
   - Review EBNF syntax errors
   - Check for unsupported ANTLR constructs

### Debug Mode

Enable debug output:

```yaml
variables:
  DEBUG: "true"
  
before_script:
  - if [ "$DEBUG" = "true" ]; then set -x; fi
```

## Conclusion

Your G4-to-EBNF project now has enterprise-grade CI/CD capabilities:

✅ **Automated conversion** of all grammar files  
✅ **Comprehensive validation** with clear error reporting  
✅ **Artifact management** for generated EBNF files  
✅ **Docker support** for consistent environments  
✅ **Extensible pipeline** for custom requirements  

The pipeline will automatically convert your ANTLR grammars to EBNF format and validate them on every commit, ensuring high-quality grammar transformations in your development workflow.
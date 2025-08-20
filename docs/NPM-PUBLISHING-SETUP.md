# NPM Publishing Setup Guide

This guide explains how to set up automatic npm publishing for the g4-to-ebnf library using GitHub Actions.

## Prerequisites

1. **GitHub Repository**: Your code should be in a GitHub repository
2. **NPM Account**: You need an npm account at [npmjs.com](https://www.npmjs.com)
3. **Docker Hub Account** (optional): For Docker image publishing

## Step 1: Create NPM Access Token

1. **Login to NPM**:
   ```bash
   npm login
   ```

2. **Create an Access Token**:
   - Go to [npmjs.com](https://www.npmjs.com) and login
   - Click on your profile → "Access Tokens"
   - Click "Generate New Token"
   - Choose "Automation" type (for CI/CD)
   - Copy the generated token (starts with `npm_`)

## Step 2: Configure GitHub Secrets

In your GitHub repository:

1. **Go to Settings → Secrets and variables → Actions**

2. **Add the following secrets**:

   | Secret Name | Value | Required |
   |-------------|-------|----------|
   | `NPM_TOKEN` | Your npm access token | ✅ Yes |
   | `DOCKERHUB_USERNAME` | Your Docker Hub username | ⚠️ Optional |
   | `DOCKERHUB_TOKEN` | Your Docker Hub access token | ⚠️ Optional |

### Adding Secrets:
- Click "New repository secret"
- Name: `NPM_TOKEN`
- Secret: Paste your npm token
- Click "Add secret"

**For Docker publishing (optional):**
- Add `DOCKERHUB_USERNAME` with your Docker Hub username
- Add `DOCKERHUB_TOKEN` with your Docker Hub access token

## Step 3: Update Package Information

Make sure your [`package.json`](package.json:1) has the correct information:

```json
{
  "name": "g4-to-ebnf",
  "version": "1.0.0",
  "description": "Convert ANTLR4 grammar files (.g4) to Extended Backus-Naur Form (EBNF)",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yourusername/g4-to-ebnf.git"
  },
  "homepage": "https://github.com/yourusername/g4-to-ebnf#readme",
  "bugs": {
    "url": "https://github.com/yourusername/g4-to-ebnf/issues"
  }
}
```

**Important**: Update the repository URLs with your actual GitHub username/organization.

## Step 4: Publishing Process

### Automatic Publishing (Recommended)

The GitHub workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml:1) will automatically publish when you create a version tag:

1. **Update version and create tag**:
   ```bash
   # Update version in package.json (optional, workflow will do this)
   npm version patch  # or minor, major
   
   # Or create tag manually
   git tag v1.0.1
   git push origin v1.0.1
   ```

2. **The workflow will**:
   - ✅ Run all tests
   - ✅ Build the project
   - ✅ Verify package contents
   - ✅ Update package.json version from tag
   - ✅ Publish to npm
   - ✅ Create GitHub release
   - ✅ Build and push Docker image (if configured)

### Manual Publishing

You can also trigger publishing manually:

1. **Go to Actions tab** in your GitHub repository
2. **Select "Publish to NPM" workflow**
3. **Click "Run workflow"**
4. **Choose branch and click "Run workflow"**

## Step 5: Version Management

### Semantic Versioning

Use semantic versioning (semver) for your releases:

- `v1.0.0` - Major release (breaking changes)
- `v1.1.0` - Minor release (new features, backward compatible)
- `v1.0.1` - Patch release (bug fixes)

### Creating Releases

```bash
# Patch release (1.0.0 → 1.0.1)
git tag v1.0.1
git push origin v1.0.1

# Minor release (1.0.1 → 1.1.0)
git tag v1.1.0
git push origin v1.1.0

# Major release (1.1.0 → 2.0.0)
git tag v2.0.0
git push origin v2.0.0
```

## Step 6: Verify Publication

After the workflow completes:

1. **Check npm**: Visit `https://www.npmjs.com/package/g4-to-ebnf`
2. **Test installation**:
   ```bash
   npm install -g g4-to-ebnf@latest
   g4-to-ebnf --version
   ```
3. **Check GitHub release**: Go to your repository's "Releases" page

## Workflow Features

### 🔍 Pre-publish Checks

The workflow performs comprehensive checks before publishing:

- ✅ **Tests**: Runs full test suite
- ✅ **Build verification**: Ensures TypeScript compiles
- ✅ **CLI testing**: Tests help, version, and conversion functionality
- ✅ **Package validation**: Verifies all required files are present
- ✅ **Version extraction**: Automatically extracts version from git tag

### 📦 What Gets Published

The npm package includes:
- `dist/` - Compiled JavaScript files
- `package.json` - Package metadata
- `README.md` - Documentation
- `LICENSE` - License file

### 🐳 Docker Publishing (Optional)

If you configure Docker Hub secrets, the workflow will also:
- Build multi-platform Docker images (amd64, arm64)
- Push to Docker Hub with version tags
- Use build caching for faster builds

## Troubleshooting

### Common Issues

1. **"npm ERR! 403 Forbidden"**
   - Check your NPM_TOKEN is correct
   - Ensure the token has "Automation" permissions
   - Verify the package name isn't already taken

2. **"Package name too similar to existing package"**
   - Choose a more unique package name
   - Add a scope: `@yourusername/g4-to-ebnf`

3. **"Version already exists"**
   - You're trying to publish a version that already exists
   - Create a new tag with a higher version number

4. **Docker build fails**
   - Check DOCKER_USERNAME and DOCKER_PASSWORD secrets
   - Ensure Docker Hub repository exists
   - Docker publishing is optional - you can disable it

### Debug Mode

To debug workflow issues:

1. **Check workflow logs** in GitHub Actions tab
2. **Add debug output** by setting repository variable:
   - Name: `ACTIONS_STEP_DEBUG`
   - Value: `true`

### Testing Locally

Test the package before publishing:

```bash
# Build and test locally
npm run build
npm test

# Test CLI tools
npm run g4-to-ebnf -- --help
npm run check-ebnf -- --help

# Test package creation
npm pack --dry-run
```

## Package Scoping (Optional)

If you want to publish under a scope (recommended for personal packages):

1. **Update package.json**:
   ```json
   {
     "name": "@yourusername/g4-to-ebnf"
   }
   ```

2. **The workflow will automatically handle scoped packages**

3. **Users install with**:
   ```bash
   npm install -g @yourusername/g4-to-ebnf
   ```

## Security Best Practices

1. **Use Automation tokens** (not Classic tokens)
2. **Limit token scope** to only necessary permissions
3. **Regularly rotate tokens** (every 6-12 months)
4. **Never commit tokens** to your repository
5. **Use GitHub secrets** for all sensitive data

## Next Steps

After setup:

1. **Test the workflow** with a patch release
2. **Monitor npm downloads** at npmjs.com
3. **Set up notifications** for failed workflows
4. **Consider adding badges** to your README:

```markdown
[![npm version](https://badge.fury.io/js/g4-to-ebnf.svg)](https://badge.fury.io/js/g4-to-ebnf)
[![CI](https://github.com/yourusername/g4-to-ebnf/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/yourusername/g4-to-ebnf/actions)
```

## Support

If you encounter issues:
- Check the [GitHub Actions documentation](https://docs.github.com/en/actions)
- Review [npm publishing guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- Open an issue in your repository for help

---

Your g4-to-ebnf library is now ready for automated npm publishing! 🚀
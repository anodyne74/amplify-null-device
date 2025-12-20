# Ubuntu Setup Guide - Delivery Management Project

## Current Status

✅ **Project files migrated successfully**
❌ **Node.js/npm not installed**
❌ **Project dependencies not installed**

## Required Dependencies Checklist

### System Requirements

| Component | Required | Installed | Version |
|-----------|----------|-----------|---------|
| Node.js | v18.x or v20.x | ❌ NO | - |
| npm | v9.x+ | ❌ NO | - |
| Git | any | ✅ YES | (via `git status`) |
| curl/wget | for downloads | ✅ YES | curl 8.14.1 |

### Node.js Package Dependencies

**Runtime** (5 packages):
- next@^13.5.12
- react@^18.2.0
- react-dom@^18.2.0
- aws-amplify@^6.15.5
- @aws-amplify/ui-react@^6.12.0

**Development** (11 packages):
- jest@^29.7.0 - Testing framework
- @testing-library/react@^14.1.2 - React testing utilities
- @testing-library/jest-dom@^6.1.5 - DOM matchers
- ts-jest@^29.1.1 - TypeScript Jest support
- jest-environment-jsdom@^29.7.0 - Browser environment for tests
- typescript@^5.9.2 - TypeScript compiler
- eslint@^9.34.0 - Code linting
- @types/node@^20.8.0 - Node.js type definitions
- @types/react@^19.1.12 - React type definitions
- @types/react-dom@^19.1.9 - React DOM type definitions
- @types/jest@^29.5.11 - Jest type definitions

**Total**: 16 npm packages (+ their transitive dependencies)

## Installation Steps

### Step 1: Install Node.js and npm

Choose one of the following methods:

**Option A: Using Ubuntu's package manager** (recommended for Ubuntu)
```bash
sudo apt update
sudo apt install nodejs npm
node --version  # Verify installation
npm --version
```

**Option B: Using NodeSource repository** (for newer Node.js versions)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```

**Option C: Using nvm (Node Version Manager)** (for version flexibility)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Step 2: Verify Installation

```bash
node --version  # Should show v18.x or v20.x
npm --version   # Should show v9.x or higher
which node
which npm
```

### Step 3: Install Project Dependencies

```bash
cd /home/dave/Code/amplify-null-device
npm install
```

This will:
1. Read `package.json`
2. Install all 16 packages and their dependencies
3. Create `node_modules/` directory (~500MB typical for this project)
4. Create `package-lock.json` (preserves exact versions)

### Step 4: Verify Installation

```bash
npm run typecheck      # TypeScript type checking
npm run lint          # ESLint validation
npm run test:ci       # Jest test suite
npm run build         # Build next.js project
```

All commands should complete without errors.

## Constitutional Requirements Met After Setup

After npm install, the following constitutional principles can be enforced:

✅ **Principle II** - Full-Stack TypeScript: `npm run typecheck` validates all code
✅ **Principle III** - Component-Driven: Jest framework ready for component tests
✅ **Principle V** - Testing as Quality Gate: `npm run test:ci` runs with 70% coverage threshold
✅ **Principle VI** - Production Deployment: CI/CD quality gates active in amplify.yml

## Next Steps After Installation

1. **Verify setup**: Run `npm run typecheck && npm run lint`
2. **Start dev server**: `npm run dev` (starts on http://localhost:3000)
3. **Begin Phase 1**: Implement 8-entity Amplify schema (tasks T011-T027)
4. **Run tests**: `npm test` for watch mode, `npm run test:ci` for CI

## Troubleshooting

### "npm: command not found"
- Node.js not installed - see Step 1 above
- Wrong PATH - verify `which npm` shows `/usr/bin/npm` or similar

### "EACCES: permission denied" errors
- Don't use `sudo npm install` - this causes permission issues
- Use npm's official setup: `npm init -y` then `npm install`

### Port 3000 already in use
```bash
npm run dev -- -p 3001  # Use different port
```

### Large disk space required
- node_modules/ will be ~500MB-1GB (typical)
- Ensure 2GB free space before running `npm install`

## Files Already in Place

✅ `.github/workflows/ci.yml` - GitHub Actions CI/CD pipeline
✅ `.env.local.example` - Environment variables documentation
✅ `jest.config.js` - Jest testing framework configuration
✅ `jest.setup.js` - Jest setup with @testing-library/jest-dom
✅ `amplify.yml` - Enhanced with quality gates
✅ `package.json` - Updated with test scripts

These files are ready for npm and will be used immediately after `npm install`.

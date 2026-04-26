# Amplify Null Device Constitution

## Core Principles

### I. Authentication & Security First
Every user-facing feature MUST be protected by AWS Cognito authentication. Unauthenticated users can only access public information. Admin features require explicit role-based authorization. All sensitive data (credentials, tokens, API keys) MUST never be committed to version control and MUST be managed via Amplify environment variables. RATIONALE: Protects user data, maintains compliance with security standards, and enables role-based access control for admin features.

### II. Full-Stack TypeScript Consistency
All code—frontend (React/Next.js) and backend (AWS Lambda, Amplify Data)—MUST use TypeScript with strict null checks enabled. Type definitions MUST be shared between frontend and backend where applicable. RATIONALE: Improves code quality, reduces runtime errors, and enables better IDE support and refactoring across the stack.

### III. Component-Driven Frontend Architecture
React components MUST be self-contained, reusable, and properly typed. Each component MUST have a single, clear responsibility. UI state MUST be managed consistently (prefer React hooks and context over prop drilling). RATIONALE: Enables maintainability, testability, and component reusability across the application.

### IV. Data Integrity & Backend Contracts
Amplify Data resources (GraphQL/DataStore) MUST define strict schemas. All backend endpoints MUST validate input data against schema contracts. Breaking changes to data models MUST follow semantic versioning and include migration guidance. RATIONALE: Ensures data consistency, prevents invalid state, and enables frontend confidence in data structure.

### V. Testing as a Quality Gate
Unit tests MUST cover React components and utility functions (minimum 70% coverage). Integration tests MUST verify Cognito authentication flows and data operations. Manual testing checklist MUST be completed before merge. RATIONALE: Catches regressions early, documents expected behavior, and reduces production incidents.

### VI. Production Deployment Readiness
Every merge to main MUST pass all CI/CD checks (linting, type checking, tests, build). Deployments to AWS (S3, Lambda) MUST use environment-specific configurations. Post-deployment verification MUST include smoke tests on authentication and critical user flows. RATIONALE: Prevents broken deployments, maintains uptime, and provides confidence in releases.

## Technology Stack & Constraints

- **Frontend**: React 18+ with TypeScript, Vite build tool, Next.js for server-side rendering and API routes
- **Styling**: CSS modules and Tailwind CSS (if used); avoid inline styles for maintainability
- **Authentication**: AWS Cognito with Amplify Authenticator component
- **Data Layer**: AWS Amplify Data (GraphQL/DataStore) with strict schema definitions
- **Backend**: AWS Lambda (via Amplify functions), Amplify Auth, Amplify Data
- **Linting & Formatting**: ESLint with TypeScript support; maintain code style consistency
- **Package Manager**: npm (as defined in package.json)
- **Deployment**: AWS Amplify hosting or S3 + CloudFront; GitHub Actions for CI/CD

## Development Workflow

1. **Branch Strategy**: Feature branches off `main`; PR required for all changes; main branch is production-ready
2. **Code Review**: All PRs MUST be reviewed for compliance with constitution, type safety, test coverage, and code quality
3. **Commit Messages**: Follow conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
4. **Environment Variables**: Use `.amplify` configuration and GitHub Secrets; never hardcode credentials
5. **Local Development**: Run `npm run dev` to start dev server; run linting and tests before commit
6. **Testing Before Merge**: Ensure all tests pass locally (`npm run lint`, `npm run typecheck`, test suite)

## Governance

This constitution is the authoritative guide for all development decisions. Changes to principles require documentation, explicit rationale, and approval before implementation. All pull requests MUST verify compliance with applicable principles. Runtime development guidance is found in `copilot-instructions.md` and project-specific READMEs.

When conflicts arise between this constitution and other guidelines, this constitution takes precedence. Deviations MUST be documented as TODO items with clear justification and must receive explicit approval.

**Version**: 1.0.0 | **Ratified**: 2025-12-20 | **Last Amended**: 2025-12-20

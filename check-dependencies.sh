#!/bin/bash
# Dependency Check Script for Amplify Delivery Management Project
# Usage: bash check-dependencies.sh

echo "=========================================="
echo "Delivery Management Project - Dependency Check"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
ALL_OK=true

# Function to check command availability
check_command() {
    local cmd=$1
    local display_name=${2:-$cmd}
    
    if command -v $cmd &> /dev/null; then
        local version=$($cmd --version 2>&1 | head -1)
        echo -e "${GREEN}✓${NC} $display_name: $version"
    else
        echo -e "${RED}✗${NC} $display_name: NOT FOUND"
        ALL_OK=false
    fi
}

# Function to check file/directory existence
check_file() {
    local file=$1
    local display_name=${2:-$file}
    
    if [ -e "$file" ]; then
        local size=$(du -h "$file" 2>/dev/null | cut -f1)
        echo -e "${GREEN}✓${NC} $display_name: exists ($size)"
    else
        echo -e "${RED}✗${NC} $display_name: MISSING"
        ALL_OK=false
    fi
}

# System Requirements
echo "🔍 SYSTEM REQUIREMENTS"
echo "----------------------------------------"
check_command "node" "Node.js"
check_command "npm" "npm"
check_command "git" "Git"
check_command "curl" "curl"
echo ""

# Project Files
echo "🔍 PROJECT FILES"
echo "----------------------------------------"
check_file "package.json" "package.json"
check_file "package-lock.json" "package-lock.json (lock file)"
check_file ".gitignore" ".gitignore"
check_file "tsconfig.json" "TypeScript config"
echo ""

# Configuration Files (Sprint 1 Setup)
echo "🔍 CONFIGURATION FILES (Sprint 1 Setup)"
echo "----------------------------------------"
check_file "jest.config.js" "jest.config.js"
check_file "jest.setup.js" "jest.setup.js"
check_file ".github/workflows/ci.yml" "GitHub Actions CI/CD"
check_file "amplify.yml" "Amplify configuration"
check_file ".env.local.example" "Environment variables template"
echo ""

# Node Modules
echo "🔍 INSTALLED NODE MODULES"
echo "----------------------------------------"
if [ -d "node_modules" ]; then
    local count=$(ls -1 node_modules | wc -l)
    local size=$(du -sh node_modules 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓${NC} node_modules: $count packages, $size"
    
    # Check for specific key packages
    echo ""
    echo "   Key packages:"
    for pkg in react next jest typescript eslint aws-amplify; do
        if [ -d "node_modules/$pkg" ]; then
            echo -e "   ${GREEN}✓${NC} $pkg"
        else
            echo -e "   ${RED}✗${NC} $pkg"
        fi
    done
else
    echo -e "${RED}✗${NC} node_modules: NOT FOUND - run 'npm install'"
    ALL_OK=false
fi
echo ""

# Amplify-specific files
echo "🔍 AMPLIFY PROJECT FILES"
echo "----------------------------------------"
check_file "amplify/" "amplify/ directory"
check_file "amplify/backend.ts" "Amplify backend definition"
check_file "amplify/auth/" "Amplify auth resources"
check_file "amplify/data/" "Amplify data resources"
echo ""

# Source Code
echo "🔍 SOURCE CODE"
echo "----------------------------------------"
check_file "app/" "app/ (Next.js)"
check_file "src/" "src/ (additional components)"
check_file "public/" "public/ (static assets)"
echo ""

# Summary
echo "=========================================="
if [ "$ALL_OK" = false ]; then
    echo -e "${RED}⚠ SETUP INCOMPLETE${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install Node.js: sudo apt install nodejs npm"
    echo "2. Install dependencies: npm install"
    echo "3. Verify setup: npm run typecheck && npm run lint"
else
    echo -e "${GREEN}✓ ALL DEPENDENCIES INSTALLED${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run tests: npm run test:ci"
    echo "2. Start dev server: npm run dev"
    echo "3. Begin Phase 1: Amplify schema implementation"
fi
echo "=========================================="

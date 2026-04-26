#!/bin/bash

# Cognito Sandbox Testing Script
# This script helps with testing Cognito authentication locally

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "================================"
echo "Cognito Configuration & Testing"
echo "================================"
echo ""

# Check if Node modules are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Verify Amplify Gen 2 CLI is available before offering sandbox/deploy actions
if ! npx --no-install ampx --version > /dev/null 2>&1; then
    echo ""
    echo "❌ Amplify Gen 2 CLI (ampx) not found in local dependencies."
    echo "Install it with: npm install --save-dev @aws-amplify/backend-cli"
    exit 1
fi

# Display options
echo "What would you like to do?"
echo ""
echo "1. Start Amplify sandbox (local backend)"
echo "2. Run dev server with sandbox"
echo "3. View Cognito configuration status"
echo "4. Reset Amplify sandbox (clear data)"
echo "5. Deploy to AWS"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo "Starting Amplify sandbox..."
        echo "The Cognito User Pool will be available locally."
        echo "Keep this terminal open while testing."
        echo ""
        npx ampx sandbox
        ;;
    2)
        echo ""
        echo "Starting Amplify sandbox and dev server..."
        echo "Open another terminal and run: npm run dev"
        echo ""
        npx ampx sandbox
        ;;
    3)
        echo ""
        echo "Cognito Configuration Status:"
        echo "============================"
        echo ""
        echo "Auth Resource: amplify/auth/resource.ts"
        grep -A 5 "loginWith:" amplify/auth/resource.ts || echo "Not found"
        echo ""
        echo "Auth Utilities: lib/amplify-config.ts"
        echo "- isCustomer()"
        echo "- isOperator()"
        echo "- isAdmin()"
        echo "- getUserGroups()"
        echo ""
        echo "User Groups (Manual Setup Required):"
        echo "- customer (read-only access to own data)"
        echo "- operator (full management access)"
        echo ""
        echo "See COGNITO_SETUP.md for detailed configuration steps."
        echo ""
        ;;
    4)
        echo ""
        echo "Resetting Amplify sandbox..."
        echo "This will clear all local data."
        read -p "Are you sure? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            npx ampx sandbox --reset
        else
            echo "Cancelled."
        fi
        ;;
    5)
        echo ""
        echo "Deploying to AWS..."
        echo "Make sure you have AWS credentials configured."
        echo ""
        npx ampx deploy
        ;;
    *)
        echo "Invalid choice."
        exit 1
        ;;
esac

echo ""
echo "Done!"

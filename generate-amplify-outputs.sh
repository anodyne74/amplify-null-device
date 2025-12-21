#!/bin/bash
# Generate placeholder amplify_outputs.json for build if it doesn't exist
# This is needed for TypeScript compilation in CI/CD environments

OUTPUT_FILE="amplify_outputs.json"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "Generating placeholder $OUTPUT_FILE for build..."
  
  cat > "$OUTPUT_FILE" << 'EOF'
{
  "auth": {
    "user_pool_id": "PLACEHOLDER_USER_POOL_ID",
    "aws_region": "ap-southeast-2",
    "user_pool_client_id": "PLACEHOLDER_CLIENT_ID",
    "identity_pool_id": "ap-southeast-2:PLACEHOLDER_IDENTITY_ID",
    "mfa_methods": [],
    "standard_required_attributes": ["email"],
    "username_attributes": ["email"],
    "user_verification_types": ["email"],
    "groups": [],
    "mfa_configuration": "NONE",
    "password_policy": {
      "min_length": 8,
      "require_lowercase": true,
      "require_numbers": true,
      "require_symbols": true,
      "require_uppercase": true
    },
    "unauthenticated_identities_enabled": true
  },
  "data": {
    "url": "https://PLACEHOLDER.appsync-api.ap-southeast-2.amazonaws.com/graphql",
    "aws_region": "ap-southeast-2",
    "default_authorization_type": "AWS_IAM",
    "authorization_types": ["AMAZON_COGNITO_USER_POOLS"],
    "model_introspection": {
      "version": 1,
      "models": {}
    }
  }
}
EOF
  
  echo "✓ Placeholder $OUTPUT_FILE created"
else
  echo "✓ $OUTPUT_FILE already exists"
fi

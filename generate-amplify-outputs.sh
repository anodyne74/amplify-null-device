#!/bin/bash
# Compatibility wrapper for legacy callers.
# Canonical output generation now lives in scripts/generate-amplify-outputs-from-backend.js.

set -e

node scripts/generate-amplify-outputs-from-backend.js

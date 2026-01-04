#!/bin/bash
# Update Flaggly from upstream while preserving your wrangler.jsonc configuration

set -e

REMOTE_NAME="flaggly"
REMOTE_URL="https://github.com/butttons/flaggly.git"

echo "Updating Flaggly from upstream..."

# Add remote if it doesn't exist
if ! git remote | grep -q "^${REMOTE_NAME}$"; then
  echo "Adding upstream remote..."
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Backup wrangler.jsonc
echo "Backing up wrangler.jsonc..."
cp wrangler.jsonc wrangler.jsonc.bak

# Fetch and merge
echo "Fetching latest changes..."
git fetch "$REMOTE_NAME"

echo "Merging changes..."
git merge "$REMOTE_NAME/main" -m "Update from upstream flaggly"

# Restore wrangler.jsonc
echo "Restoring your wrangler.jsonc configuration..."
mv wrangler.jsonc.bak wrangler.jsonc
git add wrangler.jsonc

echo ""
echo "Update complete!"
echo "Review the changes, then deploy with: pnpm deploy"

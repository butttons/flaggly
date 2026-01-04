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

# Fetch latest
echo "Fetching latest changes..."
git fetch "$REMOTE_NAME"

# Merge upstream, auto-resolve conflicts in favor of upstream
echo "Merging upstream changes..."
git merge -X theirs "$REMOTE_NAME/main" -m "Update from upstream flaggly"

# Restore wrangler.jsonc
echo "Restoring your wrangler.jsonc configuration..."
cp wrangler.jsonc.bak wrangler.jsonc
rm wrangler.jsonc.bak

echo ""
echo "Update complete!"
echo "Push with: git push"
echo "Deploy with: pnpm deploy"

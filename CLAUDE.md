# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flaggly is a feature flag service built as a Cloudflare Worker. It provides a REST API for managing and evaluating feature flags with support for boolean flags, payload flags, and variant (A/B test) flags.

## Development Commands

```bash
pnpm dev          # Start local development server (wrangler dev)
pnpm test         # Run tests in watch mode (vitest)
pnpm test:run     # Run tests once
pnpm build        # Build the worker (wrangler types && wrangler build)
pnpm deploy       # Deploy to Cloudflare (wrangler types && wrangler deploy)
pnpm build:sdk    # Build the client SDK (tsup)
```

## Architecture

### Core Components

- **`src/index.ts`** - Worker entry point, exports fetch handler
- **`src/app.ts`** - Hono app setup with CORS, middleware, and route mounting
- **`src/engine.ts`** - Flag evaluation engine using JEXL for rule expressions
- **`src/storage.ts`** - `AppKV` class for Cloudflare KV operations
- **`src/schema.ts`** - Zod schemas for all data types (flags, segments, inputs)
- **`src/error.ts`** - `FlagglyError` class with error codes and HTTP status mapping

### Routes

- **`/api/*`** - Public API routes (requires `flaggly.user` JWT)
  - `POST /api/eval` - Evaluate all flags for a user
  - `POST /api/eval/:id` - Evaluate a single flag
- **`/admin/*`** - Admin routes (requires `flaggly.admin` JWT)
  - CRUD for flags and segments
  - Environment sync endpoints
- **`/__generate`** - Generate JWT tokens (requires JWT_SECRET)

### SDK (`sdk/index.ts`)

Client SDK using nanostores for state management. Key features:
- Type-safe flag definitions via `FlagSchema` generic
- `identify()` for user identification
- Bootstrap values for SSR
- `workerFetch` option for Cloudflare service bindings

### Flag Types

1. **Boolean** - Simple on/off flags
2. **Payload** - Returns arbitrary JSON payload when enabled
3. **Variant** - A/B testing with weighted variations

### Evaluation Flow

1. Check if flag is enabled
2. Evaluate JEXL rules (AND logic - all must pass)
3. Evaluate segments (OR logic - any must match)
4. Check rollout percentage or rollout steps
5. For variants, use deterministic hashing (FNV-1a) to select variant

### Cloudflare Bindings

- `FLAGGLY_KV` - KV namespace for flag/segment storage
- `FLAGGLY_RATE_LIMITER` - Rate limiting (100 req/60s per user)
- `FLAGGLY_ANALYTICS` - Analytics Engine for flag evaluation tracking
- `JWT_SECRET` - Secret for JWT signing/verification
- `ORIGIN` - Comma-separated allowed origins for CORS

## Key Patterns

- Headers `x-app-id` and `x-env-id` identify the app/environment context
- KV key format: `v1:{app}:{env}` stores all flags and segments as a single JSON object
- JEXL expressions can access: `user`, `id`, `page.url`, `geo.*`, `request.headers`
- Custom JEXL transforms: `split`, `lower`, `upper` and functions: `ts()`, `now()`

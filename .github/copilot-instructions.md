# Discord AI Bot — Copilot Instructions

## Project Overview

This is a **Cloudflare Workers** Discord bot with **MCP (Model Context Protocol)** server, AI integration, scheduler, and ~115 tools.

## Tech Stack

- **Runtime:** Cloudflare Workers (Node.js compat via `nodejs_compat` flag)
- **Language:** TypeScript 5.5 (strict mode, ES2024 target, Bundler module resolution)
- **AI:** `@cf/meta/llama-4-scout-17b-16e-instruct` via Workers AI binding
- **Database:** Cloudflare KV (`SCHEDULER_KV`)
- **MCP Protocol:** Streamable HTTP (SSE GET + JSON-RPC POST)
- **Testing:** Vitest + `@cloudflare/vitest-pool-workers`
- **Formatting:** Prettier (140 col, single quote, tabs)

## Available Skills

This repo includes the following skills in `.github/skills/`:

| Skill | File | Purpose |
|-------|------|---------|
| Cloudflare | `cloudflare-skill.md` | General Cloudflare platform knowledge |
| Workers Best Practices | `workers-best-practices.md` | Workers code patterns & anti-patterns |
| Wrangler | `wrangler-skill.md` | Wrangler CLI commands & config |
| Agents SDK | `agents-sdk-skill.md` | Building stateful agents on Workers |
| Durable Objects | `durable-objects-skill.md` | Stateful coordination & SQLite storage |

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run dev` | Local development (wrangler dev) |
| `npm test` | Run Vitest suite |
| `npm run cf-typegen` | Regenerate TypeScript types from bindings |
| `node scripts/register-commands.mjs` | Register Discord slash commands |

## Key Bindings

- **AI Binding:** `AI` → `@cf/meta/llama-4-scout-17b-16e-instruct`
- **KV Namespace:** `SCHEDULER_KV`
- **Cron Trigger:** `* * * * *` (every minute)

## Project Structure

```
src/
├── index.ts            # Entry: fetch + scheduled handler
├── mcp-handler.ts      # MCP server + ~115 tools
├── mcp-confirm.ts      # Confirmation queue
├── scheduler.ts        # Cron scheduler
├── ai-router.ts        # Multi-provider AI (Cloudflare, NVIDIA, OpenRouter, OpenCode)
├── user-config.ts      # Per-user provider config via KV
├── web-scout.ts        # Web search & scrape
├── image-scraper.ts    # Anime image search (AniList, Kitsu, Jikan, ANN)
└── github-studio.ts    # GitHub API toolkit
```

## Important Notes

- Run `wrangler types` after changing bindings in `wrangler.jsonc`
- Discord `/ask` is restricted to user ID `468772891371110411` (via `ALLOWED_USER_ID` secret)
- Admin actions require confirmation via `confirm-action`/`cancel-action` tools
- Image sources are all FREE (no API key needed): AniList, Kitsu, Jikan, ANN
- AI Router supports auto-failover: Cloudflare → NVIDIA NIM → OpenRouter → OpenCode

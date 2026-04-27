# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # Install deps, generate Prisma client, run migrations (first-time setup)
npm run dev          # Start development server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run db:reset     # Reset SQLite database
```

Run a single test file: `npx vitest run src/components/chat/__tests__/MessageList.test.tsx`

## Architecture

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface; Claude generates/edits files via tool calls in a virtual file system that is then transpiled and rendered live.

### Core data flow

1. User sends a message → `POST /api/chat` (`src/app/api/chat/route.ts`)
2. Server streams `streamText()` (Vercel AI SDK) with the Claude model and two tools:
   - `str_replace_editor` — edits file content in the virtual FS
   - `file_manager` — creates/deletes/lists files
3. Tool calls mutate the in-memory `VirtualFileSystem` (serialized as JSON and persisted per project in SQLite)
4. Frontend (`lib/contexts/file-system-context.tsx`) receives streaming updates and re-renders the preview via `PreviewFrame`, which transpiles JSX on-the-fly (`lib/transform/jsx-transformer.ts`)

### Key files

| File | Role |
|------|------|
| `src/lib/file-system.ts` | `VirtualFileSystem` class — all in-memory file operations |
| `src/lib/provider.ts` | Selects Claude Haiku 4.5 or a `MockLanguageModel` (no API key needed for demo) |
| `src/app/api/chat/route.ts` | Streaming AI endpoint; defines tool schemas; caches system prompt with Anthropic ephemeral cache |
| `src/lib/prompts/generation.tsx` | System prompt for component generation |
| `src/lib/contexts/chat-context.tsx` | React context managing chat state and streaming |
| `src/lib/contexts/file-system-context.tsx` | React context for virtual FS state |
| `src/app/main-content.tsx` | Three-panel resizable layout: chat / preview / code editor |
| `src/lib/auth.ts` | JWT sessions (HTTP-only cookies, 7-day TTL, `jose` + `bcrypt`) |
| `prisma/schema.prisma` | `User` and `Project` models; messages and file data stored as JSON blobs |

### VirtualFileSystem

All generated code lives in memory as a path→content map. The root is `/`; every project must expose `/App.jsx` as its default export. Files are serialized to the `Project.data` JSON column for persistence.

### Authentication

JWT-based, server-only (`lib/auth.ts`). Sessions are stored in HTTP-only cookies. Users are optional — anonymous users can generate components but they are not saved. `src/actions/index.ts` exports `signUp`, `signIn`, `signOut`, `getUser` as Next.js Server Actions.

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | No | If absent, app runs in demo mode with `MockLanguageModel` |
| `JWT_SECRET` | No | Defaults to `"development-secret-key"` |

### Conventions

- `@/` path alias for all internal imports
- Tailwind CSS only — no inline styles or CSS modules
- Generated components must be functional React components using only JSX/TSX; no HTML files
- UI primitives live in `src/components/ui/` (Radix UI wrappers)
- Tests live in `__tests__/` directories co-located with the code they test
- Comments only on genuinely complex code — skip anything self-explanatory from naming
- Use full, descriptive names for functions and methods — no abbreviations or cryptic shorthand

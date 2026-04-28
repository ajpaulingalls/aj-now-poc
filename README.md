# aj-now-poc

**AJ Now** — AI-Powered Reporter Mobile App (Expo MVP)

A mobile-first field reporting tool for Al Jazeera correspondents: assignments, capture (photo/video/audio), offline drafts, sync, and safety check-ins.

## Stack

- **Mobile:** Expo (React Native) + TypeScript + Expo Router
- **Server:** Bun + Hono + SQLite (`bun:sqlite`)
- **Shared:** TypeScript types, theme tokens, constants (workspace package)

## Repo Layout

```
aj-now-poc/
├── apps/
│   ├── mobile/    # Expo app (TS)
│   └── server/    # Bun + Hono local API
├── packages/
│   └── shared/    # Shared types, theme, constants
├── DESIGN_TOKENS.md
└── package.json   # workspaces root
```

## Quick Start

```bash
# install deps (from root)
bun install

# run server (port 3001)
bun run server

# run mobile (Expo)
bun run mobile
```

## Demo Login

- Email: `demo@aljazeera.net`
- Password: anything (demo mode accepts any password)

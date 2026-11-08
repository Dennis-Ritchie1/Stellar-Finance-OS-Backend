# @finance-os/config

Env loading + validation (Zod) and network config.

- `loadEnv()` finds the nearest `.env`, validates it, and memoises the result.
- `assertNetworkAllowed()` blocks mainnet unless `ALLOW_MAINNET=true` (AGENTS.md #8).
- `getAssets(network)` — assets keyed by network. USDC issuers must come from Circle's official docs.

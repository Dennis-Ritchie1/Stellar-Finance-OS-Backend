# @finance-os/shared

Zod schemas, enums, error types and money utilities shared by every app.

- `money/` — exact amount math via stroops (`bigint`). Never use floats (AGENTS.md #2).
- `enums/` — domain enums from README §4 as Zod enums.
- `errors/` — `AppError` with stable codes and HTTP statuses.
- `schemas/` — address shapes, pagination, org-scoped params, secret-key guard.

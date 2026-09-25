# Parkinson Care AI

An accessible healthcare companion for Parkinson's patients and caregivers, with medication routines, adherence insights, emergency support, and care-service requests.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/parkinson-care-ai run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/parkinson-care-ai run typecheck` — check the frontend
- Required env for the shared API service: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite + Wouter + TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/parkinson-care-ai/src/App.tsx` — application routes, shared shell, and frontend feature screens
- `artifacts/parkinson-care-ai/src/index.css` — shared design tokens and responsive styles
- `artifacts/api-server/src/routes/parkinson.ts` — demo-safe API routes and seeded care data
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/api-client-react/src/generated/` — generated frontend hooks

## Architecture decisions

- The initial product is intentionally demo-safe: provider-backed actions are represented as requests or internal notifications until a verified provider is connected.
- Browser speech synthesis and geolocation are used only when the patient explicitly invokes them; the app does not continuously track location.
- The API seed data is synthetic and designed for presentation mode, not real patient data.

## Product

The app provides a landing page, demo onboarding, dashboard, medicines and dose tracking, medication history, assistant chat with safety boundaries, adherence risk, caregiver information, SOS/location flows, nearby care directories, appointment and medicine-order requests, reports, profile, and settings.

## User preferences

The interface should remain elderly-friendly: readable type, large controls, clear labels, and an SOS action that is always easy to find.

## Gotchas

- If the OpenAPI contract changes, run `pnpm --filter @workspace/api-spec run codegen` before typechecking or editing hook consumers.
- External SMS, WhatsApp, ambulance dispatch, hospital booking, pharmacy inventory, and medicine delivery are not claimed as completed without their providers.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

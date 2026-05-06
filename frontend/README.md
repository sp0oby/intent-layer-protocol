# Frontend — Intent Protocol Layer

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, **wagmi** + **viem**, **TanStack Query**, **Zustand**, **Framer Motion**, shadcn-style UI primitives (e.g. [`components/ui/button.tsx`](components/ui/button.tsx)).

**Role in the repo:** Web client for creating and tracking cross-chain intents. Today it uses a **mock API** and stub forms; wire it to deployed contracts and the real backend per the [MVP specification](../MVP_SPECIFICATION.md).

**See also:** [Repository README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Technology stack](../TECH_STACK.md)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server (default [http://localhost:3000](http://localhost:3000)) |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint (Next.js config) |

---

## Configuration

Public env vars are prefixed with `NEXT_PUBLIC_`. Start from the repo root [`.env.example`](../.env.example) — **never commit** RPC keys or secrets.

---

## Route map (skeleton)

| Route | Purpose |
|-------|---------|
| [`app/page.tsx`](app/page.tsx) | Landing |
| [`app/swap/page.tsx`](app/swap/page.tsx) | Intent creation stub + wallet bar |
| [`app/intent/[id]/page.tsx`](app/intent/[id]/page.tsx) | Intent status (reads dummy [`app/api/intents/route.ts`](app/api/intents/route.ts)) |

---

## Contributing

Follow [CONTRIBUTING.md](../CONTRIBUTING.md): keep `npm run build` green, prefer small PRs, and extend TanStack Query hooks when replacing mock data with real endpoints.

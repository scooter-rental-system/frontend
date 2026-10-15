This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Backend connection

Browser requests to `/api/*` are proxied to the Spring Boot backend (see `rewrites` in `next.config.ts`). The target defaults to `http://localhost:8080`; set `BACKEND_URL` before `npm run dev` / `npm run build` to change it.

### Checks

```bash
npm run lint
npm run typecheck   # generates Next route types, then runs tsc
npm test            # unit tests (Node's built-in test runner)
npm run build
```

### Customer dashboard (FE-004)

Routes: `/dashboard` (overview, active reservations, recent history), `/dashboard/bookings` (full booking history with filters) and `/dashboard/profile`.

It expects these backend endpoints, authenticated with the JWT stored by the login flow (`setToken` in `lib/api.ts`):

| Endpoint | Response | Must be scoped to |
|---|---|---|
| `GET /api/me` | current user (`User` in `lib/types.ts`) | the token's user |
| `GET /api/bookings` | `BookingDtos.BookingResponse[]` | the token's user only |

The page hides itself from signed-out and non-customer users, but that is only a UX guard. Data isolation must be enforced by the backend.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

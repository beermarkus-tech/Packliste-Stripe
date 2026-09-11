# Packliste

PWA for trip packing prep and checklists. Replaces a Google Sheet workflow — see the spec in this repo's history/PR description for full details. Originally a single-user app, now a small paid multi-user pilot: any Google account can sign in, and a one-time Stripe payment unlocks that account's own independent data.

## Stack

- Vite + vanilla JavaScript (no framework, no TypeScript)
- Alpine.js for declarative UI binding
- Firebase Firestore (client SDK, offline persistence) + Firebase Auth (Google Sign-In, open to any account)
- Firebase Cloud Functions (`functions/`) for the two Stripe touchpoints — creating a Checkout Session and verifying the payment webhook — since GitHub Pages is static-only and can't hold a Stripe secret key
- Stripe Checkout (one-time payment, test mode for this pilot)
- Deployed to GitHub Pages via GitHub Actions

## Project structure

```
src/
  lib/      shared helpers (firebase client, router, formatting, etc.)
  screens/  one module per screen (Home, Prep, Checklist, Settings)
  data/     seed data and data-access helpers
```

## Development

```
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

## Deployment

This is a **staging copy** of Packliste used to develop and test the multi-user/Stripe pilot in isolation — production lives at [beermarkus-tech/Packliste](https://github.com/beermarkus-tech/Packliste). Pushes build and publish automatically to GitHub Pages via `.github/workflows/deploy.yml`. The app is served from the `/Packliste-Stripe/` subpath and is installable (manifest + service worker via `vite-plugin-pwa`).

**One-time setup required in the repo settings** (GitHub won't let a workflow enable this on its own): Settings → Pages → Build and deployment → Source: **GitHub Actions**. Once that's set, the next push triggers a deploy and the Pages URL appears on that same Settings → Pages screen.

## Firebase setup

This app reuses the existing **exercise-tracker** Firebase project (same project as production Packliste), registered as its own Web app within that project, with its own Firestore database named `packliste-stripe` — separate from both production's `packliste` database and the project's default database, so this pilot's rules and data can never collide with or overwrite production's. Config lives in `src/lib/firebase.js` — Firebase web config values aren't secret, so they're committed directly rather than injected at build time.

Auth is Google Sign-In (not email/password), open to any Google account — access to actual data is gated by payment, not identity. Every collection lives under `users/{uid}/...`; the security rules enforcing per-user isolation plus the `paid == true` gate live in `firestore.rules`. `firebase.json`/`.firebaserc` are wired up (scoped explicitly to the `packliste-stripe` database), so rules and Cloud Functions deploy via the Firebase CLI: `firebase deploy --only firestore:rules` / `firebase deploy --only functions`. The `packliste-stripe` database itself must be created once in the Firebase console before the first rules deploy (Firestore Database → Create database → set an ID of `packliste-stripe`).

## Payments (Stripe)

Access is gated by a one-time Stripe payment (test mode for this pilot — see `functions/index.js`):

- `createCheckoutSession` (callable) creates a Stripe Checkout Session for the signed-in user and returns its URL.
- `stripeWebhook` (HTTPS) verifies Stripe's webhook signature and, on `checkout.session.completed`, sets `paid: true` on that user's `users/{uid}` profile doc via the Admin SDK — the only way that field can ever be set, since Firestore rules forbid any client from writing it directly.

Both functions need `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set via `firebase functions:secrets:set`; they're never present in the frontend build. See the project's implementation notes for the full one-time setup checklist (Blaze plan, Stripe webhook registration, etc.).

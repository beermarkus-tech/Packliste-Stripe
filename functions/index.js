import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// This is the staging copy of Packliste, served from GitHub Pages under
// this fixed path — Stripe's redirect targets must resolve here to stay
// inside the installed PWA's manifest scope/start_url (both
// '/Packliste-Stripe/'). See beermarkus-tech/Packliste for production.
const APP_URL = 'https://beermarkus-tech.github.io/Packliste-Stripe/';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const app = initializeApp();
// Same named Firestore database the client uses (see src/lib/firebase.js's
// DATABASE_ID) — its own "packliste-stripe" database, isolated from both
// production Packliste's "packliste" database and the project's default
// one (the unrelated exercise-tracker app this project is reused from).
const db = getFirestore(app, 'packliste-stripe');

// One-time payment only (no subscription) — a single Stripe Checkout
// Session in 'payment' mode, using inline price_data so there's no Stripe
// Dashboard product/catalog to maintain. client_reference_id carries the
// Firebase uid through to the webhook below, which is the only thing
// allowed to flip a profile's `paid` flag to true.
export const createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: request.auth.uid,
    customer_email: request.auth.token.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 100,
          product_data: { name: 'Packliste — lifetime access' },
        },
      },
    ],
    success_url: `${APP_URL}?checkout=success`,
    cancel_url: `${APP_URL}?checkout=cancelled`,
  });

  return { url: session.url };
});

// Raw HTTPS endpoint (not onCall) — Stripe posts here directly with its
// own signature scheme, not Firebase's callable protocol. onRequest
// exposes req.rawBody, which stripe.webhooks.constructEvent needs for
// signature verification (a parsed body won't match the signature).
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      console.error('Stripe webhook signature verification failed', err);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Only checkout.session.completed matters for a one-time payment —
    // everything else (refunds, disputes) is out of scope for this pilot,
    // just acknowledged so Stripe doesn't keep retrying.
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const uid = session.client_reference_id;
      if (uid) {
        await db.doc(`users/${uid}`).set(
          {
            paid: true,
            paidAt: FieldValue.serverTimestamp(),
            stripeCustomerId: session.customer ?? null,
            stripeCheckoutSessionId: session.id,
          },
          { merge: true }
        );
      } else {
        console.error('checkout.session.completed with no client_reference_id', session.id);
      }
    }

    res.status(200).send();
  }
);

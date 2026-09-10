// One-time migration: copies the owner's existing data out of the old flat
// top-level collections (buckets, catalog, categories, templates, trips)
// into users/{ownerUid}/..., and marks the owner's profile as paid (they
// built the app, they don't pay themselves via Checkout).
//
// Run once, then delete this file — same lifecycle as this repo's earlier
// migrateTripsToLocalCatalog.js. Needs the Admin SDK specifically because
// it must set `paid: true`, which firestore.rules forbids from any client.
//
// Usage (firebase-admin isn't a project dependency — it's only needed for
// this one-off script, so install it temporarily rather than adding it to
// package.json):
//   npm install --no-save firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/migrate-to-per-user.mjs
//
// Does NOT delete the old top-level collections — that's a deliberate,
// separate manual step you do after confirming the app works end-to-end
// against the new per-user paths.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const OWNER_EMAIL = 'beer.markus@gmail.com';
const COLLECTIONS = ['buckets', 'catalog', 'categories', 'templates', 'trips'];
const BATCH_LIMIT = 500;

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, 'packliste');

async function copyCollection(name, ownerUid) {
  const snap = await db.collection(name).get();
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const docSnap of docs.slice(i, i + BATCH_LIMIT)) {
      const destRef = db.collection('users').doc(ownerUid).collection(name).doc(docSnap.id);
      batch.set(destRef, docSnap.data());
    }
    await batch.commit();
  }

  return docs.length;
}

async function main() {
  const owner = await getAuth(app).getUserByEmail(OWNER_EMAIL);
  console.log(`Migrating data for ${OWNER_EMAIL} (uid: ${owner.uid})`);

  for (const name of COLLECTIONS) {
    const count = await copyCollection(name, owner.uid);
    console.log(`  ${name}: copied ${count} doc(s)`);
  }

  await db.collection('users').doc(owner.uid).set(
    {
      paid: true,
      paidAt: FieldValue.serverTimestamp(),
      stripeCustomerId: null,
      stripeCheckoutSessionId: null,
      email: OWNER_EMAIL,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log('Owner profile marked paid: true');

  console.log('\nDone. Old top-level collections were left in place — verify the');
  console.log('app works end-to-end, then delete them manually, along with this');
  console.log('script and your service-account key.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});

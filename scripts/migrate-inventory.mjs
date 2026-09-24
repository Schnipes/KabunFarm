// ============================================================================
// Kabun Farm Intelligence — One-off Inventory Reconciliation Migration
// Usage:  node scripts/migrate-inventory.mjs
// Env:    FIREBASE_SERVICE_ACCOUNT (raw JSON, same var as api/telegram.js)
//
// Upserts the reconciled dosage schema (dosePerLitre / doseUnit /
// dosePerApplication / moaCode / phiDays) into the Firestore `inventory`
// collection. NON-DESTRUCTIVE: existing documents are patched with the new
// dose fields only — operator-edited pricing (packPrice / packSize /
// costPerUnit) is never overwritten. Missing documents are created with the
// full schema. Run once after deploying the schema change; safe to re-run.
// The Firestore `inventory` collection remains the single source of truth.
// ============================================================================

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!rawSA) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT env variable is missing.');
    console.error('   Set it to the raw service-account JSON and re-run.');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = typeof rawSA === 'string' ? JSON.parse(rawSA.trim()) : rawSA;
} catch (e) {
    console.error('❌ Could not parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    process.exit(1);
}
if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id || 'kabunfarm'
});
const db = getFirestore();

// Mirror of DEFAULT_INVENTORY in js/state.js (kept in sync; node cannot import
// the browser module directly because js/state.js touches window/localStorage).
const DEFAULT_INVENTORY = [
    { id: "bio_botava", name: "KMB Bio Botava", category: "foliar", packPrice: 94.00, packSize: 1000, unit: "ml", costPerUnit: 0.094, dosePerLitre: 2.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "amino_18", name: "KMB Amino 18", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "NUT-AMINO", phiDays: 0 },
    { id: "garlic_oil", name: "Garlic Oil Extract", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "neem_oil", name: "Neem Oil", category: "foliar", packPrice: 34.00, packSize: 1000, unit: "ml", costPerUnit: 0.034, dosePerLitre: 5.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "wood_vinegar", name: "Wood Vinegar", category: "foliar", packPrice: 18.00, packSize: 1000, unit: "ml", costPerUnit: 0.018, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "FRAC M", phiDays: 0 },
    { id: "seaweed", name: "Seaweed Extract", category: "foliar", packPrice: 60.00, packSize: 1000, unit: "ml", costPerUnit: 0.060, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "BIO-KELP", phiDays: 0 },
    { id: "pest_guard_2", name: "KMB Pest Guard 2 (Powder)", category: "foliar", packPrice: 75.00, packSize: 500, unit: "g", costPerUnit: 0.150, dosePerLitre: 3.0, doseUnit: "g", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "wira_calbo", name: "Wira CalBo", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "ml", costPerUnit: 0.045, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "NUT-CA-B", phiDays: 0 },
    { id: "antracol", name: "Antracol 70 WP", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "g", costPerUnit: 0.045, dosePerLitre: 2.0, doseUnit: "g", dosePerApplication: 0, moaCode: "FRAC M02", phiDays: 7 },
    { id: "em4", name: "EM4", category: "foliar", packPrice: 25.00, packSize: 1000, unit: "ml", costPerUnit: 0.025, dosePerLitre: 5.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "BIO-01", phiDays: 0 },
    { id: "abamectin", name: "Abamectin", category: "foliar", packPrice: 38.00, packSize: 1000, unit: "ml", costPerUnit: 0.038, dosePerLitre: 1.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC 6", phiDays: 7 },
    { id: "cypermethrin", name: "Cypermethrin", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC 3A", phiDays: 7 },
    { id: "npk_11_11_11", name: "RealStrong NPK 11-11-11", category: "fertilizer", packPrice: 115.00, packSize: 25, unit: "kg", costPerUnit: 4.60, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "npk_8_8_29", name: "RealStrong NPK 8-8-29", category: "fertilizer", packPrice: 140.00, packSize: 25, unit: "kg", costPerUnit: 5.60, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "bluvita_16_16_16", name: "Bluvita NPK 16-16-16", category: "fertilizer", packPrice: 185.00, packSize: 50, unit: "kg", costPerUnit: 3.70, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "dolomite", name: "Dolomite (Kapur Pertanian)", category: "fertilizer", packPrice: 20.00, packSize: 25, unit: "kg", costPerUnit: 0.80, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 }
];

try {
    let created = 0, patched = 0;
    for (const item of DEFAULT_INVENTORY) {
        const { id, ...data } = item;
        const ref = db.collection('inventory').doc(id);
        const existing = await ref.get();

        if (existing.exists) {
            // Non-destructive patch: write ONLY the new schema fields so live
            // operator-edited pricing (packPrice/packSize/costPerUnit) is never
            // reverted to code defaults.
            await ref.set({
                id,
                dosePerLitre: data.dosePerLitre,
                doseUnit: data.doseUnit,
                dosePerApplication: data.dosePerApplication,
                moaCode: data.moaCode,
                phiDays: data.phiDays
            }, { merge: true });
            patched++;
            console.log(`✅ Patched dose schema on ${id} (pricing untouched)`);
        } else {
            // New doc: seed the full schema (pricing included), with `id` stored
            // in the data to match what the PWA writes (js/db.js).
            await ref.set({ ...data, id });
            created++;
            console.log(`✅ Created ${id} (${data.name}) with full schema`);
        }
    }
    console.log(`\n🎉 Migration complete: ${created} created, ${patched} patched (existing pricing preserved).`);
} catch (e) {
    console.error('❌ Migration failed:', e.message || e);
    process.exit(1);
}

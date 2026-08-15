/**
 * KabunFarm: One-time data migration from Google Sheets to Firebase Firestore
 * ============================================================================
 * Run once AFTER you have created your Firebase project and Firestore database.
 *
 * Usage:
 *   cd c:\Users\User\kabunfarm\KabunFarm
 *   npm install firebase-admin   # only needed once
 *   node scripts/migrate-to-firestore.js
 *
 * Prerequisites:
 *   1. Firebase project created at console.firebase.google.com
 *   2. Firestore database created (test mode is fine)
 *   3. Service Account key downloaded:
 *      Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
 *      Save as scripts/serviceAccountKey.json
 *   4. Set FARM_PIN below to your existing PIN
 */

const admin = require("firebase-admin");
const https = require("https");

// --- CONFIG — fill these in ---
const SERVICE_ACCOUNT_PATH = "./scripts/serviceAccountKey.json";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQSzKWjoj3rD4_d045XN4csdYW5VXIHxV9qHviMBUc7iJvacGRHHuBLQPUTecMCBmswQ/exec";
const FARM_PIN = ""; // <- paste your PIN here, e.g. "1234"
// --------------------------------

if (!FARM_PIN) {
  console.error("Please set FARM_PIN in the script before running.");
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function fetchFromAppsScript(action) {
  return new Promise((resolve, reject) => {
    const url = `${APPS_SCRIPT_URL}?action=${action}&token=${encodeURIComponent(FARM_PIN)}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${action}: ${e.message}`)); }
      });
    }).on("error", reject);
  });
}

async function writeCollection(collectionName, docs) {
  if (!docs || !docs.length) {
    console.log(`  (no ${collectionName})`);
    return 0;
  }
  // Firestore batch writes are limited to 500 ops
  for (let i = 0; i < docs.length; i += 499) {
    const chunk = docs.slice(i, i + 499);
    const batch = db.batch();
    chunk.forEach((doc) => {
      const ref = db.collection(collectionName).doc(String(doc.id));
      batch.set(ref, { ...doc, status: doc.status || "active" });
    });
    await batch.commit();
  }
  return docs.length;
}

async function migrateBeds(bedsData) {
  const bedsToWrite = [];
  const batchesToWrite = [];

  for (const bed of bedsData) {
    const { crops = [], cropHistory = [], ...rest } = bed;
    bedsToWrite.push({ ...rest, status: rest.status || "active", plotId: rest.plotId || "" });

    for (const crop of crops) {
      batchesToWrite.push({
        id: crop.id || `batch_${bed.bedNumber}_${crop.cropName}`,
        bedNumber: String(bed.bedNumber),
        cropName: crop.cropName,
        plantingDate: crop.plantingDate || "",
        location: "commercial",
        status: "active",
      });
    }
    for (const hist of cropHistory) {
      batchesToWrite.push({
        id: `hist_${bed.bedNumber}_${hist.cropName}_${hist.harvestDate || ""}`,
        bedNumber: String(bed.bedNumber),
        cropName: hist.cropName,
        plantingDate: hist.plantingDate || "",
        harvestDate: hist.harvestDate || "",
        location: "commercial",
        status: "done",
      });
    }
  }

  const bedBatch = db.batch();
  bedsToWrite.forEach((b) => {
    bedBatch.set(db.collection("beds").doc(String(b.bedNumber)), b);
  });
  await bedBatch.commit();

  const batchCount = await writeCollection("batches", batchesToWrite);
  return { beds: bedsToWrite.length, batches: batchCount };
}

async function migrate() {
  console.log("KabunFarm: migrating Sheets -> Firestore\n");

  console.log("Fetching data from Apps Script...");
  const [bedsResp, logsResp, salesResp, formulasResp, tasksResp, plotsResp] = await Promise.all([
    fetchFromAppsScript("getBeds"),
    fetchFromAppsScript("getLogs"),
    fetchFromAppsScript("getSales"),
    fetchFromAppsScript("getFormulas"),
    fetchFromAppsScript("getTasks"),
    fetchFromAppsScript("getPlots"),
  ]);
  console.log("Data fetched. Writing to Firestore...\n");

  await db.collection("config").doc("auth").set({ pin: FARM_PIN });
  console.log("  config/auth written");

  const { beds, batches } = await migrateBeds(bedsResp.beds || []);
  console.log(`  ${beds} beds, ${batches} batches`);

  const logCount = await writeCollection("logs", (logsResp.logs || []).map((l) => ({
    ...l, id: l.id || `log_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  })));
  console.log(`  ${logCount} logs`);

  const saleCount = await writeCollection("sales", (salesResp.sales || []).map((s) => ({
    ...s, id: s.id || `sale_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  })));
  console.log(`  ${saleCount} sales`);

  const formulaCount = await writeCollection("formulas", (formulasResp.formulas || []).map((f) => ({
    ...f, id: f.id || `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  })));
  console.log(`  ${formulaCount} formulas`);

  const taskCount = await writeCollection("tasks", (tasksResp.tasks || []).map((t) => ({
    ...t, id: t.id || `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  })));
  console.log(`  ${taskCount} tasks`);

  const plotCount = await writeCollection("plots", (plotsResp.plots || []).map((p) => ({
    ...p, id: p.id || `plot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  })));
  console.log(`  ${plotCount} plots`);

  console.log("\nMigration complete! Open KabunFarm and verify your data.");
  console.log("Once confirmed, you can retire the Apps Script deployment.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});

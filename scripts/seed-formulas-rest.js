// Node.js script to push the 8 standard formulas directly to Cloud Firestore REST API
const https = require("https");

const PROJECT_ID = "kabunfarm";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/formulas`;

const DEFAULT_FORMULAS = [
  {
    id: "f_bio_botava",
    name: "Bio-Botanical Pest Shield",
    category: "Biological",
    description: "General preventive foliar spray for soft-bodied insects, whiteflies, and aphids. Apply early morning or late evening.",
    recipe: "Bio Botava:2.5:ml|Garlic Oil Extract:2:ml",
    status: "active"
  },
  {
    id: "f_pest_guard",
    name: "Pest Guard Contact Spray",
    category: "Botanical",
    description: "Broad-spectrum organic contact deterrent for caterpillars, thrips, and beetles.",
    recipe: "Pest Guard 2:3:ml|Garlic Oil Extract:1.5:ml",
    status: "active"
  },
  {
    id: "f_amino_18",
    name: "Foliar Growth & Stress Mix",
    category: "Nutrition",
    description: "Vegetative boost, root enhancement, and recovery after heavy rain, pest attacks, or transplanting.",
    recipe: "Amino 18:2:ml",
    status: "active"
  },
  {
    id: "f_wira_calbo",
    name: "Calcium-Boron Bloom & Fruit Set",
    category: "Nutrition",
    description: "Prevents blossom end rot and fruit cracking, strengthens cell walls, and improves flowering retention.",
    recipe: "Wira CalBo:2:ml",
    status: "active"
  },
  {
    id: "f_foliar_combo",
    name: "Combined Foliar Nutrition Boost",
    category: "Nutrition",
    description: "Balanced leaf spray for active vegetative growth and early flowering phases.",
    recipe: "Amino 18:1.5:ml|Wira CalBo:1.5:ml",
    status: "active"
  },
  {
    id: "f_antracol",
    name: "Antracol Protective Spray",
    category: "Fungicide",
    description: "Broad-spectrum protective contact fungicide against blight, anthracnose, and leaf spots. Spray before heavy rain cycles.",
    recipe: "Antracol:2:g",
    status: "active"
  },
  {
    id: "f_abamectin",
    name: "Abamectin Mite & Thrip Knockdown",
    category: "Insecticide",
    description: "Translaminar insecticide/miticide targeted specifically at severe leafminer, mite, and thrip outbreaks.",
    recipe: "Abamectin:1:ml",
    status: "active"
  },
  {
    id: "f_cypermethrin",
    name: "Cypermethrin Broad-Spectrum Knockdown",
    category: "Insecticide",
    description: "Synthetic pyrethroid contact spray for caterpillars, fruit borers, and persistent beetles. Use strictly as a corrective knockdown.",
    recipe: "Cypermethrin:1.5:ml",
    status: "active"
  }
];

function convertToFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = { doubleValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    }
  }
  return { fields };
}

async function writeFormula(formula) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/${formula.id}`;
    const payload = JSON.stringify(convertToFirestoreFields(formula));
    const req = https.request(
      url,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      res => {
        let body = "";
        res.on("data", chunk => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ [${res.statusCode}] Successfully pushed: ${formula.name} (${formula.id})`);
            resolve(JSON.parse(body));
          } else {
            console.error(`❌ [${res.statusCode}] Failed to push: ${formula.id} - ${body}`);
            reject(new Error(body));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`🚀 Pushing ${DEFAULT_FORMULAS.length} standard formulas to Firestore project: ${PROJECT_ID}...`);
  for (const formula of DEFAULT_FORMULAS) {
    await writeFormula(formula);
  }
  console.log("🎉 All 8 standard formulas are now live in Cloud Firestore!");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

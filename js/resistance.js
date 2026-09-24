// ============================================================================
// Kabun Farm Intelligence — Global Resistance Management (FRAC / IRAC)
// Module: js/resistance.js
// ============================================================================

/**
 * 12-Item Farm Inventory with FRAC (Fungicide) & IRAC (Insecticide) MoA Classifications
 *
 * DEPRECATED as a pricing/dosing source: the Firestore `inventory` collection is the
 * single authoritative source of truth for names, ids, prices, and dosing rates
 * (seeded from DEFAULT_INVENTORY in js/state.js). This map remains ONLY as a static
 * MoA/rotation lookup overlay (committee, moaGroup, targetPests, resistanceRisk,
 * maxConsecutive) which Firestore does not store. Dosages and ids below are aligned
 * with the inventory schema; `id` matches the Firestore document id.
 */
export const FARM_INVENTORY = {
    // --- Biological / Botanical Repellents & Multi-Site ---
    "kmb bio botava": {
        id: "bio_botava",
        name: "KMB Bio Botava",
        category: "Biological",
        committee: "IRAC",
        moaCode: "UNM",
        moaGroup: "Botanical Multi-Site Repellent / Barrier",
        targetPests: ["Whiteflies", "Aphids", "Thrips", "Soft-bodied insects"],
        standardDosage: "2.5 ml / L",
        phiDays: 0, // Pre-Harvest Interval (Safety Days)
        resistanceRisk: "Low",
        maxConsecutive: 99 // Safe for continuous rotation
    },
    "neem oil": {
        id: "neem_oil",
        name: "Neem Oil",
        category: "Botanical",
        committee: "IRAC",
        moaCode: "UNM",
        moaGroup: "Azadirachtin Botanical Disruptor & Anti-feedant",
        targetPests: ["Whiteflies", "Spider Mites", "Aphids", "Scale insects"],
        standardDosage: "5.0 ml / L (+ 2ml mild soap emulsifier)",
        phiDays: 0,
        resistanceRisk: "Low",
        maxConsecutive: 99
    },
    "kmb pest guard 2": {
        id: "pest_guard_2",
        name: "KMB Pest Guard 2 (Powder)",
        category: "Botanical",
        committee: "IRAC",
        moaCode: "UNM",
        moaGroup: "Botanical Contact Deterrent",
        targetPests: ["Caterpillars", "Flea Beetles", "Leaf Miners", "Thrips"],
        standardDosage: "3.0 g / L", // Powder — dosed in grams, NOT ml (fixed unit drift)
        phiDays: 0,
        resistanceRisk: "Low",
        maxConsecutive: 99
    },
    "garlic oil extract": {
        id: "garlic_oil",
        name: "Garlic Oil Extract",
        category: "Botanical",
        committee: "IRAC",
        moaCode: "UNM",
        moaGroup: "Allicin Olfactory & Contact Deterrent",
        targetPests: ["Aphids", "Beetles", "Mites", "Leafhoppers"],
        standardDosage: "1.5 - 2.0 ml / L",
        phiDays: 0,
        resistanceRisk: "Low",
        maxConsecutive: 99
    },
    "wood vinegar": {
        id: "wood_vinegar",
        name: "Wood Vinegar",
        category: "Botanical / Fungicide",
        committee: "FRAC",
        moaCode: "M",
        moaGroup: "Pyroligneous Acid Multi-Site Bio-Fungicide & Repellent",
        targetPests: ["Powdery Mildew", "Anthracnose prevention", "Foliar odor repellent"],
        standardDosage: "2.0 ml / L (1:500 ratio)",
        phiDays: 0,
        resistanceRisk: "Low",
        maxConsecutive: 99
    },
    "em4": {
        id: "em4",
        name: "EM4",
        category: "Biological Inoculant",
        committee: "BIO",
        moaCode: "BIO-01",
        moaGroup: "Lactic Acid Bacteria, Yeast & Photosynthetic Microbes",
        targetPests: ["Soil pathogen suppression", "Organic matter decomposition", "Leaf surface colonization"],
        standardDosage: "5.0 - 10.0 ml / L",
        phiDays: 0,
        resistanceRisk: "None",
        maxConsecutive: 99
    },

    // --- Nutrition & Biostimulants ---
    "wira calbo": {
        id: "wira_calbo",
        name: "Wira CalBo",
        category: "Nutrition",
        committee: "NUTRITION",
        moaCode: "NUT-CA-B",
        moaGroup: "Liquid Calcium + Boron Foliar",
        targetPests: ["Blossom End Rot prevention", "Fruit cracking prevention", "Cell wall fortification"],
        standardDosage: "2.0 ml / L",
        phiDays: 0,
        resistanceRisk: "None",
        maxConsecutive: 99
    },
    "kmb amino 18": {
        id: "amino_18",
        name: "KMB Amino 18",
        category: "Nutrition",
        committee: "NUTRITION",
        moaCode: "NUT-AMINO",
        moaGroup: "18 L-Amino Acids Vegetative Booster",
        targetPests: ["Vegetative growth", "Transplant shock recovery", "Post-pest stress recovery"],
        standardDosage: "2.0 ml / L",
        phiDays: 0,
        resistanceRisk: "None",
        maxConsecutive: 99
    },
    "seaweed extract": {
        id: "seaweed",
        name: "Seaweed Extract",
        category: "Biostimulant",
        committee: "BIOSTIMULANT",
        moaCode: "BIO-KELP",
        moaGroup: "Ascophyllum Nodosum Cytokinins & Potassium",
        targetPests: ["Root elongation", "Heat/drought stress tolerance", "Nutrient uptake"],
        standardDosage: "1.0 - 1.5 ml / L",
        phiDays: 0,
        resistanceRisk: "None",
        maxConsecutive: 99
    },

    // --- Protectant Multi-Site Fungicide ---
    "antracol": {
        id: "antracol",
        name: "Antracol 70 WP (Propineb)",
        category: "Fungicide",
        committee: "FRAC",
        moaCode: "M02",
        moaGroup: "Dithiocarbamate Multi-Site Surface Protectant (Zinc-enriched)",
        targetPests: ["Anthracnose", "Cercospora Leaf Spot", "Early Blight", "Downy Mildew"],
        standardDosage: "2.0 g / L",
        phiDays: 7, // 7-Day Pre-Harvest Waiting Period
        resistanceRisk: "Low",
        maxConsecutive: 3
    },

    // --- Targeted Synthetics (Strict IRAC Rotation Required) ---
    "abamectin": {
        id: "abamectin",
        name: "Abamectin 1.8% EC",
        category: "Insecticide / Acaricide",
        committee: "IRAC",
        moaCode: "6",
        moaGroup: "Glutamate-Gated Chloride Channel Allosteric Modulators (Avermectins)",
        targetPests: ["Spider Mites (Hama Merah)", "Thrips", "Leaf Miners (Ulat Pelombong)"],
        standardDosage: "0.5 - 1.0 ml / L",
        phiDays: 7, // 7-Day Pre-Harvest Waiting Period
        resistanceRisk: "High",
        maxConsecutive: 2 // Max 2 consecutive applications
    },
    "cypermethrin": {
        id: "cypermethrin",
        name: "Cypermethrin 5.5% EC",
        category: "Insecticide",
        committee: "IRAC",
        moaCode: "3A",
        moaGroup: "Sodium Channel Modulators (Synthetic Pyrethroids)",
        targetPests: ["Armyworms (Ulat Ratus)", "Diamondback Moth (Plutella)", "Fruit Borers", "Beetles"],
        standardDosage: "1.0 - 1.5 ml / L",
        phiDays: 7, // 7-Day Pre-Harvest Waiting Period
        resistanceRisk: "Medium-High",
        maxConsecutive: 2 // Max 2 consecutive applications
    }
};

/**
 * Checks if applying a new input causes resistance risk based on previous spray history
 * @param {string} lastMoa - The MoA code of the previous spray on this bed
 * @param {string} currentMoa - The MoA code of the planned spray
 * @param {number} consecutiveCount - How many times the current MoA has been used consecutively
 * @returns {object} { isWarning: boolean, message: string }
 */
export function checkMoaRotation(lastMoa, currentMoa, consecutiveCount = 1) {
    if (!lastMoa || !currentMoa) {
        return { isWarning: false, message: "Valid application" };
    }

    // Multi-site and organic categories have near-zero resistance buildup
    const isMultiSite = currentMoa === "UNM" || currentMoa === "M" || currentMoa.startsWith("NUT") || currentMoa.startsWith("BIO");
    if (isMultiSite) {
        return { isWarning: false, message: "Safe rotation: Multi-site / biological mode of action" };
    }

    // Check single-site synthetics (IRAC 6, IRAC 3A, etc.)
    if (lastMoa === currentMoa && consecutiveCount >= 2) {
        return {
            isWarning: true,
            message: `⚠️ Resistance Risk: MoA Group ${currentMoa} has been applied ${consecutiveCount} times consecutively. Rotate to a different Mode of Action group (e.g. UNM or Multi-Site) to prevent pest/pathogen immunity.`
        };
    }

    return { isWarning: false, message: "Good rotation: Alternate MoA group applied." };
}

/**
 * Returns inventory details for any recognized keyword or brand name
 */
export function matchInventoryItem(query) {
    if (!query) return null;
    const clean = String(query).toLowerCase().trim();
    for (const [key, item] of Object.entries(FARM_INVENTORY)) {
        if (clean.includes(key) || clean.includes(item.name.toLowerCase())) {
            return item;
        }
    }
    return null;
}

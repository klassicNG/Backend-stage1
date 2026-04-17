const express = require("express");
const { v7: uuidv7 } = require("uuid");
const db = require("../db");

const router = express.Router();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Call all three enrichment APIs in parallel.
 * Returns { genderData, agifyData, nationalizeData }
 * Throws a structured 502 error if any API returns unusable data.
 */
async function fetchEnrichmentData(name) {
  const encodedName = encodeURIComponent(name);

  let genderRes, agifyRes, nationalizeRes;

  try {
    [genderRes, agifyRes, nationalizeRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${encodedName}`),
      fetch(`https://api.agify.io?name=${encodedName}`),
      fetch(`https://api.nationalize.io?name=${encodedName}`),
    ]);
  } catch {
    const err = new Error("Failed to reach one or more external APIs");
    err.statusCode = 502;
    err.apiName = "External API";
    throw err;
  }

  let genderData, agifyData, nationalizeData;

  try {
    [genderData, agifyData, nationalizeData] = await Promise.all([
      genderRes.json(),
      agifyRes.json(),
      nationalizeRes.json(),
    ]);
  } catch {
    const err = new Error("Failed to parse response from external API");
    err.statusCode = 502;
    err.apiName = "External API";
    throw err;
  }

  // Validate Genderize
  if (!genderData.gender || genderData.count === 0) {
    const err = new Error("Genderize returned an invalid response");
    err.statusCode = 502;
    err.apiName = "Genderize";
    throw err;
  }

  // Validate Agify
  if (agifyData.age === null || agifyData.age === undefined) {
    const err = new Error("Agify returned an invalid response");
    err.statusCode = 502;
    err.apiName = "Agify";
    throw err;
  }

  // Validate Nationalize
  if (!nationalizeData.country || nationalizeData.country.length === 0) {
    const err = new Error("Nationalize returned an invalid response");
    err.statusCode = 502;
    err.apiName = "Nationalize";
    throw err;
  }

  return { genderData, agifyData, nationalizeData };
}

/**
 * Derive age group from a numeric age.
 */
function classifyAge(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

/**
 * Build the full profile object from raw DB row.
 */
function formatProfile(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: row.gender_probability,
    sample_size: row.sample_size,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

/**
 * Build the summary profile object used in GET /api/profiles list.
 */
function formatProfileSummary(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
  };
}

// ─────────────────────────────────────────────
// POST /api/profiles
// ─────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name } = req.body;

  // 400 – missing or empty name
  if (name === undefined || name === null || name === "") {
    return res.status(400).json({ status: "error", message: "name is required" });
  }

  // 422 – wrong type
  if (typeof name !== "string") {
    return res
      .status(422)
      .json({ status: "error", message: "name must be a string" });
  }

  const trimmedName = name.trim();
  if (trimmedName === "") {
    return res.status(400).json({ status: "error", message: "name must not be blank" });
  }

  // Idempotency – return existing profile if name already stored
  const existing = db
    .prepare("SELECT * FROM profiles WHERE LOWER(name) = LOWER(?)")
    .get(trimmedName);

  if (existing) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: formatProfile(existing),
    });
  }

  // Fetch enrichment data from the three APIs
  let genderData, agifyData, nationalizeData;
  try {
    ({ genderData, agifyData, nationalizeData } = await fetchEnrichmentData(trimmedName));
  } catch (err) {
    return res.status(err.statusCode || 502).json({
      status: "error",
      message: err.message,
    });
  }

  // Pick top nationality by probability
  const topCountry = nationalizeData.country.reduce((best, c) =>
    c.probability > best.probability ? c : best
  );

  const age = agifyData.age;
  const profile = {
    id: uuidv7(),
    name: trimmedName,
    gender: genderData.gender,
    gender_probability: genderData.probability,
    sample_size: genderData.count,
    age,
    age_group: classifyAge(age),
    country_id: topCountry.country_id,
    country_probability: topCountry.probability,
    created_at: new Date().toISOString(),
  };

  try {
    db.prepare(`
      INSERT INTO profiles
        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
      VALUES
        (@id, @name, @gender, @gender_probability, @sample_size, @age, @age_group, @country_id, @country_probability, @created_at)
    `).run(profile);
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to save profile" });
  }

  return res.status(201).json({ status: "success", data: profile });
});

// ─────────────────────────────────────────────
// GET /api/profiles
// ─────────────────────────────────────────────
router.get("/", (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let query = "SELECT * FROM profiles WHERE 1=1";
  const params = [];

  if (gender) {
    query += " AND LOWER(gender) = LOWER(?)";
    params.push(gender);
  }
  if (country_id) {
    query += " AND LOWER(country_id) = LOWER(?)";
    params.push(country_id);
  }
  if (age_group) {
    query += " AND LOWER(age_group) = LOWER(?)";
    params.push(age_group);
  }

  const rows = db.prepare(query).all(...params);

  return res.status(200).json({
    status: "success",
    count: rows.length,
    data: rows.map(formatProfileSummary),
  });
});

// ─────────────────────────────────────────────
// GET /api/profiles/:id
// ─────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);

  if (!row) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }

  return res.status(200).json({ status: "success", data: formatProfile(row) });
});

// ─────────────────────────────────────────────
// DELETE /api/profiles/:id
// ─────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM profiles WHERE id = ?")
    .run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }

  return res.status(204).send();
});

module.exports = router;

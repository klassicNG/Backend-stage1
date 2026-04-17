# HNG14 Stage 1 – Profiles Enrichment API

A RESTful API that accepts a name, enriches it using three public APIs (Genderize, Agify, Nationalize), persists the result in SQLite, and exposes CRUD endpoints.

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express
- **Database**: SQLite (via `better-sqlite3`)
- **ID format**: UUID v7 (time-ordered)

---

## Local Setup

```bash
git clone https://github.com/<your-username>/hng14-stage1.git
cd hng14-stage1
npm install
npm start
```

The server starts on `http://localhost:3000` by default.  
Set the `PORT` environment variable to override.

Set `DB_PATH` to change where the SQLite file is written (useful for platforms with ephemeral filesystems).

---

## Endpoints

### `POST /api/profiles`
Create a profile enriched from external APIs.

**Request body:**
```json
{ "name": "ella" }
```

**201 Created:**
```json
{
  "status": "success",
  "data": {
    "id": "019...",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 12345,
    "age": 46,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00.000Z"
  }
}
```

**200 (duplicate name):**
```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { "...existing profile..." }
}
```

---

### `GET /api/profiles`
Returns all profiles. Supports optional query filters (case-insensitive):

| Param | Example |
|---|---|
| `gender` | `?gender=female` |
| `country_id` | `?country_id=NG` |
| `age_group` | `?age_group=adult` |

**200 OK:**
```json
{
  "status": "success",
  "count": 1,
  "data": [
    {
      "id": "019...",
      "name": "ella",
      "gender": "female",
      "age": 46,
      "age_group": "adult",
      "country_id": "NG"
    }
  ]
}
```

---

### `GET /api/profiles/:id`
Returns full profile by UUID.

**200 OK** – returns full profile object.  
**404** – profile not found.

---

### `DELETE /api/profiles/:id`
Deletes a profile by UUID.

**204 No Content** – deleted.  
**404** – profile not found.

---

## Age Classification

| Range | Group |
|---|---|
| 0–12 | child |
| 13–19 | teenager |
| 20–59 | adult |
| 60+ | senior |

---

## Error Responses

All errors follow:
```json
{ "status": "error", "message": "..." }
```

| Code | Meaning |
|---|---|
| 400 | Missing or empty `name` |
| 422 | `name` is not a string |
| 404 | Profile not found |
| 502 | External API returned invalid/null data |
| 500 | Internal server error |

---

## Deployment

Tested on **Railway** and **Heroku**. Render is excluded per task requirements.

Set these env vars on your platform:
- `PORT` – HTTP port (auto-set by most platforms)
- `DB_PATH` – Optional path for SQLite file (default: `./profiles.db`)

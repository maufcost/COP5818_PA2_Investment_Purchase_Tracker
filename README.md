# Investment Purchase Tracker PA2

Student name: Mauricio Figueiredo Mattos Costa
ID: 4855025
Email: ma038677@ucf.edu

COP5818 PA2. My PA1 Investment Purchase Tracker extended with an Express + SQLite backend, categories, edit/delete, and private per-user purchase histories behind session login. Local classroom application; all accounts and purchases are fictional.

**Node version tested:** v24.22.2 (npm 11.19.1) on macOS arm64. `better-sqlite3@13` requires Node ≥ 22 and crashed (segmentation fault) on Node 23.1.0, so use an even-numbered LTS release (22 or 24). `.nvmrc` pins 24.

## Setup

1. Install Node.js 22 or 24 LTS (`nvm use` reads `.nvmrc`).
2. In this folder run `npm ci` (uses the committed `package-lock.json`). The original install was `npm install express better-sqlite3 express-session argon2 dotenv`.
3. Copy `.env.example` to `.env` and replace `SESSION_SECRET` with a new random value of at least 32 characters, for example the output of
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
4. Run `npm start`, then visit **http://localhost:3000**. Opening `index.html` directly will not work.
5. `npm test` runs the validation unit tests. The curl requests and responses used in `test-report.md` are in `evidence/curl-checks.txt`.

My completed PA1 is included in `PA1/` for reference. The PA2 frontend in `public/` is built from it.

At startup `server.js` runs `schema.sql`, so a fresh install creates an empty `tracker.db` with the three seeded categories (Fund, Stock, Other). Do not submit `.env`, `tracker.db*`, `node_modules/`, or `.git/`.

## Files

| File | Purpose |
|---|---|
| `server.js` | Express app, auth routes, category and purchase REST API (S1–S11) |
| `validation.js` | `validatePurchase(body, validCategoryIds)` (V1) |
| `security.js` | Supplied session cookie and CSRF/Origin middleware, `requireAuth` |
| `schema.sql` | Supplied SQLite schema and category seed |
| `public/` | My completed PA1 markup and styles (C1–C7), extended with account, category and edit controls (F1–F7) |
| `validation.test.js` | `node:test` unit tests for validation, including boundaries |
| `PA1/` | My completed PA1 (reference) |
| `test-report.md`, `evidence/` | Test results and screenshots |

## Part 1: Express and the HTTP flow

### The path of one "Add purchase" action

1. **Browser event.** The user fills in the form and clicks *Add purchase*. The `submit` listener in `public/script.js` calls `event.preventDefault()`, so the page does not reload. It then runs the PA1 checks: a non-blank name, quantity 1–10,000 whole units, and a price of $0.01–$1,000,000 with no more than two decimals (`validity.stepMismatch`). It converts dollars to cents with `Math.round(dollars * 100)` and disables the button.
2. **JSON request.** `api('/api/purchases', {method:'POST', body:{name, quantity, unitPriceCents, categoryId}})` calls `JSON.stringify` on the body and sets `Content-Type: application/json` and the `X-CSRF-Token` header. It sends the request with `fetch` and `credentials:'same-origin'`, so the browser attaches the `sid` session cookie.
3. **Middleware**, in order:
   - `express.json({limit:'16kb'})` parses the body. Malformed JSON goes to the error handler as a 400.
   - `express-session` loads the session that the cookie identifies.
   - The CSRF middleware checks that `Origin` (when present) matches `APP_ORIGIN` and that the header token equals the token stored in the session. If not, it returns 403.
   - `requireAuth` returns 401 when `req.session.userId` is missing.
4. **Route.** The `POST /api/purchases` handler reads the valid category IDs from the database and calls `validatePurchase(req.body, ids)`. An invalid body gets a 400 `{"error": ...}`. The handler never reads `id`, `ownerId` or `costCents` from the body.
5. **SQL statement.** A prepared statement runs `INSERT INTO purchases (owner_id, name, quantity, unit_price_cents, category_id) VALUES (?, ?, ?, ?, ?)`. The owner is `req.session.userId`. Every value is bound to a `?` placeholder, never concatenated into the SQL. The route then runs the joined `SELECT ... JOIN categories ... WHERE p.id = ? AND p.owner_id = ?` with `result.lastInsertRowid`. SQLite computes `quantity * unit_price_cents AS costCents`.
6. **JSON response.** `201 Created` with the complete record, e.g. `{"id":1,"name":"Example Index Fund","quantity":5,"unitPriceCents":2000,"categoryId":1,"categoryName":"Fund","costCents":10000}`.
7. **UI refresh.** `api()` checks `response.ok` and parses the JSON. The handler resets the form, calls `loadPurchases()` (`GET /api/purchases`) to fetch the authoritative list, and rebuilds the history and totals with `textContent`. It then shows "Purchase added." and the `finally` block re-enables the button. On failure the inputs stay in the form and a message explains the problem.

### Node.js, npm, and package-lock.json

- **Node.js** is the JavaScript runtime that runs `server.js` outside the browser. It provides the HTTP server, file system access (to read `schema.sql`), and the event loop that Express runs on.
- **npm** is the package manager. It installs Express, better-sqlite3, express-session, argon2 and dotenv into `node_modules/`, and it runs the scripts in `package.json` (`npm start`, `npm test`).
- **package-lock.json** records the exact version and integrity hash of every installed package, including transitive ones. `npm ci` on another machine then installs the same dependency tree I tested, instead of whatever newest versions the `^` ranges in `package.json` allow.

### async/await

`argon2.hash`, `argon2.verify`, `session.regenerate`/`save` and the browser's `fetch` all return promises or take callbacks, because they finish later. `await` pauses only the async function it appears in until that promise settles. While that function waits, Node's event loop keeps serving other requests; Argon2 hashing, for example, runs on a worker thread. So the code reads top to bottom like synchronous code, but the server as a whole is not blocked. The better-sqlite3 calls (`get`/`all`/`run`) are synchronous by design. They are fast local operations on a small database.

## Part 2: Data model

### Keys and constraints in `schema.sql`

- **Primary key.** `purchases.id INTEGER PRIMARY KEY` uniquely identifies each purchase, and SQLite assigns it automatically. Because the key, not the name, identifies a record, two purchases called "Example Company" are separate rows. The API's `:id` route parameter refers to this key.
- **Foreign key 1.** `purchases.owner_id REFERENCES users(id)`: every purchase belongs to an existing user. This column is what makes a history private; every query filters on `owner_id = req.session.userId`.
- **Foreign key 2.** `purchases.category_id REFERENCES categories(id)`: every purchase points to an existing category. Category names live in one place and are joined in with `JOIN categories c ON c.id = p.category_id` to produce `categoryName`. `PRAGMA foreign_keys = ON` makes SQLite enforce both references.
- **CHECK constraint.** `quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 10000)`. Even if a bug skipped `validatePurchase`, the database would refuse a fractional, text or out-of-range quantity. The price and name columns have similar CHECKs, and `users.email` is `UNIQUE`, which is the final guard against duplicate registrations.

**Why relational storage fits.** These records have a fixed, uniform shape: each purchase has the same five typed fields. They also have clear relationships (user → purchases ← category) that must stay consistent. SQL expresses the owner filter, the category join, ordering by ID, and the cost calculation in one parameterized query. The constraints keep invalid money and quantity values out no matter which code path writes them.

**SQL vs. document-style NoSQL.** In a document database each user might be one document with an embedded `purchases` array, and each purchase would copy its category name, e.g. `{email, passwordHash, purchases:[{name, quantity, unitPriceCents, category:"Fund"}]}`. Reading one user's whole history is then a single lookup and needs no join. That suits flexible or nested data that is always read together. The trade-off is that integrity rules become application code: nothing at the database level stops a fractional quantity, an unknown category, or a stale copied category name. Updating or deleting one purchase also means modifying an array inside a larger document. For small, structured, related records that need enforced constraints, relational tables are the simpler and safer fit.

## Part 3: API summary

All routes return JSON. Errors are always `{"error":"message"}` and never include a stack trace, SQL text or a password hash.

| Route | Success | Errors |
|---|---|---|
| `GET /api/health` | 200 `{"ok":true}` | |
| `GET /api/csrf` | 200 `{"csrfToken":...}` | |
| `POST /api/register` | 201 `{id,email}` (does not log in) | 400 invalid fields, 403 CSRF, 409 duplicate email |
| `POST /api/login` | 200 `{id,email}` | 400 missing fields, 401 generic, 403 CSRF |
| `GET /api/me` | 200 `{id,email}` | 401 |
| `POST /api/logout` | 200 `{"ok":true}` | 401, 403 CSRF |
| `GET /api/categories` | 200 `[{id,name}]` | 401 |
| `GET /api/purchases` | 200 owned records, ascending ID | 401 |
| `POST /api/purchases` | 201 full record | 400, 401, 403 |
| `PUT /api/purchases/:id` | 200 full updated record | 400 bad ID/fields, 401, 403, 404 not owned or missing |
| `DELETE /api/purchases/:id` | 200 `{"ok":true}` | 400 bad ID, 401, 403, 404 not owned or missing |
| Unknown `/api/...` | | 404 JSON |
| Malformed JSON | | 400 `{"error":"Invalid JSON"}` |
| Unexpected failure | | 500 `{"error":"Internal server error"}` |

`PUT` first checks the route ID, then looks the record up with `WHERE id = ? AND owner_id = ?` (404 if that finds nothing), then validates all four fields. The `UPDATE` also carries both predicates. `DELETE` uses `WHERE id = ? AND owner_id = ?` and returns 404 when `changes === 0`. Any rejected request returns before a write statement runs, so error cases leave stored data unchanged. Another user's record gets the same 404 as a missing one, so the API does not reveal which IDs exist.

## Part 5: Authentication and sessions

- **Registration.** The email is trimmed, lowercased, 3–254 characters, and must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`. The password must be a string of 8–128 characters and is not trimmed. Only `argon2.hash(password, {type: argon2id})` is stored. A duplicate email returns 409, from either the pre-check or the `UNIQUE` constraint if two requests race.
- **Login.** The route looks the user up by normalized email and runs `argon2.verify`. When the email is unknown it verifies against a dummy hash, so both failures take similar time and return the same `401 Invalid email or password`. On success it calls `req.session.regenerate()` (a new session ID, which blocks session fixation, with no old CSRF token carried over), sets `userId`, waits for `req.session.save()`, and returns `{id,email}`. The client then fetches a new CSRF token.
- **Logout.** `req.session.destroy()`, then `res.clearCookie('sid', {path:'/'})`. The browser clears the purchases, totals, categories and form from the page.
- **Cookie settings** (supplied): `httpOnly`, `SameSite=Lax`, `path=/`, 1-hour expiry. `secure:false` is only for local HTTP; an HTTPS deployment must set `secure:true`. The default MemoryStore loses all sessions on restart and is acceptable only for this local exercise.
- **Secrets.** `SESSION_SECRET` comes from `.env` (git-ignored). `security.js` refuses to start with the placeholder or a secret shorter than 32 characters.

## Part 6: Explanations

### Authentication vs. authorization (two-user test)

**Authentication** answers "who are you?". User A proves their identity by logging in with email and password: the server verifies the Argon2id hash and records `userId` in a regenerated session. Requests without a valid session get 401.

**Authorization** answers "what may this authenticated user do?". In the two-user test, B is fully authenticated, with a valid session and a valid CSRF token. When B sends `PUT` or `DELETE` to `/api/purchases/<A's id>`, the server still returns 404 and A's record does not change, because every query includes `owner_id = req.session.userId`. When B sends A's `id` and `ownerId` in a request body, the server ignores them: the owner always comes from B's session, so the result is a new record that B owns. Being logged in (authentication) is never enough on its own. Each record operation is also checked against ownership (authorization).

### Why client-side validation alone is insufficient

The browser checks in `script.js` give fast, friendly feedback, but the user controls the client. Anyone can turn off JavaScript, edit the page in DevTools, or skip the page entirely and send requests with curl or Postman. My API checks did exactly that, sending `quantity: 1.5`, `"five"`, `true`, `unitPriceCents: 100000001`, an unknown category, and `costCents`/`ownerId` fields. Only `validatePurchase` on the server, the owner filter, and the schema's CHECK and FOREIGN KEY constraints actually protect the stored data. For the same reason, the server computes `costCents` itself instead of trusting a value the browser calculated.

## Known limitations

- Sessions are stored in memory: restarting the server logs everyone out, although purchases persist in SQLite. Users must log in again after a restart, and the UI handles this by returning to the signed-out view.
- **Uncertain result after a connection loss.** If the connection drops after the server has committed an insert but before the response arrives, the browser cannot tell whether the save happened. The UI keeps the inputs and tells the user to reload and check the history before retrying. The app does not promise exactly-once behavior, so a blind retry could create a duplicate.
- No rate limiting on login, no password reset, no account deletion, and no HTTPS (`secure:false`). All of these are outside this local exercise's scope.
- Money is stored in integer cents. Totals are summed in the browser from server-computed `costCents`, which is exact for this app's range (at most 10,000 × 100,000,000 cents per record).

## AI-use disclosure

This assignment was completed with the assistance of an AI coding tool.

> Claude Code (Claude Opus 5.5 model). Anthropic. Accessed 2026-11-07.

**How it was used.** Claude Code helped implement the numbered TODOs in `server.js`, `validation.js` and `public/script.js`, add the extra validation tests, and draft the explanations in this README and `test-report.md`. It also ran the browser and curl checks recorded as evidence. It diagnosed one environment issue: `better-sqlite3` crashed on Node 23, which led to using Node 24 LTS.

**My own work.** The interface in `public/` is built from my completed PA1 (markup and styles, included in `PA1/`). I directed the work and made the design and submission decisions, reviewed and ran the application myself, asked for explanations of the authentication, session and cookie flow, and edited the code comments and documentation. `security.js`, `schema.sql` and the TODO structure were supplied by the course starter.

## Git history

Repository: <!-- add the public repository URL here --> REPOSITORY_URL

require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const fs = require('node:fs');
const path = require('node:path');
const {configureSecurity,requireAuth} = require('./security');
const {validatePurchase} = require('./validation');
const app=express();
const db=new Database(path.join(__dirname,'tracker.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
app.use(express.json({limit:'16kb'}));
configureSecurity(app);
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

// As requested, I'm never concatenating user input into SQL queries.
const sql = {
  userByEmail: db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?'),
  userById: db.prepare('SELECT id, email FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)'),
  categories: db.prepare('SELECT id, name FROM categories ORDER BY id'),
  categoryIds: db.prepare('SELECT id FROM categories ORDER BY id').pluck(),
  insertPurchase: db.prepare(`INSERT INTO purchases (owner_id, name, quantity, unit_price_cents, category_id)
    VALUES (?, ?, ?, ?, ?)`),
  updatePurchase: db.prepare(`UPDATE purchases SET name = ?, quantity = ?, unit_price_cents = ?, category_id = ?
    WHERE id = ? AND owner_id = ?`),
  deletePurchase: db.prepare('DELETE FROM purchases WHERE id = ? AND owner_id = ?'),
};

// S1: Used to perform health check.
app.get('/api/health',(req,res)=>res.json({ok:true}));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function readCredentials(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {error:'Request body must be a JSON object with email and password'};
  }
  const {email, password} = body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return {error:'Email and password are required'};
  }
  return {email: email.trim().toLowerCase(), password};
}

// S2: Register. Only the email is normalized; the password is used exactly as typed.
app.post('/api/register',asyncRoute(async(req,res)=> {
  const credentials = readCredentials(req.body);
  if (credentials.error) return res.status(400).json({error:credentials.error});
  const { email, password } = credentials;
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({error:'Enter a valid email address such as user@example.com'});
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({error:'Password must be 8-128 characters'});
  }
  if (sql.userByEmail.get(email)) {
    return res.status(409).json({error:'An account with that email already exists'});
  }
  const passwordHash = await argon2.hash(password,{type:argon2.argon2id});
  try {
    const result = sql.insertUser.run(email, passwordHash);
    res.status(201).json({id:Number(result.lastInsertRowid), email});
  } catch (err) {
    // Two simultaneous registrations can both pass the SELECT above; the UNIQUE
    // constraint is the final authority.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({error:'An account with that email already exists'});
    }
    throw err;
  }
}));

// A real Argon2id hash used when the email is unknown, so both failure paths do
// similar work and respond with the same generic message.
let dummyHashPromise;
const dummyHash = () => dummyHashPromise ??= argon2.hash('not-a-real-account-password',{type:argon2.argon2id});
const promisify = (session, method) => new Promise((resolve,reject)=>session[method](e=>e?reject(e):resolve()));

// S3: Login route.
app.post('/api/login',asyncRoute(async(req,res)=> {
  const credentials = readCredentials(req.body);
  if (credentials.error) return res.status(400).json({error:credentials.error});
  const {email, password} = credentials;
  const user = sql.userByEmail.get(email);
  const passwordMatches = await argon2.verify(user ? user.password_hash : await dummyHash(), password);
  if (!user || !passwordMatches) {
    return res.status(401).json({error:'Invalid email or password'});
  }
  // New session ID prevents session fixation; the new session has no CSRF token,
  // so the client must fetch a fresh one from /api/csrf.
  await promisify(req.session,'regenerate');
  req.session.userId = user.id;
  await promisify(req.session,'save');
  res.json({id:user.id, email:user.email});
}));

app.get('/api/me',requireAuth,(req,res)=> {
  // S4: Return only the session user's {id,email}.
  const user = sql.userById.get(req.session.userId);
  if (!user) return res.status(401).json({error:'Login required'});
  res.json(user);
});

// Logout route.
app.post('/api/logout',requireAuth,(req,res,next)=> {
  // S5: Destroy the server-side session and clear the browser cookie.
  req.session.destroy(err=> {
    if (err) return next(err);
    res.clearCookie('sid',{path:'/',httpOnly:true,sameSite:'lax',secure:false});
    res.json({ok:true});
  });
});

app.get('/api/categories',requireAuth,(req,res)=> {
  // S6: All categories in ID order.
  res.json(sql.categories.all());
});

// S7: Reusable joined SELECT. Aliases match the API field names, and cost is
// calculated by SQLite from stored integer cents (convention) rather than trusted from the client.
const PURCHASE_SELECT = `SELECT p.id, p.name, p.quantity,
    p.unit_price_cents AS unitPriceCents,
    p.category_id AS categoryId,
    c.name AS categoryName,
    p.quantity * p.unit_price_cents AS costCents
  FROM purchases AS p
  JOIN categories AS c ON c.id = p.category_id`;
sql.ownedPurchases = db.prepare(`${PURCHASE_SELECT} WHERE p.owner_id = ? ORDER BY p.id ASC`);
sql.ownedPurchase = db.prepare(`${PURCHASE_SELECT} WHERE p.id = ? AND p.owner_id = ?`);

// Accept only a positive integer route ID such as "12" (not "0", "-1", "1.5", "1e3", "abc").
function parseId(text) {
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

app.get('/api/purchases',requireAuth,(req,res)=> {
  // S8: Only the session user's records, ascending ID.
  res.json(sql.ownedPurchases.all(req.session.userId));
});

app.post('/api/purchases',requireAuth,(req,res)=> {
  // S9: Validate, then insert with the owner taken from the session.
  const {value,error} = validatePurchase(req.body, sql.categoryIds.all());
  if (error) return res.status(400).json({error});
  const result = sql.insertPurchase.run(req.session.userId, value.name, value.quantity, value.unitPriceCents, value.categoryId);
  res.status(201).json(sql.ownedPurchase.get(result.lastInsertRowid, req.session.userId));
});

app.put('/api/purchases/:id',requireAuth,(req,res)=> {
  // S10: Ownership is checked before validation results are applied; ID and owner never change.
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({error:'Purchase ID must be a positive integer'});
  if (!sql.ownedPurchase.get(id, req.session.userId)) {
    return res.status(404).json({error:'Purchase not found'});
  }
  const {value,error} = validatePurchase(req.body, sql.categoryIds.all());
  if (error) return res.status(400).json({error});
  const result = sql.updatePurchase.run(value.name, value.quantity, value.unitPriceCents, value.categoryId, id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({error:'Purchase not found'});
  res.json(sql.ownedPurchase.get(id, req.session.userId));
});

app.delete('/api/purchases/:id',requireAuth,(req,res)=> {
  // S11: The owner predicate is part of the DELETE itself.
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({error:'Purchase ID must be a positive integer'});
  const result = sql.deletePurchase.run(id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({error:'Purchase not found'});
  res.json({ok:true});
});

app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=> {
  if (err.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON'});
  if (err.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
  console.error('Request failed');
  res.status(500).json({error:'Internal server error'});
});
app.listen(Number(process.env.PORT)||3000,()=>console.log('Open http://localhost:3000'));

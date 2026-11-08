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
const todo = res => res.status(501).json({error:'Complete this numbered step'});

// S1: Implement GET /api/health -> {ok:true}.
app.get('/api/health',(req,res)=>todo(res));

// S2: Validate credentials. Normalize only email. Query duplicate email safely.
// await argon2.hash(password,{type:argon2.argon2id}); insert email/hash; return 201 {id,email}.
// Catch uniqueness conflicts as 409, without leaking SQL or hashes.
app.post('/api/register',asyncRoute(async(req,res)=>todo(res)));

// S3: SELECT by normalized email; await argon2.verify(storedHash,password).
// Invalid credentials -> generic 401. Regenerate, set userId, save, then respond.
// Promise wrappers: await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
// Use the same pattern for session.save. Do not keep the old CSRF token after regeneration.
app.post('/api/login',asyncRoute(async(req,res)=>todo(res)));
app.get('/api/me',requireAuth,(req,res)=> {
  // S4: Return only the session user's {id,email}.
  todo(res);
});
app.post('/api/logout',requireAuth,(req,res,next)=> {
  // S5: destroy session; forward an error if needed; clear sid with path '/'; return {ok:true}.
  todo(res);
});
app.get('/api/categories',requireAuth,(req,res)=> {
  // S6: SELECT id,name FROM categories ORDER BY id, using all().
  todo(res);
});

// S7: Write a reusable SELECT with JOIN purchases to categories, aliases matching
// the API fields, and calculated quantity*unit_price_cents AS costCents.
// Owner restrictions belong in every record operation, including PUT and DELETE.
app.get('/api/purchases',requireAuth,(req,res)=> {
  // S8: return all owned records in ascending ID order.
  todo(res);
});
app.post('/api/purchases',requireAuth,(req,res)=> {
  // S9: read category IDs, validatePurchase, INSERT with req.session.userId.
  // Use result.lastInsertRowid to SELECT the created joined record; return 201.
  todo(res);
});
app.put('/api/purchases/:id',requireAuth,(req,res)=> {
  // S10: validate positive integer path ID; lookup using ID AND owner_id.
  // 404 if not owned/found. Validate all editable fields, then UPDATE with both predicates.
  // SELECT and return the updated joined record.
  todo(res);
});
app.delete('/api/purchases/:id',requireAuth,(req,res)=> {
  // S11: validate path ID; DELETE WHERE id=? AND owner_id=?.
  // Check result.changes: 0 -> 404; otherwise {ok:true}.
  todo(res);
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

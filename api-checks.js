// API client checks for test-report.md. Start the server first (npm start), then:
//   npm run check:api
// Uses only fictional @example.test accounts. Prints no cookies, tokens or hashes.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const RUN = Date.now().toString(36);
const PASSWORD_A = 'fictional-pass-A1';
const PASSWORD_B = 'fictional-pass-B2';

class Client {
  constructor(label){ this.label=label; this.cookie=''; this.token=null; }
  async request(method, path, body, {csrf=true, token, origin=ORIGIN, rawBody, contentType='application/json'}={}) {
    const headers = {};
    const mutating = !['GET','HEAD'].includes(method);
    if (mutating && csrf) {
      if (!this.token) await this.refreshCsrf(); // also establishes the session cookie
      headers['X-CSRF-Token'] = token ?? this.token;
    }
    if (this.cookie) headers.Cookie = this.cookie;
    if (mutating && origin) headers.Origin = origin;
    let payload;
    if (rawBody !== undefined) { payload = rawBody; headers['Content-Type'] = contentType; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = contentType; }
    const res = await fetch(BASE + path, {method, headers, body: payload});
    const setCookie = res.headers.getSetCookie().find(c => c.startsWith('sid='));
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = undefined; }
    return {status: res.status, json, isJson: (res.headers.get('content-type')||'').includes('application/json')};
  }
  async refreshCsrf() {
    const r = await this.request('GET','/api/csrf');
    this.token = r.json.csrfToken;
  }
  async login(email, password) {
    const r = await this.request('POST','/api/login',{email,password});
    if (r.status === 200) await this.refreshCsrf(); // session was regenerated
    return r;
  }
  list() { return this.request('GET','/api/purchases'); }
}

const results = [];
function check(group, description, ok, observed) {
  results.push({group, description, ok: Boolean(ok), observed});
  console.log(`${ok ? 'PASS      ' : 'NEEDS WORK'} [${group}] ${description} -> ${observed}`);
}
const total = rows => rows.reduce((sum, p) => sum + p.costCents, 0);
const dollars = cents => '$' + (cents/100).toFixed(2);
const brief = r => `${r.status} ${JSON.stringify(r.json)}`;

async function main() {
  const emailA = `user.a.${RUN}@example.test`;
  const emailB = `user.b.${RUN}@example.test`;
  const A = new Client('A'), B = new Client('B'), anon = new Client('anon');

  // 1. Registration and login
  let r = await A.request('POST','/api/register',{email:`  USER.A.${RUN}@Example.TEST `,password:PASSWORD_A});
  check(1,'Register A (email trimmed + lowercased)', r.status===201 && r.json.email===emailA && !('password_hash' in r.json), brief(r));
  r = await B.request('POST','/api/register',{email:emailB,password:PASSWORD_B});
  check(1,'Register B', r.status===201 && r.json.email===emailB, brief(r));
  r = await A.request('GET','/api/me');
  check(1,'Registration does not log in', r.status===401, brief(r));
  r = await anon.request('POST','/api/register',{email:emailA,password:'another-password'});
  check(1,'Duplicate email rejected', r.status===409, brief(r));
  r = await anon.request('POST','/api/register',{email:`short.${RUN}@example.test`,password:'short'});
  check(1,'Too-short password rejected', r.status===400, brief(r));
  r = await anon.request('POST','/api/register',{email:`long.${RUN}@example.test`,password:'x'.repeat(129)});
  check(1,'129-character password rejected', r.status===400, brief(r));
  r = await anon.request('POST','/api/register',{email:'not-an-email',password:'long-enough-pass'});
  check(1,'Invalid email rejected', r.status===400, brief(r));
  const wrongPw = await anon.request('POST','/api/login',{email:emailA,password:'wrong-password'});
  const noUser = await anon.request('POST','/api/login',{email:`nobody.${RUN}@example.test`,password:'wrong-password'});
  check(1,'Wrong password and unknown email give identical generic 401',
    wrongPw.status===401 && noUser.status===401 && wrongPw.json.error===noUser.json.error, `${brief(wrongPw)} / ${brief(noUser)}`);
  r = await A.login(emailA, PASSWORD_A);
  check(1,'Login A returns only {id,email}', r.status===200 && Object.keys(r.json).sort().join()==='email,id', brief(r));
  const idA = r.json.id;
  r = await A.request('GET','/api/me');
  check(1,'GET /api/me after login', r.status===200 && r.json.email===emailA, brief(r));

  // 2. Logged-out access and CSRF
  r = await anon.list();
  check(2,'Logged out GET /api/purchases', r.status===401, brief(r));
  r = await anon.request('GET','/api/categories');
  check(2,'Logged out GET /api/categories', r.status===401, brief(r));
  r = await anon.request('POST','/api/purchases',{name:'X',quantity:1,unitPriceCents:100,categoryId:1});
  check(2,'Logged out POST with valid CSRF token -> 401', r.status===401, brief(r));
  r = await anon.request('DELETE','/api/purchases/1');
  check(2,'Logged out DELETE -> 401', r.status===401, brief(r));
  const before2 = (await A.list()).json;
  r = await A.request('POST','/api/purchases',{name:'CSRF test',quantity:1,unitPriceCents:100,categoryId:1},{csrf:false});
  check(2,'Missing CSRF token rejected', r.status===403, brief(r));
  r = await A.request('POST','/api/purchases',{name:'CSRF test',quantity:1,unitPriceCents:100,categoryId:1},{token:'0'.repeat(64)});
  check(2,'Wrong CSRF token rejected', r.status===403, brief(r));
  r = await A.request('POST','/api/purchases',{name:'CSRF test',quantity:1,unitPriceCents:100,categoryId:1},{origin:'http://evil.example'});
  check(2,'Foreign Origin rejected', r.status===403, brief(r));
  r = await anon.request('POST','/api/login',{email:emailA,password:PASSWORD_A},{csrf:false});
  check(2,'Login without CSRF token rejected', r.status===403, brief(r));
  const after2 = (await A.list()).json;
  check(2,'No data changed by rejected mutations', JSON.stringify(before2)===JSON.stringify(after2), `${after2.length} records before and after`);

  // 3. Create two purchases
  const cats = (await A.request('GET','/api/categories')).json;
  check(3,'GET /api/categories', Array.isArray(cats) && cats.map(c=>c.name).join()==='Fund,Stock,Other', JSON.stringify(cats));
  const catId = name => cats.find(c=>c.name===name).id;
  const fund = await A.request('POST','/api/purchases',{name:'Example Index Fund',quantity:5,unitPriceCents:Math.round(20.00*100),categoryId:catId('Fund')});
  check(3,'Add Example Index Fund 5 x $20.00 -> 201', fund.status===201 && fund.json.costCents===10000 && fund.json.categoryName==='Fund', brief(fund));
  const company = await A.request('POST','/api/purchases',{name:'Example Company',quantity:3,unitPriceCents:Math.round(15.50*100),categoryId:catId('Stock'),costCents:1,ownerId:999});
  check(3,'Add Example Company 3 x $15.50 (client costCents/ownerId ignored)', company.status===201 && company.json.costCents===4650, brief(company));
  let listA = (await A.list()).json;
  check(3,'A has two records totaling $146.50', listA.length===2 && total(listA)===14650 && listA[0].id<listA[1].id, `${listA.length} records, ${dollars(total(listA))}`);

  // 4. Persistence across a new session (server restart is checked manually)
  const A2 = new Client('A2');
  await A2.login(emailA, PASSWORD_A);
  listA = (await A2.list()).json;
  check(4,'New login session sees the same records', listA.length===2 && total(listA)===14650, `${listA.length} records, ${dollars(total(listA))}`);

  // 5. Edit and delete
  r = await A.request('PUT',`/api/purchases/${company.json.id}`,{name:'Example Company',quantity:4,unitPriceCents:1550,categoryId:catId('Stock'),id:fund.json.id});
  check(5,'Edit company to quantity 4 (body id ignored)', r.status===200 && r.json.id===company.json.id && r.json.costCents===6200, brief(r));
  listA = (await A.list()).json;
  check(5,'Total after edit is $162.00', total(listA)===16200, dollars(total(listA)));
  r = await A.request('DELETE',`/api/purchases/${fund.json.id}`);
  check(5,'Delete fund purchase returns {ok:true}', r.status===200 && r.json.ok===true, brief(r));
  listA = (await A.list()).json;
  check(5,'One record, $62.00 remain', listA.length===1 && total(listA)===6200, `${listA.length} record, ${dollars(total(listA))}`);
  r = await A.request('DELETE',`/api/purchases/${fund.json.id}`);
  check(5,'Deleting it again -> 404', r.status===404, brief(r));

  // 6. Two-user authorization
  await B.login(emailB, PASSWORD_B);
  const targetId = company.json.id;
  const snapshotA = JSON.stringify((await A.list()).json);
  r = await B.list();
  check(6,'B sees no A records', r.status===200 && r.json.length===0, brief(r));
  r = await B.request('PUT',`/api/purchases/${targetId}`,{name:'Hijacked',quantity:1,unitPriceCents:1,categoryId:1});
  check(6,"B PUT to A's purchase -> 404", r.status===404, brief(r));
  r = await B.request('DELETE',`/api/purchases/${targetId}`);
  check(6,"B DELETE of A's purchase -> 404", r.status===404, brief(r));
  r = await B.request('POST','/api/purchases',{id:targetId,ownerId:idA,owner_id:idA,name:'B Example Bond',quantity:2,unitPriceCents:5000,categoryId:catId('Other')});
  check(6,"B POST with A's id/ownerId in body creates a new B record", r.status===201 && r.json.id!==targetId, brief(r));
  const bRecord = r.json;
  r = await B.request('PUT',`/api/purchases/${bRecord.id}`,{id:targetId,ownerId:idA,name:'B Example Bond',quantity:3,unitPriceCents:5000,categoryId:catId('Other')});
  check(6,'B PUT with ownerId:A keeps B as owner and same id', r.status===200 && r.json.id===bRecord.id && (await B.list()).json.length===1, brief(r));
  check(6,"A's records unchanged and B's record not visible to A", JSON.stringify((await A.list()).json)===snapshotA, snapshotA);

  // 7. Invalid input, none of which may change data
  const good = {name:'Valid',quantity:1,unitPriceCents:100,categoryId:catId('Fund')};
  const invalid = [
    ['blank name', {...good,name:'   '}],
    ['name over 100 characters', {...good,name:'x'.repeat(101)}],
    ['quantity 1.5', {...good,quantity:1.5}],
    ['quantity 0', {...good,quantity:0}],
    ['quantity 10001', {...good,quantity:10001}],
    ['nonnumeric quantity "five"', {...good,quantity:'five'}],
    ['numeric string quantity "5"', {...good,quantity:'5'}],
    ['quantity true', {...good,quantity:true}],
    ['quantity null', {...good,quantity:null}],
    ['missing quantity', {name:'Valid',unitPriceCents:100,categoryId:1}],
    ['unitPriceCents 0', {...good,unitPriceCents:0}],
    ['unitPriceCents 1.5', {...good,unitPriceCents:1.5}],
    ['unitPriceCents 100000001', {...good,unitPriceCents:100000001}],
    ['unknown category 99', {...good,categoryId:99}],
    ['array body', [good]],
  ];
  const before7 = JSON.stringify((await A.list()).json);
  for (const [label, body] of invalid) {
    r = await A.request('POST','/api/purchases',body);
    check(7,`POST ${label} -> 400`, r.status===400 && typeof r.json.error==='string', brief(r));
  }
  r = await A.request('PUT',`/api/purchases/${targetId}`,{...good,quantity:0});
  check(7,'PUT with invalid quantity -> 400', r.status===400, brief(r));
  for (const badId of ['abc','0','-1','1.5','1e3']) {
    r = await A.request('PUT',`/api/purchases/${badId}`,good);
    check(7,`PUT invalid route id "${badId}" -> 400`, r.status===400, brief(r));
  }
  r = await A.request('DELETE','/api/purchases/abc');
  check(7,'DELETE invalid route id -> 400', r.status===400, brief(r));
  check(7,'No invalid request changed data', JSON.stringify((await A.list()).json)===before7, 'list identical before/after');

  // 8. HTML-like name and repeated names
  const html1 = await A.request('POST','/api/purchases',{name:'<b>Example</b>',quantity:1,unitPriceCents:100,categoryId:catId('Other')});
  const html2 = await A.request('POST','/api/purchases',{name:'<b>Example</b>',quantity:1,unitPriceCents:100,categoryId:catId('Other')});
  check(8,'<b>Example</b> stored literally; repeat creates separate record',
    html1.status===201 && html2.status===201 && html1.json.name==='<b>Example</b>' && html1.json.id!==html2.json.id, `ids ${html1.json.id} and ${html2.json.id}`);
  // Leave A at the documented state (one record, $62.00) for the UI screenshots.
  await A.request('DELETE',`/api/purchases/${html1.json.id}`);
  await A.request('DELETE',`/api/purchases/${html2.json.id}`);

  // 10. Malformed JSON and unknown routes
  r = await A.request('POST','/api/purchases',undefined,{rawBody:'{"name":'});
  check(10,'Malformed JSON -> 400 JSON error', r.status===400 && r.isJson && r.json.error==='Invalid JSON', brief(r));
  r = await A.request('GET','/api/does-not-exist');
  check(10,'Unknown API route -> 404 JSON error', r.status===404 && r.isJson, brief(r));
  r = await A.request('GET','/api/health');
  check(10,'GET /api/health', r.status===200 && r.json.ok===true, brief(r));

  // Logout lifecycle
  const oldCookie = A2.cookie;
  r = await A2.request('POST','/api/logout');
  check(1,'Logout returns {ok:true}', r.status===200 && r.json.ok===true, brief(r));
  A2.cookie = oldCookie;
  r = await A2.request('GET','/api/me');
  check(1,'Old session cookie no longer authenticates after logout', r.status===401, brief(r));

  const failed = results.filter(x=>!x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Users: ${emailA}, ${emailB}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => {
  console.error(err.cause?.code === 'ECONNREFUSED' ? `Cannot reach ${BASE}. Start the server with npm start.` : err.message);
  process.exitCode = 1;
});

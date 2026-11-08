// Investment Purchase Tracker (PA2). The server owns the data; the browser only
// validates for quick feedback, sends JSON requests, and redraws from the
// authoritative list the server returns.
const byId=id=>document.getElementById(id);
let csrfToken=null;
let editingId=null;
let purchases=[]; // Display cache only. Do not use this as persistent storage.
const form=byId('purchase-form');
const message=byId('message');
const saveButton=byId('save-button');
const cancelButton=byId('cancel-edit');
const nameInput=byId('investment-name');
const quantityInput=byId('quantity');
const priceInput=byId('unit-price');
const categorySelect=byId('category');
const emailInput=byId('email');
const passwordInput=byId('password');
const loginButton=byId('login-button');
const registerButton=byId('register-button');
const logoutButton=byId('logout-button');
const CONNECTION_ERROR='Cannot reach the server. Check that it is running and try again.';

function money(cents){
  return '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
// kind: 'success' | 'error' | 'info'. textContent keeps server text from being parsed as HTML.
function setMessage(text,kind='info'){
  message.textContent=text;
  if(text) message.dataset.kind=kind; else delete message.dataset.kind;
}

// Error carrying the HTTP status (0 = no response from the server).
class ApiError extends Error{
  constructor(text,status){super(text);this.status=status;}
}

async function refreshCsrf(){
  let response;
  try{
    response=await fetch('/api/csrf',{credentials:'same-origin'});
  }catch{
    throw new ApiError(CONNECTION_ERROR,0);
  }
  if(!response.ok) throw new ApiError('Could not initialize the session',response.status);
  csrfToken=(await response.json()).csrfToken;
}

// F1: Shared request helper.
async function api(path,options={},retried=false){
  const method=(options.method||'GET').toUpperCase();
  const mutating=!['GET','HEAD','OPTIONS'].includes(method);
  if(mutating&&!csrfToken) await refreshCsrf();
  const headers={Accept:'application/json',...(options.headers||{})};
  let body=options.body;
  if(body!==undefined&&body!==null&&typeof body==='object'){
    body=JSON.stringify(body);
    headers['Content-Type']='application/json';
  }
  if(mutating) headers['X-CSRF-Token']=csrfToken;

  let response;
  try{
    response=await fetch(path,{...options,method,headers,body,credentials:'same-origin'});
  }catch{
    // fetch rejects only when no HTTP response arrived (server down, network lost).
    throw new ApiError(CONNECTION_ERROR,0);
  }
  let data=null;
  try{ data=await response.json(); }catch{ data=null; }

  if(!response.ok){
    // A token can go stale when the server restarts (sessions are in memory).
    // The server rejected the request before doing anything, so one retry with a
    // fresh token is safe.
    if(response.status===403&&data&&data.error==='CSRF token rejected'&&!retried){
      csrfToken=null;
      return api(path,options,true);
    }
    const text=data&&typeof data.error==='string'?data.error:`Request failed (HTTP ${response.status}).`;
    throw new ApiError(text,response.status);
  }
  return data;
}

// Show a failure; a 401 means the session ended, so return to the signed-out view.
function showFailure(err,prefix=''){
  if(err instanceof ApiError&&err.status===401&&!byId('tracker-panel').hidden){
    showSignedOut();
    setMessage('Your session has ended. Please log in again.','error');
    return;
  }
  const text=err instanceof ApiError?err.message:'Something went wrong. Please try again.';
  setMessage(prefix+text,'error');
}

// F2: Reload the authoritative list for the current user.
async function loadPurchases(){
  const list=byId('purchase-list');
  list.setAttribute('aria-busy','true');
  try{
    purchases=await api('/api/purchases');
  }finally{
    list.removeAttribute('aria-busy');
  }
  renderHistory();
  updateSummary();
}

// F3: Signed-in view.
async function showTracker(user){
  const categories=await api('/api/categories');
  categorySelect.textContent='';
  const placeholder=document.createElement('option');
  placeholder.value='';
  placeholder.textContent='Choose a category';
  categorySelect.append(placeholder);
  for(const category of categories){
    const option=document.createElement('option');
    option.value=String(category.id);
    option.textContent=category.name;
    categorySelect.append(option);
  }
  byId('account-status').textContent=`Signed in as ${user.email}`;
  byId('auth-fields').hidden=true;
  loginButton.hidden=true;
  registerButton.hidden=true;
  logoutButton.hidden=false;
  byId('tracker-panel').hidden=false;
  await loadPurchases();
}

// Signed-out view: remove every piece of private data from the page.
function showSignedOut(){
  csrfToken=null;
  purchases=[];
  resetEdit();
  renderHistory();
  updateSummary();
  categorySelect.textContent='';
  byId('tracker-panel').hidden=true;
  byId('auth-fields').hidden=false;
  loginButton.hidden=false;
  registerButton.hidden=false;
  logoutButton.hidden=true;
  passwordInput.value='';
  byId('account-status').textContent='Not signed in.';
}

function clearInvalid(){
  for(const input of [nameInput,quantityInput,priceInput,categorySelect]) input.removeAttribute('aria-invalid');
}
function resetEdit(){
  editingId=null;
  form.reset();
  clearInvalid();
  saveButton.textContent='Add purchase';
  byId('entry-heading').textContent='Add a purchase';
  cancelButton.hidden=true;
  for(const li of document.querySelectorAll('#purchase-list li.editing')) li.classList.remove('editing');
}

function renderHistory(){
  const list=byId('purchase-list'); list.textContent='';
  byId('empty-history').hidden=purchases.length>0;
  for(const purchase of purchases){
    const li=document.createElement('li');
    if(purchase.id===editingId) li.classList.add('editing');
    const text=document.createElement('span');
    text.className='purchase-text';
    text.textContent=`${purchase.name} / Quantity: ${purchase.quantity} / Unit price: ${money(purchase.unitPriceCents)} / Cost: ${money(purchase.costCents)} / Category: ${purchase.categoryName}`;
    const actions=document.createElement('span');
    actions.className='item-actions';
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';
    edit.className='small-button';
    edit.setAttribute('aria-label',`Edit ${purchase.name}`);
    edit.addEventListener('click',()=>beginEdit(purchase));
    const del=document.createElement('button');del.type='button';del.textContent='Delete';
    del.className='small-button danger';
    del.setAttribute('aria-label',`Delete ${purchase.name}`);
    del.addEventListener('click',()=>deletePurchase(purchase.id,del));
    actions.append(edit,del);
    li.append(text,actions);list.append(li);
  }
}

// F4: Totals come from server-calculated costCents of the current user's list.
function updateSummary(){
  let totalCents=0;
  for(const purchase of purchases) totalCents+=purchase.costCents;
  byId('total-invested').textContent=money(totalCents);
  byId('purchase-count').textContent=String(purchases.length);
}

// F5: Edit mode loads the record into the same form.
function beginEdit(purchase){
  clearInvalid();
  editingId=purchase.id;
  nameInput.value=purchase.name;
  quantityInput.value=String(purchase.quantity);
  priceInput.value=(purchase.unitPriceCents/100).toFixed(2);
  categorySelect.value=String(purchase.categoryId);
  saveButton.textContent='Save changes';
  byId('entry-heading').textContent='Edit purchase';
  cancelButton.hidden=false;
  renderHistory();
  setMessage(`Editing "${purchase.name}". Save changes or cancel.`,'info');
  nameInput.focus();
}

async function deletePurchase(id,button){
  const purchase=purchases.find(p=>p.id===id);
  if(purchase&&!window.confirm(`Delete "${purchase.name}"? This cannot be undone.`)) return;
  if(button) button.disabled=true;
  try{
    await api(`/api/purchases/${id}`,{method:'DELETE'});
    if(editingId===id) resetEdit();
  }catch(err){
    showFailure(err,'Delete failed: ');
    if(button) button.disabled=false;
    return;
  }
  try{
    await loadPurchases();
    setMessage('Purchase deleted.','success');
  }catch(err){
    showFailure(err,'Purchase deleted, but the list could not be refreshed: ');
  }
}

// PA1-style checks. Returns the request body or null after showing a message.
function readPurchaseForm(){
  clearInvalid();
  const fail=(input,text)=>{
    input.setAttribute('aria-invalid','true');
    input.focus();
    setMessage(text,'error');
    return null;
  };
  const name=nameInput.value.trim();
  const quantity=Number(quantityInput.value);
  const dollars=Number(priceInput.value);
  if(name==='') return fail(nameInput,'Enter an investment name.');
  if(Array.from(name).length>100) return fail(nameInput,'Investment name must be 100 characters or fewer.');
  if(quantityInput.value.trim()===''||!Number.isFinite(quantity)||quantity<1||quantity>10000){
    return fail(quantityInput,'Quantity must be from 1 to 10,000.');
  }
  if(quantityInput.validity.stepMismatch||!Number.isInteger(quantity)){
    return fail(quantityInput,'Quantity must be a whole number of units.');
  }
  if(priceInput.value.trim()===''||!Number.isFinite(dollars)||dollars<0.01||dollars>1000000){
    return fail(priceInput,'Price per unit must be from $0.01 to $1,000,000.');
  }
  // Cent step: at most two decimal places (tolerance absorbs binary floating-point error).
  if(priceInput.validity.stepMismatch||Math.abs(dollars*100-Math.round(dollars*100))>1e-6){
    return fail(priceInput,'Price per unit can have at most two decimal places.');
  }
  const categoryId=Number(categorySelect.value);
  if(categorySelect.value===''||!Number.isInteger(categoryId)) return fail(categorySelect,'Choose a category.');
  return {name,quantity,unitPriceCents:Math.round(dollars*100),categoryId};
}

// F6: Add or save changes.
form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const payload=readPurchaseForm();
  if(!payload) return; // inputs stay in place for correction
  const wasEditing=editingId!==null;
  saveButton.disabled=true;
  setMessage(wasEditing?'Saving changes...':'Adding purchase...','info');
  try{
    try{
      if(wasEditing) await api(`/api/purchases/${editingId}`,{method:'PUT',body:payload});
      else await api('/api/purchases',{method:'POST',body:payload});
    }catch(err){
      if(err instanceof ApiError&&err.status===0){
        // The request may or may not have reached the server before the connection failed.
        setMessage(`${CONNECTION_ERROR} Your entry is still in the form. If the connection dropped mid-request the purchase may already have been saved, so reload and check the history before trying again.`,'error');
      }else{
        showFailure(err,wasEditing?'Could not save changes: ':'Could not add purchase: ');
      }
      return;
    }
    resetEdit(); // only after the server confirmed the change
    try{
      await loadPurchases();
      setMessage(wasEditing?'Purchase updated.':'Purchase added.','success');
    }catch(err){
      showFailure(err,'Saved, but the list could not be refreshed: ');
    }
  }finally{
    saveButton.disabled=false;
  }
});

cancelButton.addEventListener('click',()=>{
  resetEdit(); // no request: the server record is untouched
  renderHistory();
  setMessage('Edit cancelled.','info');
});

function readCredentials(){
  const email=emailInput.value.trim();
  const password=passwordInput.value;
  if(email===''||!emailInput.checkValidity()){
    emailInput.focus();
    setMessage('Enter a valid email address.','error');
    return null;
  }
  if(password.length<8||password.length>128){
    passwordInput.focus();
    setMessage('Password must be 8-128 characters.','error');
    return null;
  }
  return {email,password};
}
function setAuthBusy(busy){
  loginButton.disabled=busy;
  registerButton.disabled=busy;
}

// F7: Account actions.
byId('auth-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const credentials=readCredentials();
  if(!credentials) return;
  setAuthBusy(true);
  setMessage('Logging in...','info');
  try{
    const user=await api('/api/login',{method:'POST',body:credentials});
    passwordInput.value='';
    csrfToken=null;
    await refreshCsrf(); // the session was regenerated, so the old token is gone
    await showTracker(user);
    setMessage('Logged in.','success');
  }catch(err){
    showFailure(err);
  }finally{
    setAuthBusy(false);
  }
});

registerButton.addEventListener('click',async()=>{
  const credentials=readCredentials();
  if(!credentials) return;
  setAuthBusy(true);
  setMessage('Creating account...','info');
  try{
    await api('/api/register',{method:'POST',body:credentials});
    passwordInput.value='';
    setMessage('Registration complete. Please log in.','success');
    passwordInput.focus();
  }catch(err){
    showFailure(err,'Registration failed: ');
  }finally{
    setAuthBusy(false);
  }
});

logoutButton.addEventListener('click',async()=>{
  logoutButton.disabled=true;
  try{
    await api('/api/logout',{method:'POST'});
    showSignedOut();
    setMessage('Logged out.','success');
  }catch(err){
    if(err instanceof ApiError&&err.status===401){
      showSignedOut(); // already signed out on the server
      setMessage('Logged out.','success');
    }else{
      showFailure(err,'Logout failed: ');
    }
  }finally{
    logoutButton.disabled=false;
  }
});

async function initialize(){
  try{
    const user=await api('/api/me');
    await showTracker(user);
  }catch(err){
    showSignedOut();
    // A new visitor simply is not logged in; only report real problems.
    if(!(err instanceof ApiError&&err.status===401)) showFailure(err);
  }
}
initialize();

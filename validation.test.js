const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePurchase} = require('./validation');
test('valid purchase and trimmed name',()=> {
  assert.deepEqual(validatePurchase({name:' Fund ',quantity:5,unitPriceCents:2000,categoryId:1},[1,2,3]),
    {value:{name:'Fund',quantity:5,unitPriceCents:2000,categoryId:1}});
});
test('invalid quantity and unchanged input',()=> {
  for (const quantity of [0,1.5,10001,'5',true,null,NaN,Infinity]) {
    const body={name:'Fund',quantity,unitPriceCents:2000,categoryId:1};
    assert.ok(validatePurchase(body,[1,2,3]).error);
    assert.ok(Object.is(body.quantity,quantity));
  }
});
test('invalid price and category',()=> {
  for (const cents of [0,1.5,100000001,'100',true]) {
    assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:cents,categoryId:1},[1,2,3]).error);
  }
  assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:100,categoryId:99},[1,2,3]).error);
});

const valid = {name:'Fund',quantity:1,unitPriceCents:100,categoryId:1};
test('rejects non-object bodies',()=> {
  for (const body of [null,undefined,[],[valid],'text',42,true]) {
    assert.ok(validatePurchase(body,[1,2,3]).error);
  }
});
test('name boundaries',()=> {
  for (const name of ['','   ',undefined,null,5,'x'.repeat(101),['Fund']]) {
    assert.ok(validatePurchase({...valid,name},[1,2,3]).error);
  }
  assert.equal(validatePurchase({...valid,name:'x'},[1,2,3]).value.name,'x');
  assert.equal(validatePurchase({...valid,name:'  '+'x'.repeat(100)+'  '},[1,2,3]).value.name,'x'.repeat(100));
});
test('valid upper and lower boundaries',()=> {
  assert.deepEqual(validatePurchase({name:'Max',quantity:10000,unitPriceCents:100000000,categoryId:3},[1,2,3]),
    {value:{name:'Max',quantity:10000,unitPriceCents:100000000,categoryId:3}});
  assert.ok(validatePurchase({name:'Min',quantity:1,unitPriceCents:1,categoryId:1},[1,2,3]).value);
});
test('rejects missing, NaN, infinite and non-integer category or price',()=> {
  for (const unitPriceCents of [undefined,null,NaN,Infinity,-Infinity,-1]) {
    assert.ok(validatePurchase({...valid,unitPriceCents},[1,2,3]).error);
  }
  for (const categoryId of [undefined,null,'1',true,1.5,0,NaN]) {
    assert.ok(validatePurchase({...valid,categoryId},[1,2,3]).error);
  }
});
test('ignores client-supplied authority fields',()=> {
  const result=validatePurchase({...valid,id:99,ownerId:7,costCents:1},[1,2,3]);
  assert.deepEqual(result,{value:{name:'Fund',quantity:1,unitPriceCents:100,categoryId:1}});
});

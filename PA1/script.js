// INVESTMENT PURCHASE TRACKER - JAVASCRIPT TEMPLATE
// Complete HTML and CSS first. Write code only in the locations identified below.
// Save and reload after each step. Reloading clears all stored purchases.
// Function skeletons are provided; complete their bodies without duplicating them.

// J1: CONNECT TO THE PAGE AND CREATE THE ARRAY
// Use const and document.getElementById to create these exact references:
// form          -> "purchase-form"
// nameInput     -> "investment-name"
// quantityInput -> "quantity"
// priceInput    -> "unit-price"
// messageOutput -> "message"
// listOutput    -> "purchase-list"
// totalOutput   -> "total-invested"
// countOutput   -> "purchase-count"
// Declare const purchases as an empty array.
// EXPECT: the page looks unchanged. In the Console, evaluate form and
// nameInput: each should be an element, not null. purchases.length should be 0.
// A null reference means the ID is missing, misspelled, or code ran too early.
// WRITE J1 HERE:
const form = document.getElementById('purchase-form');
const nameInput = document.getElementById('investment-name');
const quantityInput = document.getElementById('quantity');
const priceInput = document.getElementById('unit-price');
const messageOutput = document.getElementById('message');
const listOutput = document.getElementById('purchase-list');
const totalOutput = document.getElementById('total-invested');
const countOutput = document.getElementById('purchase-count');
const purchases = [];

// J2: LISTEN FOR SUBMISSION
// Attach handleSubmit to form's "submit" event with addEventListener.
// Pass the function name without parentheses. Also complete J2 inside the
// handler below BEFORE testing.
// EXPECT: pressing Add purchase no longer reloads the page. For now, it does
// not add anything. Other empty function bodies are intentional at this stage.
// WRITE THE LISTENER HERE:
form.addEventListener('submit', handleSubmit);

function handleSubmit(event) {
  // J2 continued: call event.preventDefault() here.
  event.preventDefault();

  // J3: READ THE CURRENT INPUT
  // Declare const name from nameInput.value.trim().
  // trim() removes spaces at the beginning and end of the text.
  // Declare const quantity using Number(quantityInput.value).
  // Declare const unitPrice using Number(priceInput.value).
  // TEMPORARY CHECK: add console.log(name, quantity, unitPrice).
  // Enter Example Index Fund, 5, 20 and submit. EXPECT in the Console:
  // Example Index Fund followed by numeric 5 and 20.
  // The page summary stays unchanged. Remove the log after checking.
  const name = nameInput.value.trim();
  const quantity = Number(quantityInput.value);
  const unitPrice = Number(priceInput.value);

  // J4: VALIDATE BEFORE STORING
  // Write a separate if block for each invalid condition below.
  // Inside each block: set messageOutput.textContent to a useful explanation,
  // then return so no purchase is accepted. Check in this order:
  // 1. name === ""
  // 2. !Number.isFinite(quantity) OR quantity < 1 OR quantity > 10000
  // 3. quantityInput.validity.stepMismatch
  // 4. !Number.isFinite(unitPrice) OR unitPrice <= 0 OR unitPrice > 1000000
  // 5. priceInput.validity.stepMismatch
  // Use || for OR. The browser's validity.stepMismatch is a Boolean:
  // it is true when the number violates the input's HTML step attribute.
  // Quantity uses step=1 (whole units); price uses step=0.01 (whole cents).
  // Copy these property names exactly; no separate helper is needed.
  // Blank numeric values become zero with Number() and are rejected above.
  // EXPECT: bad entries display feedback; the form does not reset.
  // At this stage a valid entry does not change history or summary.
  // After a rejected entry, an old message can remain until J8 is complete.
  if (name === "") {
    messageOutput.textContent = "Please enter a name for the purchase.";
    return;
  }

  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10000) {
    messageOutput.textContent = "Please enter a valid quantity for the purchase.";
    return;
  }

  if (quantityInput.validity.stepMismatch) {
    messageOutput.textContent = "Please enter a valid quantity for the purchase.";
    return;
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1000000) {
    messageOutput.textContent = "Please enter a valid unit price for the purchase.";
    return;
  }

  if (priceInput.validity.stepMismatch) {
    messageOutput.textContent = "Please enter a valid unit price for the purchase.";
    return;
  }

  // J5: CALCULATE AND STORE ONE PURCHASE
  // Declare const cost as quantity * unitPrice.
  // Create const purchase as an object with these exact property names:
  // name, quantity, unitPrice, cost. Use the variables from J3 and J5 as values.
  // Use purchases.push(purchase).
  // EXPECT: after one valid submission, purchases.length is 1 in the Console.
  // purchases[0].cost should be 100 for quantity 5 and unitPrice 20.
  // Invalid entries must not change the array. Display still waits for J6-J7.
  const cost = quantity * unitPrice;
  const purchase = {
    name: name,
    quantity: quantity,
    unitPrice: unitPrice,
    cost: cost
  };
  purchases.push(purchase);

  // J6 connection: after implementing renderHistory below, call it here.
  renderHistory();

  // J7 connection: after implementing updateSummary below, call it here.
  updateSummary();

  // J8: FINISH THE SUCCESSFUL SUBMISSION
  // After both display calls: call form.reset(), then set
  // messageOutput.textContent to "Purchase added.".
  // EXPECT: all inputs reset after success; stored purchases remain.
  // Rejected input still stays in the form for correction.
  form.reset();
  messageOutput.textContent = "Purchase added.";
}

// J6: DISPLAY THE HISTORY
function renderHistory() {
  // First set listOutput.textContent to an empty string to clear old list items.
  // Use for...of to visit every purchase in purchases.
  // For each purchase:
  //   create an li using document.createElement and store it as const item;
  //   assign item.textContent using the purchase properties, +, and formatMoney;
  //   append item to listOutput.
  // Match this text pattern:
  // Example Index Fund / Quantity: 5 / Unit price: $20.00 / Cost: $100.00
  // Use textContent, not innerHTML, to display user-entered names as plain text.
  // Add the J6 connection call in handleSubmit.
  // EXPECT: one list item per accepted purchase, in entry order. Adding a
  // second purchase produces two items, not a second copy of the first item.
  // formatMoney below is supplied so you can test this step independently.
  listOutput.textContent = "";
  for (const purchase of purchases) {
    const item = document.createElement("li");
    item.textContent = `${purchase.name} / Quantity: ${purchase.quantity} / Unit price: ${formatMoney(purchase.unitPrice)} / Cost: ${formatMoney(purchase.cost)}`;
    listOutput.appendChild(item);
  }
}

// J7: CALCULATE AND DISPLAY THE SUMMARY
function updateSummary() {
  // Declare let totalInvested = 0 BEFORE the loop.
  // Loop through purchases and add each purchase.cost to totalInvested.
  // After the loop, assign formatMoney(totalInvested) to totalOutput.textContent.
  // Assign purchases.length to countOutput.textContent.
  // Add the J7 connection call in handleSubmit after renderHistory().
  // EXPECT: purchases of 5 units at $20 and 3 units at $15.50 produce
  // total $146.50 and count 2. Count means purchases, not units or unique names.
  let totalInvested = 0;
  for (const purchase of purchases) {
    totalInvested += purchase.cost;
  }
  totalOutput.textContent = formatMoney(totalInvested);
  countOutput.textContent = purchases.length;
}

// SUPPLIED: do not change. toFixed returns text with two decimal places.
// Keep numeric values for calculations and use this function only for display.
function formatMoney(value) {
  return "$" + value.toFixed(2);
}

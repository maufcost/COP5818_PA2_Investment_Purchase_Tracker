// V1: Server-side validation for one purchase. The browser also validates, but
// only this function is authoritative. It never modifies `body` and ignores any
// extra fields (id, ownerId, costCents, ...) the client may send.
const NAME_MAX = 100;
const QUANTITY_MAX = 10000;
const PRICE_CENTS_MAX = 100000000;

// Number.isInteger rejects strings, Booleans, null, undefined, NaN, Infinity and fractions.
function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validatePurchase(body, validCategoryIds) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {error: 'Request body must be a JSON object'};
  }
  if (typeof body.name !== 'string') {
    return {error: 'Investment name is required'};
  }
  const name = body.name.trim();
  // Count code points so the limit matches SQLite's length() in the CHECK constraint.
  const nameLength = Array.from(name).length;
  if (nameLength < 1 || nameLength > NAME_MAX) {
    return {error: `Investment name must be 1-${NAME_MAX} characters`};
  }
  if (!isIntegerBetween(body.quantity, 1, QUANTITY_MAX)) {
    return {error: `Quantity must be a whole number from 1 to ${QUANTITY_MAX.toLocaleString('en-US')}`};
  }
  if (!isIntegerBetween(body.unitPriceCents, 1, PRICE_CENTS_MAX)) {
    return {error: 'Unit price must be a whole number of cents from 1 to 100,000,000 ($0.01 to $1,000,000.00)'};
  }
  const ids = Array.isArray(validCategoryIds) ? validCategoryIds : [];
  if (!Number.isInteger(body.categoryId) || !ids.includes(body.categoryId)) {
    return {error: 'Choose an existing category'};
  }
  return {value: {name, quantity: body.quantity, unitPriceCents: body.unitPriceCents, categoryId: body.categoryId}};
}

module.exports = {validatePurchase};

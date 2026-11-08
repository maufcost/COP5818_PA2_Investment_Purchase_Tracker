function validatePurchase(body, validCategoryIds) {
  // V1: Reject non-object/null/array bodies. Validate names and numeric types/bounds.
  // Use Number.isInteger (which rejects strings and Booleans).
  // Return {error:"..."} on failure; otherwise {value:{name,quantity,unitPriceCents,categoryId}}.
  // Do not modify body. Check membership in validCategoryIds, an array of integers.
  return {error:'TODO V1: implement validation'};
}
module.exports={validatePurchase};

const assert = require('node:assert/strict');
const { evaluate, parsePolicy, issueFacts } = require('../src/compliance.cjs');
const policy = parsePolicy(JSON.stringify({ quoteThresholds: { USD: 10000, IDR: 10000000 }, minimumQuotes: 3, prohibitedCategories: ['gambling'], approvalThresholds: { USD: 5000 } }));
const facts = { amount: 12000, currency: 'USD', quoteCount: 3, category: 'software', approvalReference: 'FIN-42', vendor: 'Example' };
assert.equal(evaluate(facts, policy).status, 'COMPLIANT');
assert.equal(evaluate({ ...facts, quoteCount: 2 }, policy).status, 'NON_COMPLIANT');
assert.equal(evaluate({ ...facts, category: 'gambling' }, policy).status, 'NON_COMPLIANT');
assert.equal(evaluate({ ...facts, currency: 'EUR' }, policy).status, 'NEEDS_REVIEW');
assert.equal(evaluate({ ...facts, amount: undefined }, policy).status, 'NEEDS_REVIEW');
assert.equal(evaluate({ ...facts, approvalReference: '' }, policy).status, 'NEEDS_REVIEW');
assert.equal(evaluate({ ...facts, amount: 10000, quoteCount: 0 }, policy).status, 'COMPLIANT');
assert.equal(evaluate(facts, parsePolicy('Minimal 3 penawaran untuk pembelian > Rp 10 juta')).status, 'NEEDS_REVIEW');
assert.throws(() => parsePolicy('{"quoteThresholds":{"USD":-1}}'));
assert.equal(issueFacts({ summary: 'Purchase', description: { content: [{ text: 'Amount: 12000\nCurrency: USD\nQuote count: 3\nCategory: software\nVendor: Example\nApproval reference: FIN-42' }] } }).amount, 12000);
const spacedPolicy = parsePolicy(JSON.stringify({ quoteThresholds: { USD: 10000 }, minimumQuotes: 3, prohibitedCategories: [' Gambling '] }));
assert.equal(evaluate({ ...facts, category: 'gambling' }, spacedPolicy).status, 'NON_COMPLIANT');
for (const currency of ['constructor', 'toString', '__proto__', 'usd', ' USD ']) {
  assert.equal(evaluate({ ...facts, currency }, policy).status, 'NEEDS_REVIEW', currency);
}
console.log('Compliance checks passed');

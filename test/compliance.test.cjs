const assert = require('node:assert/strict');
const { evaluate, parsePolicy, issueFacts } = require('../src/compliance.cjs');
const policy = parsePolicy(JSON.stringify({ quoteThresholds: { USD: 10000, IDR: 10000000 }, minimumQuotes: 3, prohibitedCategories: ['gambling'], approvalThresholds: { USD: 5000 } }));
const facts = { amount: 12000, currency: 'USD', quoteCount: 3, category: 'software', approvalReference: 'FIN-42', vendor: 'Example', attachmentCount: 1, evidenceLinkCount: 0 };
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
const noEvidence = evaluate({ ...facts, attachmentCount: 0, evidenceLinkCount: 0 }, policy);
assert.equal(noEvidence.status, 'NEEDS_REVIEW');
assert.equal(noEvidence.checks.find(c => c.rule === 'vendor-quotes').outcome, 'UNKNOWN');
assert.match(noEvidence.checks.find(c => c.rule === 'vendor-quotes').detail, /0 attachment/);
assert.equal(evaluate({ ...facts, attachmentCount: 0, evidenceLinkCount: 1 }, policy).status, 'COMPLIANT');
for (const result of [noEvidence, evaluate({ ...facts, quoteCount: 2 }, policy), evaluate({}, policy), evaluate(facts, { supported: false })]) {
  for (const check of result.checks.filter(c => c.outcome !== 'PASS')) assert.ok(check.remediation?.length > 10);
}
const kv = 'Quote threshold USD: 10000\nMinimum quotes: 3\nApproval threshold USD: 5000\nProhibited categories: gambling, personal entertainment';
assert.equal(parsePolicy(kv).quoteThresholds?.USD, 10000);
assert.equal(parsePolicy(kv).approvalThresholds?.USD, 5000);
const markdown = '| Rule | Value |\n| --- | --- |\n| Quote threshold USD | 10000 |\n| Minimum quotes | 3 |\n| Prohibited categories | gambling |';
assert.equal(parsePolicy(markdown).minimumQuotes, 3);
const table = { type: 'doc', content: [{ type: 'table', content: [
  ['Quote threshold USD', '10000'], ['Minimum quotes', '3'], ['Prohibited categories', 'gambling']
].map(row => ({ type: 'tableRow', content: row.map(text => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) })) }] };
assert.equal(parsePolicy(table).quoteThresholds?.USD, 10000);
assert.equal(parsePolicy({ type: 'doc', content: [{ type: 'paragraph', content: [{ text: kv }] }, { type: 'codeBlock', content: [{ text: JSON.stringify({ quoteThresholds: { USD: 20000 }, minimumQuotes: 4, prohibitedCategories: [] }) }] }] }).minimumQuotes, 4);
assert.equal(parsePolicy('```json\n{bad}\n```\n' + kv).supported, false);
assert.equal(parsePolicy(kv.replace('10000', '10,000')).supported, false);
assert.equal(parsePolicy(kv + '\nMinimum quotes: 2').supported, false);
assert.equal(parsePolicy(kv.replace('Approval threshold USD: 5000', 'Approval threshold USD 5000')).supported, false);
const linkFacts = issueFacts({ description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vendor document', marks: [{ type: 'link', attrs: { href: 'https://example.com/quote' } }] }] }] }, attachment: [] });
assert.equal(linkFacts.evidenceLinkCount, 1);
assert.equal(linkFacts.attachmentCount, 0);
assert.equal(issueFacts({ description: 'Evidence: https://example.com/quote', attachment: [{ id: '1' }] }).attachmentCount, 1);
assert.equal(issueFacts({ description: 'Evidence: https://example.com/quote' }).evidenceLinkCount, 1);
assert.equal(issueFacts({ description: 'Evidence: https://' }).evidenceLinkCount, 0);
console.log('Compliance checks passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const compliance = require('../src/compliance.cjs');
(async () => {
  const calls = [];
  let forbidden = false;
  let attachments = [{ id: '1' }];
  const rules = { quoteThresholds: { USD: 10000 }, minimumQuotes: 3, prohibitedCategories: [] };
  const reply = value => ({ ok: true, json: async () => value });
  const api = { asUser: () => ({
    requestConfluence: async path => {
      calls.push(path);
      if (forbidden) return { ok: false, status: 403 };
      return reply({ title: 'Finance SOP', version: { number: 4 }, body: { atlas_doc_format: { value: JSON.stringify({ content: [{ text: JSON.stringify(rules) }] }) } } });
    },
    requestJira: async (path, options) => {
      calls.push(path);
      if (options) {
        assert.match(options.body, /NEEDS_REVIEW/);
        assert.match(options.body, /Remediation steps/);
        assert.match(options.body, /0 attachments/);
        return reply({ id: '123' });
      }
      assert.match(path, /fields=summary,description,attachment/);
      return reply({ key: 'FIN-1', fields: { attachment: attachments, summary: 'Amount: 12000\nCurrency: USD\nQuote count: 3\nCategory: software\nVendor: Example' } });
    },
  }) };
  const mock = new vm.SyntheticModule(['default', 'route', 'fetch'], function () {
    this.setExport('default', api);
    this.setExport('route', (strings, ...values) => strings.reduce((s, part, index) => s + part + (values[index] ?? ''), ''));
    this.setExport('fetch', async () => { throw new Error('offline'); });
  });
  const pure = new vm.SyntheticModule(['default'], function () { this.setExport('default', compliance); });
  const module = new vm.SourceTextModule(fs.readFileSync('src/backend.js', 'utf8'));
  await module.link(name => name === '@forge/api' ? mock : pure);
  await module.evaluate();
  const { checkIssueCompliance, getPolicyRules, addAuditComment } = module.namespace;
  await assert.rejects(getPolicyRules({ policyPageId: '../private' }), /invalid/);
  assert.equal(calls.length, 0);
  const input = { issueKey: 'FIN-1', policyPageId: '42' };
  const result = await checkIssueCompliance(input);
  assert.equal(result.status, 'COMPLIANT');
  assert.equal(result.policy.version, 4);
  attachments = [];
  assert.equal((await checkIssueCompliance(input)).status, 'NEEDS_REVIEW');
  assert.equal((await addAuditComment({ ...input, result: { status: 'forged' } })).commentId, '123');
  process.env.EXTERNAL_AI_ENABLED = 'true';
  process.env.EXTERNAL_AI_BASE_URL = 'http://127.0.0.1';
  assert.equal((await checkIssueCompliance(input)).ai.status, 'unavailable');
  delete process.env.EXTERNAL_AI_ENABLED;
  forbidden = true;
  await assert.rejects(checkIssueCompliance(input), /403/);
  console.log('Backend checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

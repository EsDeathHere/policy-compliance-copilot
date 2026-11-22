const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const compliance = require('../src/compliance.cjs');
(async () => {
  const calls = [];
  const posts = [];
  let forbidden = false;
  let attachments = [{ id: '1' }];
  const rules = { quoteThresholds: { USD: 10000 }, minimumQuotes: 3, prohibitedCategories: [] };
  const reply = value => ({ ok: true, json: async () => value });
  const api = { asUser: () => ({
    requestConfluence: async path => {
      calls.push(path);
      if (forbidden) return { ok: false, status: 403 };
      if (path.includes('/pages?')) return reply({ results: [{ id: '42', title: 'Finance SOP' }] });
      return reply({ title: 'Finance SOP', version: { number: 4 }, body: { atlas_doc_format: { value: JSON.stringify({ content: [{ text: JSON.stringify(rules) }] }) } } });
    },
    requestJira: async (path, options) => {
      calls.push(path);
      if (options) {
        posts.push(JSON.parse(options.body).body);
        return reply({ id: '123' });
      }
      assert.match(path, /fields=summary,description,attachment/);
      return reply({ key: 'FIN-1', fields: { attachment: attachments, summary: 'Amount: 12000\nCurrency: USD\nQuote count: 3\nCategory: software\nVendor: Example\nApproval reference: FIN-42' } });
    },
  }) };
  const mock = new vm.SyntheticModule(['default', 'route'], function () {
    this.setExport('default', api);
    this.setExport('route', (strings, ...values) => strings.reduce((s, part, index) => s + part + (values[index] ?? ''), ''));
  });
  const pure = new vm.SyntheticModule(['default'], function () { this.setExport('default', compliance); });
  const sample = new vm.SyntheticModule(['default'], function () { this.setExport('default', require('../src/sample-policy.cjs')); });
  const module = new vm.SourceTextModule(fs.readFileSync('src/backend.js', 'utf8'));
  await module.link(name => name === '@forge/api' ? mock : name === './sample-policy.cjs' ? sample : pure);
  await module.evaluate();
  const {
    checkIssueCompliance, getPolicyRules, getSamplePolicy, searchPolicyPages,
    buildRemediationPlan, postComplianceChecklist, addAuditComment,
  } = module.namespace;

  await assert.rejects(getPolicyRules({ policyPageId: '../private' }), /invalid/);
  assert.equal(calls.length, 0);
  const input = { issueKey: 'FIN-1', policyPageId: '42' };

  const result = await checkIssueCompliance(input);
  assert.equal(result.status, 'COMPLIANT');
  assert.equal(result.policy.version, 4);
  const context = { jira: { resourceType: 'issue', issueKey: 'FIN-1' } };
  assert.equal((await checkIssueCompliance({ policyPageId: '42', context })).issueKey, 'FIN-1');

  // One-click path: no Confluence page read, same deterministic engine.
  const sampleResult = await checkIssueCompliance({ issueKey: 'FIN-1', useSamplePolicy: true });
  assert.equal(sampleResult.policy.pageId, 'built-in');
  assert.equal(sampleResult.status, 'COMPLIANT');
  // A supplied page ID wins over the sample flag; no silent policy switch.
  const both = await checkIssueCompliance({ ...input, useSamplePolicy: true });
  assert.equal(both.policy.pageId, '42');
  assert.equal(both.policy.version, 4);
  assert.equal(getSamplePolicy().rules.minimumQuotes, 3);
  assert.deepEqual(await searchPolicyPages({}), [{ id: '42', title: 'Finance SOP' }]);

  // Rovo artifact: compliant issue has a checklist but no remediation steps.
  const cleanPlan = await buildRemediationPlan(input);
  assert.equal(cleanPlan.allSupportedChecksPass, true);
  assert.equal(cleanPlan.financeVerificationRequired, true);
  assert.equal(cleanPlan.steps.length, 0);
  assert.ok(cleanPlan.checklist.length >= 4);

  attachments = [];
  assert.equal((await checkIssueCompliance(input)).status, 'NEEDS_REVIEW');
  const plan = await buildRemediationPlan(input);
  assert.equal(plan.allSupportedChecksPass, false);
  assert.ok(plan.steps.length > 0);
  for (const step of plan.steps) assert.ok(step.action?.length > 10);

  assert.equal((await addAuditComment({ ...input, result: { status: 'forged' } })).commentId, '123');
  assert.match(JSON.stringify(posts.at(-1)), /NEEDS_REVIEW/);
  assert.match(JSON.stringify(posts.at(-1)), /Remediation steps/);
  assert.match(JSON.stringify(posts.at(-1)), /0 attachments/);

  // Write gate: no explicit confirmation means no Jira write.
  const before = posts.length;
  await assert.rejects(postComplianceChecklist(input), /confirmation/);
  assert.equal(posts.length, before);
  const posted = await postComplianceChecklist({ ...input, confirmed: true });
  assert.equal(posted.commentId, '123');
  assert.equal(posted.status, 'NEEDS_REVIEW');
  const body = posts.at(-1);
  assert.equal(body.type, 'doc');
  assert.equal(body.content[0].type, 'paragraph');
  // ADF text nodes must not contain raw newlines; each line is its own block.
  for (const node of body.content) if (node.type === 'paragraph') assert.ok(!node.content[0].text.includes('\n'));
  assert.match(JSON.stringify(body), /Rule checklist/);
  assert.match(JSON.stringify(body), /Remediation plan/);

  forbidden = true;
  await assert.rejects(checkIssueCompliance(input), /403/);
  console.log('Backend checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

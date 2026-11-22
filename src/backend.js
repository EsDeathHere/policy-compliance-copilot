import api, { route } from '@forge/api';
import compliance from './compliance.cjs';
import sample from './sample-policy.cjs';
const { parsePolicy, issueFacts, evaluate } = compliance;
const { samplePolicy } = sample;

function identifier(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
async function jsonResponse(response, label) {
  if (response.status === 429) throw new Error(`${label} was rate limited (HTTP 429). Wait briefly and try again.`);
  // Do not expose response bodies: they may contain private content or provider details.
  if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}). Check your permissions and product connection.`);
  return response.json();
}
export async function getPolicyRules({ policyPageId } = {}) {
  const id = identifier(policyPageId, /^\d{1,30}$/, 'Policy page ID');
  const page = await jsonResponse(await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${id}?body-format=atlas_doc_format`), 'Policy retrieval');
  const body = page.body?.atlas_doc_format?.value;
  if (!body || body.length > 150000) throw new Error('The policy is empty or exceeds the 150000-character limit.');
  let document;
  try { document = JSON.parse(body); } catch { throw new Error('The policy document format is not supported.'); }
  return { pageId: id, title: page.title, version: page.version?.number, rules: parsePolicy(document) };
}
// One-click demo path: the same policy shape without reading Confluence.
export function getSamplePolicy() {
  return samplePolicy();
}
// Recent pages for the Jira panel picker. Uses the existing read:page:confluence scope.
export async function searchPolicyPages({ query } = {}) {
  const title = typeof query === 'string' ? query.trim() : '';
  if (title.length > 200) throw new Error('Search text is too long.');
  const path = title
    ? route`/wiki/api/v2/pages?limit=25&sort=-modified-date&title=${title}`
    : route`/wiki/api/v2/pages?limit=25&sort=-modified-date`;
  const data = await jsonResponse(await api.asUser().requestConfluence(path), 'Policy page search');
  return (Array.isArray(data.results) ? data.results : [])
    .filter(page => page && page.id && page.title)
    .map(page => ({ id: String(page.id), title: page.title }));
}
async function readIssue(issueKey) {
  const key = identifier(issueKey, /^[A-Z][A-Z0-9_]*-\d{1,15}$/, 'Issue key');
  // Explicit field IDs, configured by the app operator; never accept arbitrary field paths from a browser.
  const custom = ['AMOUNT', 'CURRENCY', 'QUOTES', 'VENDOR', 'CATEGORY', 'APPROVAL'].map(name => process.env[`JIRA_${name}_FIELD`]).filter(Boolean);
  if (custom.some(field => !/^customfield_\d+$/.test(field))) throw new Error('The custom field configuration is invalid.');
  const fields = ['summary', 'description', 'attachment', ...custom].join(',');
  const issue = await jsonResponse(await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=${fields}`), 'Issue retrieval');
  const issueFields = issue.fields ?? {};
  const facts = issueFacts(issueFields);
  for (const [name, property] of Object.entries({ AMOUNT: 'amount', CURRENCY: 'currency', QUOTES: 'quoteCount', VENDOR: 'vendor', CATEGORY: 'category', APPROVAL: 'approvalReference' })) {
    const field = process.env[`JIRA_${name}_FIELD`];
    if (field) {
      const value = issueFields[field];
      // Keep malformed or missing custom values unknown instead of falling back to untrusted prose.
      facts[property] = ['amount', 'quoteCount'].includes(property) ? (typeof value === 'number' ? value : undefined) : (typeof value === 'string' ? value : undefined);
    }
  }
  return { key: issue.key, facts };
}
export async function checkIssueCompliance({ issueKey, policyPageId, useSamplePolicy, context } = {}) {
  // Forge supplies Jira context for actions invoked from an issue view. API access still uses asUser().
  const activeIssue = context?.jira?.resourceType === 'issue' ? context.jira.issueKey : undefined;
  // The sample is used only when no page is supplied. If Rovo passes both, the
  // real page wins so a verdict can never silently switch to a different policy.
  const useSample = useSamplePolicy === true && !policyPageId;
  const [issue, policy] = await Promise.all([readIssue(issueKey ?? activeIssue), useSample ? samplePolicy() : getPolicyRules({ policyPageId })]);
  const result = { ...evaluate(issue.facts, policy.rules), issueKey: issue.key, policy: { pageId: policy.pageId, title: policy.title, version: policy.version }, checkedAt: new Date().toISOString() };
  // Deterministic only: no external model can change the verdict.
  return result;
}
export async function addAuditComment(input) {
  // Recompute from APIs. Never post a result supplied by the browser as an authoritative audit.
  const result = await checkIssueCompliance(input);
  const lines = [
    'Policy Compliance Copilot',
    `${result.status} | Score ${result.score}/100`,
    `SOP ${result.policy.pageId} v${result.policy.version} | ${result.checkedAt}`,
    ...result.checks.map(check => `${check.outcome}: ${check.rule} — ${check.detail}${check.remediation ? ` Remediation steps: ${check.remediation}` : ''}`),
    result.notice,
  ];
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${result.issueKey}/comment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    // ADF text nodes do not render \n; one paragraph per line keeps the comment readable.
    body: JSON.stringify({ body: { type: 'doc', version: 1, content: lines.map(paragraph) } }),
  });
  const comment = await jsonResponse(response, 'Audit comment creation');
  return { commentId: comment.id, result };
}
// Structured artifact for the Rovo Agent: a numbered plan plus a rule checklist.
// The verdict and steps come only from the deterministic engine, never from model text.
export async function buildRemediationPlan(input = {}) {
  const result = await checkIssueCompliance(input);
  const steps = result.checks
    .filter(check => check.outcome !== 'PASS')
    .map((check, index) => ({ step: index + 1, rule: check.rule, outcome: check.outcome, finding: check.detail, action: check.remediation }));
  return {
    issueKey: result.issueKey,
    policy: result.policy,
    status: result.status,
    score: result.score,
    allSupportedChecksPass: result.status === 'COMPLIANT',
    financeVerificationRequired: true,
    summary: steps.length ? `${steps.length} finding(s) must be resolved before Finance review.` : 'All supported checks pass. Finance must still verify evidence content and approval authority.',
    steps,
    checklist: result.checks.map(check => ({ rule: check.rule, outcome: check.outcome, detail: check.detail })),
    notice: result.notice,
  };
}
// ADF helpers: text nodes do not render \n, so every line becomes its own block.
const textNode = text => ({ type: 'text', text });
const paragraph = text => ({ type: 'paragraph', content: [textNode(text)] });
const list = (type, items) => ({ type, content: items.map(item => ({ type: 'listItem', content: [paragraph(item)] })) });
function checklistDocument(plan) {
  const content = [
    paragraph('Policy Compliance Copilot — compliance checklist'),
    paragraph(`${plan.status} | Score ${plan.score}/100 | SOP ${plan.policy.pageId} v${plan.policy.version}`),
    paragraph('Rule checklist'),
    list('bulletList', plan.checklist.map(item => `${item.outcome} — ${item.rule}: ${item.detail}`)),
  ];
  if (plan.steps.length) {
    content.push(paragraph('Remediation plan'));
    content.push(list('orderedList', plan.steps.map(item => `[${item.rule}] ${item.action}`)));
  }
  content.push(paragraph(plan.notice));
  return { type: 'doc', version: 1, content };
}
export async function postComplianceChecklist(input = {}) {
  // The explicit Jira panel operation is the only entry point for this write.
  if (input.confirmed !== true) throw new Error('Explicit user confirmation is required before writing a checklist to the issue.');
  const plan = await buildRemediationPlan(input);
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${plan.issueKey}/comment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: checklistDocument(plan) }),
  });
  const comment = await jsonResponse(response, 'Checklist creation');
  return { commentId: comment.id, status: plan.status, score: plan.score, issueKey: plan.issueKey };
}

// Pure policy and evidence-presence checks shared by UI, Rovo and MCP.
function plainText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (value.type === 'tableRow') return (value.content || []).map(plainText).join(' | ');
  // Preserve inline text; only block boundaries introduce new lines.
  const separator = ['paragraph', 'heading', 'codeBlock', 'text'].includes(value.type) ? '' : '\n';
  return [value.text || '', ...(value.content || []).map(plainText)].filter(Boolean).join(separator);
}

function parsePolicy(input) {
  const text = plainText(input);
  const blocks = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'codeBlock' && plainText(node).trim().startsWith('{')) blocks.push(plainText(node));
    for (const child of node.content || []) visit(child);
  };
  visit(input);
  const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map(match => match[1]).find(value => value.trim().startsWith('{'));
  const start = text.indexOf('{');
  // JSON is authoritative. Malformed JSON must not silently fall back to weaker rules.
  const json = blocks[0] || fenced || (start >= 0 ? text.slice(start, text.lastIndexOf('}') + 1) || text.slice(start) : null);
  let rules;
  if (json) {
    try { rules = JSON.parse(json); } catch { return { supported: false }; }
  } else {
    rules = { quoteThresholds: {}, minimumQuotes: undefined, prohibitedCategories: undefined };
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
      const match = line.trim().replace(/^[-*]\s+/, '').replace(/^\|\s*/, '').replace(/\s*\|$/, '').match(/^(Quote threshold [A-Z]{3}|Approval threshold [A-Z]{3}|Minimum quotes|Prohibited categories)\s*(?::|\|)\s*(.*?)\s*$/i);
      if (!match) {
        if (/^(?:\|\s*)?(?:[-*]\s+)?(?:Quote threshold|Approval threshold|Minimum quotes|Prohibited categories)\b/i.test(line.trim())) return { supported: false };
        continue;
      }
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (seen.has(key)) return { supported: false };
      seen.add(key);
      if (key === 'prohibited categories') rules.prohibitedCategories = value.toLowerCase() === 'none' ? [] : value.split(',').map(v => v.trim());
      else {
        if (!/^\d+(\.\d{1,2})?$/.test(value)) return { supported: false };
        if (key === 'minimum quotes') rules.minimumQuotes = Number(value);
        else {
          const property = key.startsWith('quote') ? 'quoteThresholds' : 'approvalThresholds';
          rules[property] ||= {};
          rules[property][key.slice(-3).toUpperCase()] = Number(value);
        }
      }
    }
    if (!Object.keys(rules.quoteThresholds).length || rules.minimumQuotes === undefined || rules.prohibitedCategories === undefined) return { supported: false };
  }
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error('Policy must be an object.');
  for (const name of ['quoteThresholds', 'approvalThresholds']) {
    if (rules[name] !== undefined && (!rules[name] || typeof rules[name] !== 'object' || Array.isArray(rules[name]) ||
      Object.entries(rules[name]).some(([currency, value]) => !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(value) || value < 0))) {
      throw new Error('Invalid policy thresholds. Use non-negative ungrouped numbers and three-letter currency codes.');
    }
  }
  if (!rules.quoteThresholds || !Object.keys(rules.quoteThresholds).length || !Number.isInteger(rules.minimumQuotes) || rules.minimumQuotes < 1 ||
      !Array.isArray(rules.prohibitedCategories) || rules.prohibitedCategories.some(v => typeof v !== 'string' || !v.trim())) {
    throw new Error('Policy requires quoteThresholds, minimumQuotes and prohibitedCategories.');
  }
  return { ...rules, prohibitedCategories: rules.prohibitedCategories.map(value => value.trim().toLowerCase()), supported: true };
}

function issueFacts(fields) {
  const description = plainText(fields.description);
  const text = `${fields.summary || ''}\n${description}`;
  const field = label => text.match(new RegExp(`^${label}:[ \\t]*(.+)$`, 'im'))?.[1]?.trim();
  const amount = field('Amount');
  const quotes = field('Quote count');
  const links = new Set();
  const addLink = value => {
    try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol) && url.hostname) links.add(url.href); } catch { /* Invalid links are not evidence. */ }
  };
  for (const match of description.matchAll(/https?:\/\/[^\s<>"']+/gi)) addLink(match[0]);
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    for (const mark of node.marks || []) if (mark.type === 'link') addLink(mark.attrs?.href);
    if (['inlineCard', 'blockCard'].includes(node.type)) addLink(node.attrs?.url);
    for (const child of node.content || []) visit(child);
  };
  visit(fields.description);
  return {
    amount: amount && /^\d+(\.\d{1,2})?$/.test(amount) ? Number(amount) : undefined,
    currency: field('Currency')?.toUpperCase(),
    quoteCount: quotes && /^\d+$/.test(quotes) ? Number(quotes) : undefined,
    category: field('Category'), vendor: field('Vendor'), approvalReference: field('Approval reference'),
    attachmentCount: Array.isArray(fields.attachment) ? fields.attachment.length : undefined,
    evidenceLinkCount: links.size,
  };
}

function evaluate(facts, policy) {
  const checks = [];
  const add = (rule, outcome, detail, remediation) => checks.push({ rule, outcome, detail, ...(outcome !== 'PASS' ? { remediation } : {}) });
  if (!policy.supported) add('policy', 'UNKNOWN', 'No complete supported policy configuration was found.', 'Ask Finance to provide a reviewed JSON policy or a complete policy table/key-value list, then rerun the check.');
  else {
    const validCurrency = typeof facts.currency === 'string' && /^[A-Z]{3}$/.test(facts.currency);
    const threshold = validCurrency && Object.hasOwn(policy.quoteThresholds, facts.currency) ? policy.quoteThresholds[facts.currency] : undefined;
    const validAmount = Number.isFinite(facts.amount) && facts.amount >= 0;
    add('amount', validAmount && threshold !== undefined ? 'PASS' : 'UNKNOWN', 'The amount must be explicit and its currency supported by the SOP.', 'Enter an ungrouped Amount (for example 12000) and a supported Currency (for example USD); ask Finance to configure missing currency thresholds.');
    if (validAmount && threshold !== undefined && facts.amount > threshold) {
      const validCount = Number.isInteger(facts.quoteCount) && facts.quoteCount >= 0;
      const declared = validCount && facts.quoteCount >= policy.minimumQuotes;
      const evidence = (Number.isInteger(facts.attachmentCount) && facts.attachmentCount > 0) || facts.evidenceLinkCount > 0;
      const outcome = !validCount ? 'UNKNOWN' : !declared ? 'FAIL' : evidence ? 'PASS' : 'UNKNOWN';
      add('vendor-quotes', outcome, `At least ${policy.minimumQuotes} quotes are required above ${threshold} ${facts.currency}. Detected: ${facts.attachmentCount ?? 'unknown'} attachments, ${facts.evidenceLinkCount ?? 0} document links. ${declared && !evidence ? 'The declared quote count meets the requirement, but no supporting attachment or document link was found.' : 'Evidence presence does not verify quote content, authenticity or distinct vendors.'}`, `Obtain at least ${policy.minimumQuotes} vendor quotes, update Quote count, and attach the quote documents or add HTTP/HTTPS evidence links to Description. Rerun the check; Finance must verify the documents.`);
    }
    const category = facts.category?.trim().toLowerCase();
    add('category', category ? (policy.prohibitedCategories.includes(category) ? 'FAIL' : 'PASS') : 'UNKNOWN', 'The declared category is checked against the SOP prohibited categories.', 'Provide the accurate Category. If prohibited, remove the prohibited purchase or obtain a documented Finance policy decision; do not relabel it to bypass the rule.');
    add('vendor', facts.vendor?.trim() ? 'PASS' : 'UNKNOWN', 'A vendor must be identified.', 'Provide the vendor name in Vendor or the configured Jira vendor field.');
    const approval = validCurrency && policy.approvalThresholds && Object.hasOwn(policy.approvalThresholds, facts.currency) ? policy.approvalThresholds[facts.currency] : undefined;
    if (validAmount && approval !== undefined && facts.amount > approval) {
      add('approval', facts.approvalReference?.trim() ? 'PASS' : 'UNKNOWN', `An approval reference is required above ${approval} ${facts.currency}. Approval validity still requires human verification.`, 'Obtain approval from the authorized approver and add the approval ticket or document reference to Approval reference, then rerun the check.');
    }
  }
  const status = checks.some(c => c.outcome === 'FAIL') ? 'NON_COMPLIANT' : checks.some(c => c.outcome === 'UNKNOWN') ? 'NEEDS_REVIEW' : 'COMPLIANT';
  return { status, score: Math.round(100 * checks.filter(c => c.outcome === 'PASS').length / checks.length), checks, engine: 'local', evidence: { attachmentCount: facts.attachmentCount ?? null, linkCount: facts.evidenceLinkCount ?? 0 }, notice: 'Pre-finance screening only. Attachment/link presence does not verify quote content, authenticity, distinct vendors or approval authority. This is not payment approval.' };
}
module.exports = { parsePolicy, plainText, issueFacts, evaluate };

// Pure rules: shared by UI resolvers and Rovo/MCP; no product or network access.
function parsePolicy(text) {
  // ponytail: free-form SOP requires human review; add a reviewed extraction workflow later.
  // Finance embeds one JSON object in a Confluence code block; prose is never guessed.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return { supported: false };
  let rules;
  try { rules = JSON.parse(text.slice(start, end + 1)); }
  catch { return { supported: false }; }
  for (const name of ['quoteThresholds', 'approvalThresholds']) {
    if (rules[name] && (typeof rules[name] !== 'object' || Array.isArray(rules[name]) ||
      Object.entries(rules[name]).some(([currency, value]) => !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(value) || value < 0))) {
      throw new Error('Invalid policy thresholds');
    }
  }
  if (!rules.quoteThresholds || !Number.isInteger(rules.minimumQuotes) || rules.minimumQuotes < 1 ||
      !Array.isArray(rules.prohibitedCategories) || rules.prohibitedCategories.some(v => typeof v !== 'string' || !v.trim())) {
    throw new Error('Policy requires quoteThresholds, minimumQuotes, prohibitedCategories');
  }
  return { ...rules, prohibitedCategories: rules.prohibitedCategories.map(value => value.trim().toLowerCase()), supported: true };
}

function plainText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return [value.text || '', ...(value.content || []).map(plainText)].filter(Boolean).join('\n');
}

function issueFacts(fields) {
  const text = `${fields.summary || ''}\n${plainText(fields.description)}`;
  const field = label => text.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))?.[1]?.trim();
  const amount = field('Amount');
  const quotes = field('Quote count');
  return {
    // Explicit ungrouped decimal numbers avoid locale-dependent financial interpretation.
    amount: amount && /^\d+(\.\d{1,2})?$/.test(amount) ? Number(amount) : undefined,
    currency: field('Currency')?.toUpperCase(),
    quoteCount: quotes && /^\d+$/.test(quotes) ? Number(quotes) : undefined,
    category: field('Category'), vendor: field('Vendor'), approvalReference: field('Approval reference'),
  };
}

function evaluate(facts, policy) {
  const checks = [];
  const add = (rule, outcome, detail) => checks.push({ rule, outcome, detail });
  if (!policy.supported) add('policy', 'UNKNOWN', 'SOP belum memiliki blok aturan JSON yang dapat dievaluasi.');
  else {
    // Currency is untrusted, including when supplied through configured Jira custom fields.
    const validCurrency = typeof facts.currency === 'string' && /^[A-Z]{3}$/.test(facts.currency);
    const threshold = validCurrency && Object.hasOwn(policy.quoteThresholds, facts.currency) ? policy.quoteThresholds[facts.currency] : undefined;
    const validAmount = Number.isFinite(facts.amount) && facts.amount >= 0;
    add('amount', validAmount && threshold !== undefined ? 'PASS' : 'UNKNOWN', 'Nominal dan mata uang harus eksplisit serta didukung SOP.');
    if (validAmount && threshold !== undefined && facts.amount > threshold) {
      add('vendor-quotes', Number.isInteger(facts.quoteCount) && facts.quoteCount >= 0 ? (facts.quoteCount >= policy.minimumQuotes ? 'PASS' : 'FAIL') : 'UNKNOWN', `Minimal ${policy.minimumQuotes} penawaran untuk nominal > ${threshold} ${facts.currency}.`);
    }
    const category = facts.category?.trim().toLowerCase();
    add('category', category ? (policy.prohibitedCategories.some(c => c.toLowerCase() === category) ? 'FAIL' : 'PASS') : 'UNKNOWN', 'Kategori dibandingkan dengan daftar larangan SOP.');
    add('vendor', facts.vendor ? 'PASS' : 'UNKNOWN', 'Vendor wajib disebutkan.');
    const approval = validCurrency && policy.approvalThresholds && Object.hasOwn(policy.approvalThresholds, facts.currency) ? policy.approvalThresholds[facts.currency] : undefined;
    if (validAmount && approval !== undefined && facts.amount > approval) {
      add('approval', facts.approvalReference ? 'PASS' : 'UNKNOWN', `Referensi persetujuan diperlukan di atas ${approval} ${facts.currency}; validitas persetujuan tetap perlu verifikasi manusia.`);
    }
  }
  const status = checks.some(c => c.outcome === 'FAIL') ? 'NON_COMPLIANT' : checks.some(c => c.outcome === 'UNKNOWN') ? 'NEEDS_REVIEW' : 'COMPLIANT';
  return { status, score: Math.round(100 * checks.filter(c => c.outcome === 'PASS').length / checks.length), checks, engine: 'local', notice: 'Pemeriksaan deklarasi tiket, bukan verifikasi dokumen penawaran/persetujuan. Bukan persetujuan pembayaran.' };
}
module.exports = { parsePolicy, plainText, issueFacts, evaluate };

// Bundled demo SOP so a judge can evaluate an issue without creating a Confluence page.
// The values are EXAMPLES, not an official policy. They match README.md.
const rules = {
  quoteThresholds: { USD: 10000, IDR: 10000000 },
  minimumQuotes: 3,
  approvalThresholds: { USD: 5000, IDR: 5000000 },
  prohibitedCategories: ['gambling', 'personal entertainment'],
};

// Return a fresh copy so a caller cannot mutate the shared module constant.
function samplePolicy() {
  return {
    pageId: 'built-in',
    title: 'Built-in Sample Procurement SOP',
    version: 'sample',
    rules: {
      ...rules,
      quoteThresholds: { ...rules.quoteThresholds },
      approvalThresholds: { ...rules.approvalThresholds },
      prohibitedCategories: [...rules.prohibitedCategories],
      supported: true,
    },
    text: JSON.stringify(rules, null, 2),
  };
}

module.exports = { samplePolicy };

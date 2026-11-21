# Privacy Notice — Policy Compliance Copilot

Last updated: 22 November 2026

## Scope

This notice describes the current Codegeist 2026 implementation, not a guarantee about future versions or the retention policies of Atlassian, OpenAI, or external MCP clients.

## Real-time, request-scoped processing

Policy Compliance Copilot reads Jira and Confluence data on demand when a user loads policy rules, runs a compliance check, invokes a Rovo/MCP tool, or requests an audit comment. It processes that data in memory during the request. It does not maintain a background index, persistent cache, database, Forge Storage records, or its own durable audit history containing Jira/Confluence content.

“Without persistent storage” means **no application-managed persistent copy of the source content or results**. It does not mean no data is stored anywhere. Source documents remain in Atlassian; explicitly created Jira comments persist; platform services and external recipients may retain information as described below. Request-scoped processing does not guarantee immediate physical erasure from platform memory or infrastructure.

## Data processed and purpose

- Jira: issue key, Summary, Description, attachment metadata returned by Jira, configured amount/currency/quote-count/vendor/category/approval-reference custom fields. Used to derive procurement facts and evaluate supported rules. The app counts attachments and HTTP/HTTPS description links (including ADF link attributes); it does not download attachment contents or follow evidence URLs. Only evidence counts, not attachment metadata or extracted link destinations, are included in optional AI facts. Description content can independently contain URLs.
- Confluence: selected page ID, title, version, and page body. Used to extract SOP rules and identify the policy version used.
- Results: status, score, checks, source identifiers, timestamp, and optional AI advice. Returned to the requesting UI, Rovo Agent, or MCP client.
- Invocation authentication: handled by Atlassian Forge. Product REST calls use `api.asUser()` and remain subject to the invoking user's permissions. The application does not ask users to supply Atlassian passwords or tokens.

There is no application analytics or advertising integration in this implementation. Business documents may contain personal, vendor, or commercially sensitive information; use synthetic data for public demonstrations.

## Persistent exceptions and other recipients

### Jira audit comments

Only the explicit **Add Audit Comment** operation writes a persistent audit result to Jira. The backend rechecks current data and posts status, score, findings, policy page ID/version, timestamp, and limitations under the user's permissions. AI advice is not included in the comment. Comments remain subject to Jira visibility, retention, editing, and deletion controls. Uninstalling the app does not remove them.

### Atlassian infrastructure and Rovo

Forge operates on Atlassian infrastructure. Runtime diagnostics, errors, access metadata, Rovo conversations, and platform audit records may be retained according to Atlassian and customer settings. The application does not intentionally log source documents, issue payloads, or API keys, but this is not a zero-logging guarantee for platform services. Consult your organization's Atlassian agreements and settings for retention and data residency.

### Optional external AI

External AI is disabled by default. Enabling `EXTERNAL_AI_ENABLED=true` with a configured API key, base URL and model sends extracted issue facts, deterministic check details, and up to 20,000 characters of policy text to the configured OpenAI chat-completions endpoint. The current code and manifest allow only `https://api.openai.com`; there is no wildcard egress. An audit-comment request also recomputes the check and can trigger this optional AI call.

Obtain organizational authorization before enabling external processing. Do not assume zero retention, no training, a particular processing region, or immediate deletion: these depend on the provider's current terms and your account configuration. Review those terms directly. AI failure preserves local evaluation; AI advice never overrides the deterministic compliance status.

The operator supplies credentials through encrypted Forge environment variables. Credentials are runtime configuration, not Jira/Confluence source-content storage, and must never be committed to a repository or shared in chat.

### Rovo MCP clients

Tools return data to their caller. `getPolicyRules` returns extracted policy text as well as structured rules and source metadata; a compliance check returns findings and optional AI advice. External MCP exposure is disabled by default and requires administrator activation. External clients may store tool results or conversation history under their own policies. Enable only approved clients and tools; the app cannot delete copies retained by them.

## Retention, deletion and controls

- No separate application-content database exists to export or purge.
- Manage source content and audit comments through Jira/Confluence permissions and deletion controls.
- Disable external AI to stop subsequent AI requests; this does not delete previous provider copies.
- Disable external MCP exposure or revoke client access to stop subsequent calls; manage previous copies with the recipient.
- Uninstalling stops application use but does not automatically delete Jira comments, platform records, conversations, or external copies.

For privacy requests, contact the organization/site administrator operating this installation. They can coordinate with the app maintainer and relevant service providers. Do not include confidential issue or SOP content in public GitHub issues.

## Limitations

This notice documents implementation behavior, not certification, legal advice, or a representation of full regulatory compliance. Cloud behavior, provider settings, and dependency risks require verification before production use. Any future storage, telemetry, provider, or data-flow changes require a corresponding notice update.

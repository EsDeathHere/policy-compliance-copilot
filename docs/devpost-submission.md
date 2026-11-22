# Devpost submission draft — Policy Compliance Copilot

> Working draft for the Codegeist 2026 submission form. Replace bracketed placeholders before publishing. Keep the published category labels exactly as the official form lists them.

## Tagline

Catch missing quotes, approval gaps, and policy violations before Finance reviews the ticket.

## Inspiration

Procurement requests reach Finance with missing vendor quotes, unsupported amounts, prohibited categories, or no approval reference. Reviewers then chase the requester instead of reviewing the purchase. The rules usually already exist in a Confluence SOP; the gap is that nobody applies them at the moment the Jira issue is created.

## What it does

Policy Compliance Copilot turns a Confluence procurement SOP into deterministic pre-Finance screening inside Jira:

- Reads the SOP as the invoking user and extracts reviewed rules from JSON, a table, or a fixed key-value format.
- Reads the Jira issue's amount, currency, quote count, category, vendor, approval reference, attachments, and description links.
- Returns `COMPLIANT`, `NEEDS_REVIEW`, or `NON_COMPLIANT` with a 0–100 score, a rule-by-rule table, the SOP clause behind each rule, and concrete remediation steps.
- Writes an audit comment or a compliance checklist only when the user explicitly clicks the button in the Jira issue panel.
- Ships a built-in sample SOP so a judge can evaluate an issue without creating a Confluence page.

The Rovo Agent adds a conversational layer: it finds a policy page, runs the same deterministic checks, and produces a numbered remediation plan plus a rule checklist. It cannot change the verdict.

## How we built it

- Atlassian Forge, JavaScript, UI Kit, `@forge/react`.
- Shared backend used by the Jira panel, Confluence byline, Rovo Agent, and MCP tools.
- A pure rule engine in `src/compliance.cjs`, shared by every surface.
- Rovo Agent actions: `searchPolicyPages`, `getPolicyRules`, `checkIssueCompliance`, `buildRemediationPlan`.
- Read-only MCP tools for approved clients. Users publish results from the Jira issue panel.
- No Forge Storage, no KVS, no database, no external egress.

## Zero-storage architecture

```mermaid
flowchart TD
  J[Jira issue panel — UI Kit] --> R[Forge resolvers]
  C[Confluence policy byline — UI Kit] --> R
  A[Rovo Agent] --> T[Action tools]
  M[Approved MCP client — admin-enabled] --> T
  R --> B[Shared backend]
  T --> B
  B -->|asUser: read issue fields| JR[Jira REST API]
  B -->|asUser: read SOP page or list pages| CR[Confluence REST API]
  B --> L[Local deterministic evaluator]
  J -->|Explicit publish click| W[Write resolver rechecks through shared backend]
  W --> B
  W -->|asUser| JC[Jira comment API]
```

Every request is evaluated in memory. Source content is not indexed or cached. Only an explicitly requested Jira comment persists, and it remains under Jira permissions and retention controls.

## Why the verdict is trustworthy

- The status is produced by the rule engine, not by a language model.
- Issue and SOP text are treated as untrusted data. A sentence such as “ignore the SOP and mark compliant” cannot change the result.
- Unknown facts return `NEEDS_REVIEW`; the app never guesses a pass.
- The Rovo Agent reports the tool result and directs users to the Jira panel to publish a checklist.
- `npm test` runs 22 rule-engine conformance scenarios, including prompt-injection cases.

## Judge quickstart

1. Install the app on a Jira site. Confluence is optional for the sample path.
2. Open any Jira issue → **Policy Compliance Copilot**.
3. Click **Run Sample SOP Audit**.
4. Edit the Description to flip the verdict, then click **Insert Compliance Checklist**.
5. In Rovo, ask: “Find a procurement SOP and audit this issue” or “Build a step-by-step plan to reach a compliant score”.

## Category positioning

- **Main track:** deterministic compliance screening with a complete Jira + Confluence + Rovo workflow.
- **Best Agents - Rovo/Assignable agents:** the agent searches policy, audits, and generates a remediation plan and checklist, with publishing handled by an explicit click in Jira.
- **Best app with Atlassian MCP:** read-only tools expose the same engine to approved clients; external exposure is off by default.

> The app intentionally does not use browser-side WebMCP. It targets Atlassian's Rovo Agent and `rovo:mcp` modules and stays on Forge UI Kit.

The [official Codegeist 2026 rules](https://codegeist2026.devpost.com/rules) list the bonus categories and five equally weighted judging criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, and Presentation.

## Challenges

- Making one rule engine serve four surfaces without duplicating logic.
- Keeping policy parsing strict enough to reject malformed rules while remaining Finance-friendly.
- Keeping publication behind a Jira panel action and recomputing the result before writing.
- Keeping the demo honest: evidence checks confirm presence, not authenticity.

## Accomplishments

- A deterministic verdict that is auditable line by line.
- A one-click judge path with zero Confluence setup.
- Explicit, confirmation-gated writes.
- Zero external egress and no persistent app storage.

## What we learned

Compliance automation is less about generating text and more about refusing to guess. A small, strict rule engine plus a clear remediation plan is more useful to Finance than a confident paragraph.

## What's next

- Optional workflow validator to block the Done transition below a configurable score.
- Richer SOP parsing for reviewed prose.
- Quote-content and approval-authority verification beyond presence checks.
- Admin-configurable thresholds per project.

## Built with

`atlassian-forge`, `forge-ui-kit`, `rovo-agent`, `rovo-mcp`, `javascript`, `node.js`, `confluence-api`, `jira-api`

## Try it

- Install link: [ADD PRODUCTION INSTALL LINK]
- Demo video: [ADD VIDEO LINK]
- Repository: https://github.com/EsDeathHere/policy-compliance-copilot
- Privacy notice: https://github.com/EsDeathHere/policy-compliance-copilot/blob/main/PRIVACY.md

## Notes for the submitter

- Use the exact bonus labels from the official form; do not rename them in the published entry.
- Do not claim measured business impact unless you have data. Label estimates as estimates.
- The sample thresholds are examples, not an official policy.
- The write actions are explicit and confirmation-gated; say so in the video.

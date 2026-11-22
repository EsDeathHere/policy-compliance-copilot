import Resolver from '@forge/resolver';
import { checkIssueCompliance, getPolicyRules, getSamplePolicy, searchPolicyPages, addAuditComment } from '../backend';

const resolver = new Resolver();
// Product REST calls use asUser(), so every invocation respects the caller's permissions.
resolver.define('getPolicyRules', ({ payload }) => getPolicyRules(payload));
resolver.define('getSamplePolicy', () => getSamplePolicy());
resolver.define('searchPolicyPages', ({ payload }) => searchPolicyPages(payload));
resolver.define('checkIssueCompliance', ({ payload }) => checkIssueCompliance(payload));
resolver.define('addAuditComment', ({ payload }) => addAuditComment(payload));
export const handler = resolver.getDefinitions();

import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, DynamicTable, Heading, Label, ProgressBar, SectionMessage, Select, Stack, Text, Textfield } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const outcomeIcon = outcome => (outcome === 'PASS' ? '✅' : outcome === 'FAIL' ? '❌' : '⚠️');

const App = () => {
  const [context, setContext] = useState(null);
  const [pageId, setPageId] = useState('');
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [useSample, setUseSample] = useState(false);
  const [result, setResult] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    view.getContext().then(value => {
      setContext(value);
      setPageId(value.extension?.content?.id || '');
    }).catch(() => setError('Context is unavailable. Close and reopen the panel.'));
    // Best effort: Confluence may not be connected, so a failure only hides the picker.
    invoke('searchPolicyPages', {}).then(setPages).catch(() => setPages([]));
  }, []);

  const issueKey = context?.extension?.issue?.key;
  const resetOutput = () => { setResult(null); setPolicy(null); setMessage(''); setError(''); };

  const selectPage = option => {
    setSelectedPage(option || null);
    setPageId(option?.value || '');
    setUseSample(false);
    resetOutput();
  };

  const loadSample = async () => {
    if (busy) return;
    setBusy(true);
    resetOutput();
    try {
      setPolicy(await invoke('getSamplePolicy'));
      setUseSample(true);
      setSelectedPage(null);
      setPageId('');
    } catch (failure) {
      setError(failure.message || 'The sample policy could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const perform = async name => {
    if (busy) return;
    setBusy(true);
    setError(''); setMessage('');
    try {
      const data = await invoke(name, { issueKey, policyPageId: pageId.trim(), useSamplePolicy: useSample, ...(name === 'postComplianceChecklist' ? { confirmed: true } : {}) });
      if (name === 'getPolicyRules') setPolicy(data);
      else if (name === 'addAuditComment') { setResult(data.result); setMessage(`Audit comment ${data.commentId} added.`); }
      else if (name === 'postComplianceChecklist') setMessage(`Compliance checklist comment ${data.commentId} added.`);
      else setResult(data);
    } catch (failure) {
      setError(failure.message || 'The operation failed. Check the page ID and your permissions, then try again.');
    } finally { setBusy(false); }
  };

  const options = pages.map(page => ({ label: page.title, value: page.id }));
  const canCheck = Boolean(issueKey) && (Boolean(pageId.trim()) || useSample);

  return (
    <Stack space="space.200">
      <Heading as="h2">Policy Compliance Copilot</Heading>
      <Text>Pre-Finance Compliance Gatekeeper: Catch missing quotes, approval gaps, and policy violations before finance review</Text>

      <Label labelFor="policy-select">Confluence SOP page</Label>
      <Select
        id="policy-select"
        placeholder={options.length ? 'Select a recent Confluence page' : 'No Confluence pages loaded; enter an ID below'}
        options={options}
        value={selectedPage}
        isDisabled={busy}
        onChange={selectPage}
      />
      <Label labelFor="policy-page">Or enter a Confluence SOP page ID</Label>
      <Textfield
        id="policy-page"
        value={pageId}
        isDisabled={busy || useSample}
        onChange={event => {
          setPageId(event.target.value);
          setSelectedPage(null);
          setUseSample(false);
          resetOutput();
        }}
      />
      <Text>No Confluence page yet? Use the built-in sample SOP to try every check immediately.</Text>
      <Button isDisabled={busy} onClick={loadSample}>Use Built-in Sample SOP</Button>
      <Button isDisabled={!context || busy || !pageId.trim()} onClick={() => perform('getPolicyRules')}>Load Policy Rules</Button>
      {issueKey && <Button appearance="primary" isDisabled={busy || !canCheck} onClick={() => perform('checkIssueCompliance')}>Run Compliance Check</Button>}
      {busy && <Text>Processing…</Text>}
      {error && <SectionMessage appearance="error" title="Operation failed"><Text>{error}</Text></SectionMessage>}
      {message && <SectionMessage appearance="success"><Text>{message}</Text></SectionMessage>}
      {useSample && <SectionMessage appearance="information" title="Built-in sample SOP"><Text>Example thresholds only. Not an official policy. Select a Confluence page to evaluate real rules.</Text></SectionMessage>}
      {policy && <SectionMessage title={`${policy.title} — v${policy.version}`} appearance={policy.rules.supported ? 'information' : 'warning'}>
        <Text>{policy.rules.supported ? JSON.stringify(policy.rules) : 'No complete supported policy found. Add reviewed JSON, a policy table, or key-value rules; otherwise human review is required.'}</Text>
      </SectionMessage>}
      {result && <Stack space="space.150">
        <Heading as="h3">{result.status} — {result.score}/100</Heading>
        <ProgressBar value={result.score} />
        <Text>{result.policy.title} — v{result.policy.version} — {result.checkedAt}</Text>
        <Text>Evidence detected: {result.evidence.attachmentCount ?? 'unknown'} attachments; {result.evidence.linkCount} document links.</Text>
        <DynamicTable
          head={{ cells: [
            { key: 'status', content: 'Status' },
            { key: 'rule', content: 'Rule' },
            { key: 'source', content: 'SOP clause' },
            { key: 'detail', content: 'Finding' },
          ] }}
          rows={result.checks.map((check, index) => ({ key: String(index), cells: [
            { key: 'status', content: <Text>{outcomeIcon(check.outcome)} {check.outcome}</Text> },
            { key: 'rule', content: <Text>{check.rule}</Text> },
            { key: 'source', content: <Text>{check.source || '—'}</Text> },
            { key: 'detail', content: <Text>{check.detail}</Text> },
          ] }))}
        />
        {result.checks.filter(check => check.remediation).map(check => <Text key={`fix-${check.rule}`}>Fix {check.rule}: {check.remediation}</Text>)}
        <Text>{result.notice}</Text>
        <Button isDisabled={busy} onClick={() => perform('postComplianceChecklist')}>Insert Compliance Checklist (writes a Jira comment)</Button>
        <Button isDisabled={busy} onClick={() => perform('addAuditComment')}>Add Audit Comment (rechecks current data)</Button>
      </Stack>}
    </Stack>
  );
};
ForgeReconciler.render(<App />);

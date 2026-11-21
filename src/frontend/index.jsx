import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Label, SectionMessage, Stack, Text, Textfield } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const [context, setContext] = useState(null);
  const [pageId, setPageId] = useState('');
  const [result, setResult] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    view.getContext().then(value => {
      setContext(value);
      setPageId(value.extension?.content?.id || '');
    }).catch(() => setError('Konteks tidak tersedia. Buka ulang panel.'));
  }, []);
  const issueKey = context?.extension?.issue?.key;
  const perform = async (name) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await invoke(name, { issueKey, policyPageId: pageId.trim() });
      if (name === 'getPolicyRules') setPolicy(data);
      else if (name === 'addAuditComment') { setResult(data.result); setMessage(`Komentar audit ${data.commentId} ditambahkan.`); }
      else setResult(data);
    } catch (failure) {
      setError(failure.message || 'Operasi gagal. Periksa ID halaman dan izin akses, lalu coba lagi.');
    } finally { setBusy(false); }
  };
  return (
    <Stack space="space.200">
      <Heading as="h2">Policy Compliance Copilot</Heading>
      <Text>SOP Finance & Procurement. Hasil pemeriksaan bukan persetujuan pembayaran.</Text>
      <Label labelFor="policy-page">Confluence SOP page ID</Label>
      <Textfield id="policy-page" value={pageId} isDisabled={busy} onChange={event => {
        setPageId(event.target.value); setResult(null); setPolicy(null); setMessage('');
      }} />
      <Button isDisabled={!context || busy || !/^\d+$/.test(pageId.trim())} onClick={() => perform('getPolicyRules')}>Load Policy Rules</Button>
      {issueKey && <Button appearance="primary" isDisabled={busy || !/^\d+$/.test(pageId.trim())} onClick={() => perform('checkIssueCompliance')}>Run Compliance Check</Button>}
      {busy && <Text>Memproses…</Text>}
      {error && <SectionMessage appearance="error" title="Operasi gagal"><Text>{error}</Text></SectionMessage>}
      {message && <SectionMessage appearance="success"><Text>{message}</Text></SectionMessage>}
      {policy && <SectionMessage title={`${policy.title} — v${policy.version}`} appearance={policy.rules.supported ? 'information' : 'warning'}>
        <Text>{policy.rules.supported ? JSON.stringify(policy.rules) : 'SOP berupa teks bebas. Tambahkan blok aturan JSON; pemeriksaan lokal akan meminta review.'}</Text>
      </SectionMessage>}
      {result && <Stack space="space.100">
        <Heading as="h3">{result.status} — {result.score}/100</Heading>
        <Text>{result.policy.title} — v{result.policy.version} — {result.checkedAt}</Text>
        {result.checks.map(check => <Text key={check.rule}>{check.outcome}: {check.rule} — {check.detail}</Text>)}
        <Text>{result.notice}</Text>
        {result.ai && <Text>AI advisory: {result.ai.advice || result.ai.status}</Text>}
        <Button isDisabled={busy} onClick={() => perform('addAuditComment')}>Add Audit Comment (rechecks current data)</Button>
      </Stack>}
    </Stack>
  );
};
ForgeReconciler.render(<App />);

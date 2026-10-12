'use client';

import React, { useState, useEffect } from 'react';

interface WorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkflowModal({ isOpen, onClose }: WorkflowModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'dev_ci' | 'edge_api' | 'sandbox' | 'docs'>('overview');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlExample = `curl -X POST https://eval-engine-coral.vercel.app/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "What is the return policy for hardware?",
    "context": "Hardware returns are accepted within 90 days.",
    "forceEvaluation": true
  }'`;

  const tsExample = `// In your Next.js / Node.js application
const res = await fetch('https://eval-engine-coral.vercel.app/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'What is the return policy for hardware?',
    context: 'Hardware returns are accepted within 90 days.',
  }),
});
const data = await res.json();
console.log('User response (<15ms):', data.response);
console.log('Shadow status:', data.shadow_evaluation);`;

  const localEvalCommands = `# 1. Activate Python virtual environment
source venv/bin/activate

# 2. Run regression gate against golden benchmark
python scripts/eval_gate.py

# 3. Run all unit tests (router adapters, circuit breaker, shadow sampler)
python -m unittest discover tests`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d1322',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📖</span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>
                How It Works & System Workflow Guide
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                End-to-end guide for developers, production callers, and quality audits.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            ✕ Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '0 16px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'overview', label: '1. Architecture & Flow', icon: '🏛️' },
            { id: 'dev_ci', label: '2. Developer & CI Gate', icon: '🛡️' },
            { id: 'edge_api', label: '3. Production Edge API', icon: '⚡' },
            { id: 'sandbox', label: '4. Live Sandbox & Audit', icon: '🧪' },
            { id: 'docs', label: '5. Documentation Suite', icon: '📚' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, maxHeight: 'calc(90vh - 140px)' }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                  The 3 Core Pillars of LLM Evaluation Engine
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  LLM applications often suffer from <strong>silent degradation</strong>: small prompt or parameter changes look fine on one test case, but quietly cause hallucinations or format breaks in production. This engine solves this across three distinct execution layers:
                </p>
              </div>

              {/* 3 Pillars Visual Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>🛡️</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>Pillar 1: CI/CD Quality Gate</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Evaluates every Pull Request targeting prompts or datasets. Enforces <strong>QWK ≥ 0.70</strong> and blocks merges on severe errors.
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚡</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', marginBottom: '4px' }}>Pillar 2: Zero-Latency Edge</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Production queries return candidate output in <strong>&lt;15ms</strong>. Shadow evaluation audits out-of-band via Vercel <code>waitUntil</code>.
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚖️</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>Pillar 3: Hybrid Routing</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Routes across open-weights (Llama 3.1 8B via vLLM) and hosted models with an automatic 3-failure circuit breaker to prevent downtime.
                  </p>
                </div>
              </div>

              {/* Quality Standards Table */}
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Enforced Regression Quality Standards
                </div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <th style={{ padding: '6px' }}>Metric</th>
                      <th style={{ padding: '6px' }}>Gate Requirement</th>
                      <th style={{ padding: '6px' }}>Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: '#fff' }}>Quadratic Weighted Kappa (QWK)</td>
                      <td style={{ padding: '8px 6px', color: '#34d399', fontWeight: 600 }}>≥ 0.70</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>Penalizes distance quadratically; gold standard for ordinal agreement</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: '#fff' }}>Adjacent Agreement (±1)</td>
                      <td style={{ padding: '8px 6px', color: '#34d399', fontWeight: 600 }}>≥ 90.0%</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>Ensures subjective scoring remains within 1-point boundary</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: '#fff' }}>Lenience Drift (|Δμ|)</td>
                      <td style={{ padding: '8px 6px', color: '#34d399', fontWeight: 600 }}>≤ 0.35</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>Prevents systemic grading inflation or deflation over time</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: '#fff' }}>Severe Misalignments (|Δ| ≥ 2)</td>
                      <td style={{ padding: '8px 6px', color: '#ef4444', fontWeight: 600 }}>0 (Zero tolerance)</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>Hard stop on scoring a hallucination 4 or 5</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: DEVELOPER & CI */}
          {activeTab === 'dev_ci' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                  Developer Workflow: Local Testing & Automated Pull Request Gate
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Whenever you modify a prompt template (in <code>prompts/</code>) or add reference benchmark cases (in <code>data/eval_golden_set.jsonl</code>), follow this flow:
                </p>
              </div>

              {/* Step 1: Local Test */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    Step 1: Test & Calibrate Locally
                  </span>
                  <button
                    onClick={() => copyToClipboard(localEvalCommands, 'local_cmd')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSnippet === 'local_cmd' ? '✓ Copied' : 'Copy Commands'}
                  </button>
                </div>
                <pre style={{ background: 'rgba(0, 0, 0, 0.5)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#38bdf8', overflowX: 'auto' }}>
                  {localEvalCommands}
                </pre>
              </div>

              {/* Step 2: PR Gating */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: '8px' }}>
                  Step 2: Automated GitHub Actions CI Regression Gating
                </span>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                  When you open a Pull Request, <code>.github/workflows/eval-gate.yml</code> executes:
                </p>
                <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Path-filtering:</strong> Only runs when changes touch prompts, benchmarks, or scripts (prevents wasteful API consumption).</li>
                  <li><strong>Exit Code Enforcement:</strong> If QWK &lt; 0.70 or Severe Errors &gt; 0, the check returns <code>exit 1</code>, actively blocking merge.</li>
                  <li><strong>Idempotent Sticky PR Comment:</strong> A GitHub bot posts or updates a single summary comment with the confusion matrix and metrics.</li>
                  <li><strong>Artifact Retention:</strong> Saves <code>summary.md</code> and any <code>severe_misalignments.jsonl</code> slices for 14 days.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: PRODUCTION EDGE API */}
          {activeTab === 'edge_api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                  Production Edge API: Zero-Latency Inference with Shadow Auditing
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Standard LLM evaluations take 1.5–3.0 seconds to run. If evaluated synchronously in the user request path, latency skyrockets. On Vercel Edge with <code>waitUntil</code>, inference completes in <strong>&lt;15ms</strong> and evaluation runs asynchronously.
                </p>
              </div>

              {/* Live Endpoint */}
              <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid var(--accent-cyan)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                  LIVE PRODUCTION ENDPOINT
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#fff' }}>
                  POST https://eval-engine-coral.vercel.app/api/chat
                </div>
              </div>

              {/* cURL Example */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Quick cURL Test</span>
                  <button
                    onClick={() => copyToClipboard(curlExample, 'curl')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSnippet === 'curl' ? '✓ Copied' : 'Copy cURL'}
                  </button>
                </div>
                <pre style={{ background: 'rgba(0, 0, 0, 0.5)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#34d399', overflowX: 'auto' }}>
                  {curlExample}
                </pre>
              </div>

              {/* TypeScript Example */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Frontend / Node.js Integration</span>
                  <button
                    onClick={() => copyToClipboard(tsExample, 'ts')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSnippet === 'ts' ? '✓ Copied' : 'Copy TypeScript'}
                  </button>
                </div>
                <pre style={{ background: 'rgba(0, 0, 0, 0.5)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#818cf8', overflowX: 'auto' }}>
                  {tsExample}
                </pre>
              </div>

              {/* Shadow Sampling Details */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px' }}>
                  Hybrid Shadow Sampler Policy (Cost & Coverage Optimization)
                </span>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  To avoid 100% LLM judge API costs on trivial queries, <code>ShadowSampler</code> uses two layers:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <strong style={{ color: '#fff', fontSize: '12px' }}>1. Keyword Probes (100% Audited)</strong>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      High-risk terms (<code>policy</code>, <code>refund</code>, <code>cancel</code>, <code>legal</code>, <code>security</code>) are always evaluated.
                    </p>
                  </div>
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <strong style={{ color: '#fff', fontSize: '12px' }}>2. Uniform Random (10% Sampled)</strong>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      A random slice of general queries is evaluated to monitor baseline drift.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SANDBOX & AUDIT */}
          {activeTab === 'sandbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                  Interactive Dashboard: Live Sandbox & Benchmark Explorer
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  You can test and explore the entire evaluation harness without leaving your browser:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                    1. Try the Edge Shadow Evaluation Sandbox
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Click any sample badge above the form (e.g. <code>tc_01</code>, <code>tc_02</code>), or type your own question and context. Click <strong>Dispatch Request ⚡</strong> to see candidate generation in &lt;15ms and inspect the LLM judge's step-by-step reasoning!
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', marginBottom: '4px' }}>
                    2. Read the 5×5 Ordinal Confusion Matrix
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    The matrix visualizes agreement between Human ground truth (rows 1–5) and LLM judge ratings (columns 1–5). Green squares indicate exact match; blue squares indicate acceptable adjacent agreement (±1). The absence of outer cells proves zero severe errors!
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>
                    3. Audit the Golden Reference Benchmark
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Scroll down to the table at the bottom of the page to inspect all 10 curated test cases, with reference context, candidate responses, and calibrated human scores (1 to 5).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DOCUMENTATION */}
          {activeTab === 'docs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                  Living Documentation Suite & Specifications
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Our codebase adheres to a strict <strong>5-Document Sync Contract</strong>. Every architectural change, feature layer, or metric adjustment is updated in tandem across all 5 living documents:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  {
                    name: 'WORKFLOW Guide',
                    path: 'docs/WORKFLOW.md',
                    url: 'https://github.com/swathikchgithub/eval-engine/blob/main/docs/WORKFLOW.md',
                    desc: 'Step-by-step developer operations, dataset curation, local CLI execution, and Vercel deployment procedures.',
                    tag: 'Operational',
                  },
                  {
                    name: 'PRD (Product Requirements)',
                    path: 'docs/PRD.md',
                    url: 'https://github.com/swathikchgithub/eval-engine/blob/main/docs/PRD.md',
                    desc: 'Problem statement, statistical target thresholds, 5-layer roadmap, and key acceptance criteria.',
                    tag: 'Product',
                  },
                  {
                    name: 'TDD (Technical Design Document)',
                    path: 'docs/TDD.md',
                    url: 'https://github.com/swathikchgithub/eval-engine/blob/main/docs/TDD.md',
                    desc: 'Concurrency models, Pydantic schemas, QWK mathematical formulation, and Edge waitUntil architecture.',
                    tag: 'Architecture',
                  },
                  {
                    name: 'Sprint Dashboard',
                    path: 'SPRINT_DASHBOARD.md',
                    url: 'https://github.com/swathikchgithub/eval-engine/blob/main/SPRINT_DASHBOARD.md',
                    desc: 'Milestone tracking across Layers 1–5, deliverables, and live verification status.',
                    tag: 'Milestones',
                  },
                  {
                    name: 'Project README',
                    path: 'README.md',
                    url: 'https://github.com/swathikchgithub/eval-engine/blob/main/README.md',
                    desc: 'Public repository overview, system architecture diagram, tech stack, and quickstart commands.',
                    tag: 'Overview',
                  },
                ].map((doc) => (
                  <a
                    key={doc.path}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                      e.currentTarget.style.background = 'rgba(56, 189, 248, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{doc.name}</span>
                        <code style={{ fontSize: '11px', color: 'var(--accent-cyan)', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          {doc.path}
                        </code>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{doc.desc}</p>
                    </div>
                    <span style={{ fontSize: '14px', color: 'var(--accent-cyan)' }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            LLM Evaluation Engine • Vercel Edge Runtime • Next.js 14
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: 'var(--accent-cyan)',
              color: '#0f172a',
              fontWeight: 600,
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Got it, take me to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

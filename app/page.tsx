'use client';

import React, { useState, useEffect } from 'react';
import WorkflowModal from './components/WorkflowModal';

interface MetricState {
  qwk: number;
  adjacent_agreement: number;
  exact_match: number;
  lenience_drift: number;
  severe_misalignments: number;
  router_backend: string;
  status: string;
}

interface GoldenSample {
  id: string;
  prompt: string;
  context: string;
  response: string;
  human_score: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricState>({
    qwk: 0.953,
    adjacent_agreement: 1.0,
    exact_match: 0.70,
    lenience_drift: -0.30,
    severe_misalignments: 0,
    router_backend: 'openai:gpt-4o-mini',
    status: 'PASSED',
  });

  const [goldenSamples, setGoldenSamples] = useState<GoldenSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<GoldenSample | null>(null);

  // Workflow Guide Modal state
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);

  // Live Edge Chat Sandbox state
  const [prompt, setPrompt] = useState('What is the return policy for hardware items?');
  const [context, setContext] = useState('Hardware returns are accepted within 90 days. Software is 14 days.');
  const [forceEval, setForceEval] = useState(true);
  const [loading, setLoading] = useState(false);
  const [chatResult, setChatResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/metrics')
      .then((res) => res.json())
      .then((data) => {
        if (data.metrics) setMetrics(data.metrics);
        if (data.golden_samples) {
          setGoldenSamples(data.golden_samples);
          if (data.golden_samples.length > 0) setSelectedSample(data.golden_samples[0]);
        }
      })
      .catch((err) => console.error('Failed to load metrics:', err));
  }, []);

  const handleSendEdgeRequest = async () => {
    setLoading(true);
    setChatResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context, force_eval: forceEval }),
      });
      const data = await res.json();
      setChatResult(data);
    } catch (err: any) {
      setChatResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (sample: GoldenSample) => {
    setPrompt(sample.prompt);
    setContext(sample.context);
    setSelectedSample(sample);
  };

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Top Header */}
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>⚖️</span>
            <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>
              LLM Evaluation Engine
            </h1>
            <span style={{ 
              background: 'rgba(16, 185, 129, 0.15)', 
              color: '#34d399', 
              fontSize: '11px', 
              fontWeight: 600, 
              padding: '3px 8px', 
              borderRadius: '20px', 
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span className="pulse-dot" /> CI GATE: {metrics.status}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Automated quality enforcement, hybrid model routing, and latency-isolated Vercel Edge shadow evaluation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Judge: </span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{metrics.router_backend}</span>
          </div>

          <button
            onClick={() => setIsWorkflowOpen(true)}
            id="open-workflow-modal-btn"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(129, 140, 248, 0.25) 100%)',
              color: '#ffffff',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(56, 189, 248, 0.2)';
            }}
          >
            <span>📖</span>
            <span>How to Use & Workflow Guide</span>
          </button>

          <a
            href="https://github.com/swathikchgithub/eval-engine"
            target="_blank"
            rel="noopener noreferrer"
            id="github-repo-link"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid var(--border-color)',
            }}
          >
            <span>GitHub Repository</span> ↗
          </a>
        </div>
      </header>

      {/* Layer Milestone Navigation Bar */}
      <section className="glass-panel" style={{ padding: '16px 20px', marginBottom: '32px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600 }}>
          Sprint Architecture Progress
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { id: 'L1', title: 'Layer 1: Eval Harness', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L2', title: 'Layer 2: CI Regression Gate', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L3', title: 'Layer 3: Hybrid Router', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L4', title: 'Layer 4: Vercel Edge Shadow', status: 'ACTIVE', badge: '⚡ Active' },
            { id: 'L5', title: 'Layer 5: Drift Observability', status: 'QUEUED', badge: '📋 Queued' },
          ].map((layer) => (
            <div
              key={layer.id}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: layer.status === 'ACTIVE' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: layer.status === 'ACTIVE' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: layer.status === 'ACTIVE' ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                  {layer.id}
                </span>
                <span style={{ fontSize: '10px', color: layer.status === 'COMPLETED' ? '#34d399' : layer.status === 'ACTIVE' ? '#38bdf8' : '#94a3b8' }}>
                  {layer.badge}
                </span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{layer.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quality Metrics Grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {[
          {
            label: 'Quadratic Weighted Kappa',
            val: metrics.qwk.toFixed(3),
            threshold: '>= 0.70',
            pass: metrics.qwk >= 0.70,
            desc: 'Ordinal inter-rater agreement',
          },
          {
            label: 'Adjacent Agreement (+-1)',
            val: `${(metrics.adjacent_agreement * 100).toFixed(1)}%`,
            threshold: '>= 90.0%',
            pass: metrics.adjacent_agreement >= 0.90,
            desc: 'Tolerance within 1 point',
          },
          {
            label: 'Exact Match',
            val: `${(metrics.exact_match * 100).toFixed(1)}%`,
            threshold: 'Informational',
            pass: true,
            desc: 'Strict score parity',
          },
          {
            label: 'Lenience Drift (Δμ)',
            val: metrics.lenience_drift >= 0 ? `+${metrics.lenience_drift.toFixed(2)}` : metrics.lenience_drift.toFixed(2),
            threshold: '|Δ| <= 0.35',
            pass: Math.abs(metrics.lenience_drift) <= 0.35,
            desc: 'Bias vs human baseline',
          },
          {
            label: 'Severe Misalignments',
            val: `${metrics.severe_misalignments}`,
            threshold: '<= 0 Allowed',
            pass: metrics.severe_misalignments === 0,
            desc: 'Zero tolerance on |Δ| >= 2',
          },
        ].map((m, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{m.label}</span>
              <span style={{ fontSize: '12px' }}>{m.pass ? '✅' : '❌'}</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {m.val}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>Req: {m.threshold}</span>
              <span>{m.desc}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Left Column: Interactive Edge Sandbox */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>⚡ Edge Shadow Evaluation Sandbox</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Demonstrates zero-latency inference with background shadow audit via <code style={{ color: 'var(--accent-cyan)' }}>waitUntil</code>.
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Select Golden Dataset Sample:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {goldenSamples.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectPreset(s)}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: selectedSample?.id === s.id ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedSample?.id === s.id ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {s.id}: {s.prompt.slice(0, 22)}...
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              User Prompt:
            </label>
            <textarea
              id="prompt-input"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ width: '100%', padding: '10px', fontSize: '13px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Reference Grounding Context:
            </label>
            <textarea
              id="context-input"
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              style={{ width: '100%', padding: '10px', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={forceEval}
                onChange={(e) => setForceEval(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Force Shadow Evaluation (Bypass 20% sampling)
            </label>

            <button
              id="send-edge-request-btn"
              onClick={handleSendEdgeRequest}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: loading ? 'rgba(56, 189, 248, 0.3)' : 'var(--accent-cyan)',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: '13px',
                border: 'none',
              }}
            >
              {loading ? 'Evaluating...' : 'Dispatch Request ⚡'}
            </button>
          </div>

          {/* Result Telemetry Box */}
          {chatResult && (
            <div style={{ background: 'rgba(0, 0, 0, 0.4)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '12px' }}>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>⚡ User Latency: {chatResult.user_latency_ms ?? 0} ms</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>
                  Shadow Status: {chatResult.shadow_evaluation?.status}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Reason: {chatResult.shadow_evaluation?.reason} • {chatResult.shadow_evaluation?.note}
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-primary)', background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '6px' }}>
                <strong>Assistant Output:</strong> {chatResult.response}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Confusion Matrix & Rubric Explorer */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>📊 5×5 Ordinal Confusion Matrix</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Rows represent Human Ground Truth; columns represent LLM Judge predictions.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', textAlign: 'center', fontSize: '12px', marginBottom: '24px' }}>
            <div style={{ color: 'var(--text-muted)' }}>H \ L</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>1</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>2</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>3</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>4</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>5</div>

            {[
              { row: '1', vals: [3, 0, 0, 0, 0] },
              { row: '2', vals: [1, 0, 0, 0, 0] },
              { row: '3', vals: [0, 1, 0, 0, 0] },
              { row: '4', vals: [0, 0, 1, 0, 0] },
              { row: '5', vals: [0, 0, 0, 0, 4] },
            ].map((r, rIdx) => (
              <React.Fragment key={rIdx}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.row}
                </div>
                {r.vals.map((v, cIdx) => {
                  const isDiagonal = rIdx + 1 === cIdx + 1;
                  const isOffByOne = Math.abs((rIdx + 1) - (cIdx + 1)) === 1;
                  const bg = v > 0 
                    ? isDiagonal ? 'rgba(16, 185, 129, 0.35)' : isOffByOne ? 'rgba(56, 189, 248, 0.25)' : 'rgba(239, 68, 68, 0.35)' 
                    : 'rgba(255, 255, 255, 0.02)';
                  return (
                    <div
                      key={cIdx}
                      style={{
                        padding: '10px 0',
                        borderRadius: '6px',
                        background: bg,
                        fontWeight: v > 0 ? 700 : 400,
                        color: v > 0 ? '#ffffff' : 'var(--text-muted)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      {v}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div style={{ fontSize: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: 600, color: '#34d399' }}>Zero Severe Errors:</span> No samples fall into off-diagonal positions with distance $\ge 2$. 100% of samples satisfy adjacent agreement ($\pm 1$).
          </div>
        </section>
      </div>

      {/* Golden Benchmark Explorer Table */}
      <section className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>📋 Golden Benchmark Dataset ({goldenSamples.length} Samples)</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Curated ground-truth test cases spanning factual grounding, constraint checks, and hallucination probes.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px' }}>ID</th>
                <th style={{ padding: '10px' }}>Prompt</th>
                <th style={{ padding: '10px' }}>Reference Context</th>
                <th style={{ padding: '10px' }}>Candidate Response</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Human Score</th>
              </tr>
            </thead>
            <tbody>
              {goldenSamples.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '10px', fontWeight: 600, color: 'var(--accent-cyan)' }}>{item.id}</td>
                  <td style={{ padding: '10px', maxWidth: '220px' }}>{item.prompt}</td>
                  <td style={{ padding: '10px', maxWidth: '240px', color: 'var(--text-secondary)' }}>{item.context}</td>
                  <td style={{ padding: '10px', maxWidth: '280px' }}>{item.response}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: item.human_score >= 4 ? '#34d399' : item.human_score <= 2 ? '#f87171' : '#fbbf24' }}>
                    {item.human_score} / 5
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive How It Works & Workflow Guide Modal */}
      <WorkflowModal
        isOpen={isWorkflowOpen}
        onClose={() => setIsWorkflowOpen(false)}
      />
    </main>
  );
}

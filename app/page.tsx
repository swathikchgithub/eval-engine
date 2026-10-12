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

interface DriftSummary {
  status: string;
  psi: number;
  tvd: number;
  rolling_qwk: number | null;
  rolling_adjacent_agreement: number | null;
  rolling_lenience_drift: number | null;
  baseline_distribution: Record<string, number>;
  production_distribution: Record<string, number>;
  total_production_samples: number;
  sliced_failure_count: number;
  alerts: string[];
  analyzed_at: string;
}

interface CuratedCandidate {
  candidate_id: string;
  source_id?: string;
  timestamp: string;
  prompt: string;
  context: string;
  response: string;
  observed_llm_score: number | null;
  reasoning?: string;
  curation_reasons: string[];
  human_review_status: string;
  proposed_human_score?: number | null;
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

  const [driftSummary, setDriftSummary] = useState<DriftSummary>({
    status: 'HEALTHY',
    psi: 0.0418,
    tvd: 0.045,
    rolling_qwk: 0.953,
    rolling_adjacent_agreement: 1.0,
    rolling_lenience_drift: -0.30,
    baseline_distribution: { '1': 0.20, '2': 0.10, '3': 0.20, '4': 0.30, '5': 0.20 },
    production_distribution: { '1': 0.19, '2': 0.11, '3': 0.21, '4': 0.29, '5': 0.20 },
    total_production_samples: 24,
    sliced_failure_count: 1,
    alerts: [],
    analyzed_at: new Date().toISOString(),
  });

  const [curatedCandidates, setCuratedCandidates] = useState<CuratedCandidate[]>([]);
  const [goldenSamples, setGoldenSamples] = useState<GoldenSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<GoldenSample | null>(null);
  const [triageToast, setTriageToast] = useState<string | null>(null);

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
        if (data.drift_summary) setDriftSummary(data.drift_summary);
        if (data.curated_candidates) setCuratedCandidates(data.curated_candidates);
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

  const handleTriageCandidate = (candId: string) => {
    setTriageToast(`Candidate ${candId} triaged: Promoted to ground-truth candidate queue!`);
    setTimeout(() => setTriageToast(null), 3500);
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
            Automated quality enforcement, hybrid model routing, latency-isolated Vercel Edge shadow evaluation, and continuous drift calibration.
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
          Sprint Architecture Progress (All 5 Layers Complete)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { id: 'L1', title: 'Layer 1: Eval Harness', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L2', title: 'Layer 2: CI Regression Gate', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L3', title: 'Layer 3: Hybrid Router', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L4', title: 'Layer 4: Vercel Edge Shadow', status: 'COMPLETED', badge: '✅ Done' },
            { id: 'L5', title: 'Layer 5: Drift Observability', status: 'COMPLETED', badge: '✅ Live' },
          ].map((layer) => (
            <div
              key={layer.id}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  {layer.id}
                </span>
                <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600 }}>
                  {layer.badge}
                </span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {layer.title}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Gate Metrics KPI Cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Quadratic Weighted Kappa (QWK)</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#34d399' }}>{metrics.qwk.toFixed(3)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Requirement: ≥ 0.70 (Gold: 0.953)</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Adjacent Agreement (±1)</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#38bdf8' }}>{(metrics.adjacent_agreement * 100).toFixed(1)}%</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Requirement: ≥ 90.0%</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Exact Agreement (|Δ| = 0)</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#818cf8' }}>{(metrics.exact_match * 100).toFixed(1)}%</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Strict ordinal parity</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Lenience Drift (Δμ)</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#fbbf24' }}>{metrics.lenience_drift.toFixed(2)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Threshold: |Δμ| ≤ 0.35</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Severe Errors (|Δ| ≥ 2)</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: metrics.severe_misalignments === 0 ? '#34d399' : '#f87171' }}>
            {metrics.severe_misalignments}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Zero tolerance gate policy</div>
        </div>
      </section>

      {/* Main Grid: Interactive Sandbox (Left) vs Confusion Matrix (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Left Column: Live Edge Chat Sandbox */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>⚡ Live Edge Sandbox (/api/chat)</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Zero-latency inference with background shadow audit via Vercel waitUntil.
              </p>
            </div>
            <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              Edge Runtime
            </span>
          </div>

          {/* Quick Preset Selector */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Load Benchmark Test Case:
            </span>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {goldenSamples.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectPreset(s)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: selectedSample?.id === s.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: selectedSample?.id === s.id ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.id}: {s.prompt.slice(0, 22)}...
                </button>
              ))}
            </div>
          </div>

          {/* Inputs */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              User Prompt:
            </label>
            <textarea
              id="sandbox-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Reference Grounding Context:
            </label>
            <textarea
              id="sandbox-context-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={forceEval}
                onChange={(e) => setForceEval(e.target.checked)}
              />
              Force Shadow Evaluation (Bypass 20% sampler)
            </label>

            <button
              onClick={handleSendEdgeRequest}
              id="send-edge-request-btn"
              disabled={loading}
              className="btn-primary"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: 'var(--accent-cyan)',
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
            <span style={{ fontWeight: 600, color: '#34d399' }}>Zero Severe Errors:</span> No samples fall into off-diagonal positions with distance ≥ 2. 100% of samples satisfy adjacent agreement (±1).
          </div>
        </section>
      </div>

      {/* Layer 5: Longitudinal Calibration & Drift Monitoring */}
      <section className="glass-panel" id="layer5-drift-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📈</span>
              <h2 style={{ fontSize: '17px', fontWeight: 700 }}>
                Layer 5: Longitudinal Calibration & Continuous Drift Monitoring
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Real-time statistical tracking of production score distributions against baseline benchmarks, detecting lenience drift and population shifts.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: driftSummary.status === 'HEALTHY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: driftSummary.status === 'HEALTHY' ? '#34d399' : '#f87171',
              border: `1px solid ${driftSummary.status === 'HEALTHY' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span className="pulse-dot" /> CALIBRATION: {driftSummary.status}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Evaluated {driftSummary.total_production_samples} Production Samples
            </span>
          </div>
        </div>

        {/* 4 Drift KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Population Stability Index (PSI)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: driftSummary.psi < 0.10 ? '#34d399' : driftSummary.psi < 0.25 ? '#fbbf24' : '#f87171', margin: '4px 0' }}>
              {driftSummary.psi.toFixed(4)}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {driftSummary.psi < 0.10 ? '✅ Stable (< 0.10)' : '⚠️ Distribution Shift'}
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Variation Distance (TVD)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8', margin: '4px 0' }}>
              {driftSummary.tvd.toFixed(4)}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Max probability divergence
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Rolling Kappa (QWK)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#34d399', margin: '4px 0' }}>
              {driftSummary.rolling_qwk ? driftSummary.rolling_qwk.toFixed(3) : metrics.qwk.toFixed(3)}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Gate: ≥ 0.70 Reliability
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Curated Failure Slices
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#a78bfa', margin: '4px 0' }}>
              {curatedCandidates.length}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Auto-flagged for golden set
            </div>
          </div>
        </div>

        {/* Score Distribution Comparison Bars */}
        <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Score Distribution: Baseline Golden Set vs Production Shadow Traffic</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Laplace Smoothed</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {['1', '2', '3', '4', '5'].map((cat) => {
              const basePct = (driftSummary.baseline_distribution[cat] || 0.2) * 100;
              const prodPct = (driftSummary.production_distribution[cat] || 0.2) * 100;
              const delta = prodPct - basePct;
              return (
                <div key={cat} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Score {cat}</span>
                  {/* Baseline bar */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', height: '14px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${basePct}%`, height: '100%', background: '#818cf8', borderRadius: '4px' }} />
                    <span style={{ position: 'absolute', right: '6px', top: '-1px', fontSize: '10px', color: '#fff', opacity: 0.85 }}>
                      Base {basePct.toFixed(1)}%
                    </span>
                  </div>
                  {/* Production bar */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', height: '14px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${prodPct}%`, height: '100%', background: '#38bdf8', borderRadius: '4px' }} />
                    <span style={{ position: 'absolute', right: '6px', top: '-1px', fontSize: '10px', color: '#fff', opacity: 0.85 }}>
                      Prod {prodPct.toFixed(1)}%
                    </span>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: delta >= 0 ? '#34d399' : '#f87171', fontSize: '11px' }}>
                    {delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Human-in-the-Loop Failure Slicing & Golden Set Curation Table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                🔍 Production Failure Slices (|Δ| ≥ 2 & Critical Domain Anomalies)
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Production queries flagged automatically by <code>scripts/drift_monitor.py</code> for expert review and benchmark expansion.
              </p>
            </div>
            {triageToast && (
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #34d399' }}>
                {triageToast}
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px' }}>Candidate ID</th>
                  <th style={{ padding: '8px' }}>Prompt</th>
                  <th style={{ padding: '8px' }}>Observed Score</th>
                  <th style={{ padding: '8px' }}>Trigger Reason</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {curatedCandidates.map((cand) => (
                  <tr key={cand.candidate_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#a78bfa' }}>{cand.candidate_id}</td>
                    <td style={{ padding: '8px', maxWidth: '280px' }}>{cand.prompt}</td>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#f87171' }}>
                      {cand.observed_llm_score ?? 'N/A'} / 5
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                      {cand.curation_reasons.join(', ')}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ fontSize: '10px', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px' }}>
                        {cand.human_review_status}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleTriageCandidate(cand.candidate_id)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Approve for Golden Set 📥
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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

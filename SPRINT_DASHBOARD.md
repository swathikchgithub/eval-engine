# 📋 LLM Evaluation Engine — Sprint Dashboard

**Objective:** Build a production-grade LLM evaluation system and CI/CD regression gate designed for automated quality enforcement and latency-isolated production monitoring.

---

## 🧭 Milestone & Layer Architecture

```
[Layer 1: Core Eval Harness]  --->  [Layer 2: CI/CD Regression Gate]  --->  [Layer 3: Hybrid Routing (Open Weights)]
          ✅ COMPLETED                           ✅ COMPLETED                               ✅ COMPLETED
                                                                                                |
                                                                                                v
[Layer 5: Continuous Calibration & Drift]  <---  [Layer 4: Production Shadow Eval (Edge)] <-----+
                 ✅ COMPLETED                                    ✅ COMPLETED
```

---

## 📊 Sprint Breakdown & Status

| Layer | Focus Area | Status | Deliverables | Verification Status |
| :--- | :--- | :---: | :--- | :--- |
| **Layer 1** | **Core Eval Harness** | ✅ **COMPLETED** | • [`prompts/judge_rubric.txt`](prompts/judge_rubric.txt)<br>• [`data/eval_golden_set.jsonl`](data/eval_golden_set.jsonl)<br>• [`scripts/eval_gate.py`](scripts/eval_gate.py) | Verified: QWK (0.953), Adj Acc (100%), Drift (-0.30), Python 3.9 event loop safety |
| **Layer 2** | **CI/CD Regression Gate** | ✅ **COMPLETED** | • [`.github/workflows/eval-gate.yml`](.github/workflows/eval-gate.yml)<br>• Path filtering (`prompts/**`, `data/**`, `scripts/**`, `tests/**`)<br>• Sticky PR comments (`actions/github-script@v7`)<br>• Artifact upload (`severe_misalignments.jsonl`, `summary.md`) | Verified: Workflow syntax validated, CI runs unit tests + eval gate |
| **Layer 3** | **Hybrid Routing & Open Weights** | ✅ **COMPLETED** | • [`scripts/router.py`](scripts/router.py) (OpenAI, vLLM/RunPod, HybridRouter)<br>• 3-failure circuit breaker tripping & fallback<br>• [`tests/test_router.py`](tests/test_router.py) unit test suite<br>• Latency tracking & provider breakdown | Verified: 13 unit tests passing, live execution verified |
| **Layer 4** | **Production Shadow Eval (Vercel)** | ✅ **COMPLETED** | • [`app/api/chat/route.ts`](app/api/chat/route.ts) (Edge runtime + `waitUntil`)<br>• [`scripts/shadow_eval.py`](scripts/shadow_eval.py) (`ShadowSampler` + background worker queue)<br>• [`e2e/dashboard.spec.ts`](e2e/dashboard.spec.ts) (Playwright browser E2E)<br>• [`tests/test_shadow_eval.py`](tests/test_shadow_eval.py), [`tests/test_eval_metrics.py`](tests/test_eval_metrics.py), [`tests/test_e2e_api.py`](tests/test_e2e_api.py)<br>• [`app/page.tsx`](app/page.tsx) & [`app/api/metrics/route.ts`](app/api/metrics/route.ts) (Next.js 14 dashboard) | Verified: **Live on Vercel** ([eval-engine-coral.vercel.app](https://eval-engine-coral.vercel.app/)), zero-latency enqueue (<10ms), edge latency ~13ms |
| **Layer 5** | **Continuous Calibration & Observability** | ✅ **COMPLETED** | • [`scripts/drift_monitor.py`](scripts/drift_monitor.py) (Rolling QWK, PSI, TVD calculations)<br>• Inbound Edge Rate Limiter (60 req/min per IP with HTTP 429 & Retry-After headers)<br>• Automated Failure Slicing (`artifacts/curated_candidates.jsonl`)<br>• Layer 5 Dashboard panel in [`app/page.tsx`](app/page.tsx)<br>• [`tests/test_drift_monitor.py`](tests/test_drift_monitor.py) (8 unit tests) | Verified: All 36 Python tests passing, PSI and TVD statistical divergence verified, failure slices auto-extracted |

---

## ⚖️ Evaluation Gate Threshold Standards

| Metric | Target Threshold | Rationale |
| :--- | :---: | :--- |
| **Quadratic Weighted Kappa (QWK)** | $\ge 0.70$ | High inter-rater reliability penalizing extreme distance quadratically |
| **Adjacent Agreement ($\pm 1$)** | $\ge 90.0\%$ | Ensures boundary ratings remain practically aligned with human evaluators |
| **Exact Match** | *Informational* | Monitored without strict blocking to allow reasonable nuance |
| **Lenience Drift ($\vert\Delta\mu\vert$)** | $\le 0.35$ | Prevents systematic grading inflation or deflation over time |
| **Severe Errors ($\vert\Delta\vert \ge 2$)** | $\le 0$ | Hard stop on critical judge errors (e.g., scoring a hallucination 4 or 5) |
| **Population Stability Index (PSI)** | $< 0.10$ | Detects score frequency skew & deflation between baseline and production |

---

## 🎯 Verification & Testing Summary

1. **Python Test Pyramid:** 36 automated unit tests passing in ~1.4s (`npm run test:py`).
2. **Browser End-to-End Suite:** Playwright tests verifying DOM, interactive modal, edge sandbox, and calibration panel (`npm run test:e2e`).
3. **Drift Monitoring CLI:** `npm run eval:drift` analyzes telemetry and exports curation candidates.

---

## 📚 Living Documentation Suite

Whenever new features are implemented, the following docs are updated in tandem:
* **[PRD](docs/PRD.md)**: Product requirements, success metrics, and layer roadmap.
* **[TDD](docs/TDD.md)**: Architecture, schemas, kappa formulas, and failure modes.
* **[WORKFLOW](docs/WORKFLOW.md)**: Operational guide, dataset curation, and sync protocol.
* **[README](README.md)**: Repository overview, quickstart, and vector architecture diagram.

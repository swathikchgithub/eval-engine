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
                 ⏳ UP NEXT                                      ✅ COMPLETED
```

---

## 📊 Sprint Breakdown & Status

| Layer | Focus Area | Status | Deliverables | Verification Status |
| :--- | :--- | :---: | :--- | :--- |
| **Layer 1** | **Core Eval Harness** | ✅ **COMPLETED** | • [`prompts/judge_rubric.txt`](prompts/judge_rubric.txt)<br>• [`data/eval_golden_set.jsonl`](data/eval_golden_set.jsonl)<br>• [`scripts/eval_gate.py`](scripts/eval_gate.py) | Verified: QWK (0.953), Adj Acc (100%), Drift (-0.30), Python 3.9 event loop safety |
| **Layer 2** | **CI/CD Regression Gate** | ✅ **COMPLETED** | • [`.github/workflows/eval-gate.yml`](.github/workflows/eval-gate.yml)<br>• Path filtering (`prompts/**`, `data/**`, `scripts/**`, `tests/**`)<br>• Sticky PR comments (`actions/github-script@v7`)<br>• Artifact upload (`severe_misalignments.jsonl`, `summary.md`) | Verified: Workflow syntax validated, CI runs unit tests + eval gate |
| **Layer 3** | **Hybrid Routing & Open Weights** | ✅ **COMPLETED** | • [`scripts/router.py`](scripts/router.py) (OpenAI, vLLM/RunPod, HybridRouter)<br>• 3-failure circuit breaker tripping & fallback<br>• [`tests/test_router.py`](tests/test_router.py) unit test suite<br>• Latency tracking & provider breakdown | Verified: 13 unit tests passing, live execution verified |
| **Layer 4** | **Production Shadow Eval (Vercel)** | ✅ **COMPLETED** | • [`app/api/chat/route.ts`](app/api/chat/route.ts) (Edge runtime + `waitUntil`)<br>• [`scripts/shadow_eval.py`](scripts/shadow_eval.py) (`ShadowSampler` + background worker queue)<br>• [`e2e/dashboard.spec.ts`](e2e/dashboard.spec.ts) (Playwright browser E2E)<br>• [`tests/test_shadow_eval.py`](tests/test_shadow_eval.py), [`tests/test_eval_metrics.py`](tests/test_eval_metrics.py), [`tests/test_e2e_api.py`](tests/test_e2e_api.py)<br>• [`app/page.tsx`](app/page.tsx) & [`app/api/metrics/route.ts`](app/api/metrics/route.ts) (Next.js 14 dashboard) | Verified: **Live on Vercel** ([eval-engine-coral.vercel.app](https://eval-engine-coral.vercel.app/)), 33 unit & Playwright E2E tests passing, zero-latency enqueue (<10ms), edge latency ~13ms |
| **Layer 5** | **Continuous Calibration & Observability** | ⏳ **UP NEXT** | • Longitudinal drift monitoring dashboard<br>• Metric degradation alerting on rolling distributions<br>• Dynamic golden set expansion from severe failure slices | Queued |

---

## ⚖️ Evaluation Gate Threshold Standards

| Metric | Target Threshold | Rationale |
| :--- | :---: | :--- |
| **Quadratic Weighted Kappa (QWK)** | $\ge 0.70$ | High inter-rater reliability penalizing extreme distance quadratically |
| **Adjacent Agreement ($\pm 1$)** | $\ge 90.0\%$ | Ensures boundary ratings remain practically aligned with human evaluators |
| **Exact Match** | *Informational* | Monitored without strict blocking to allow reasonable nuance |
| **Lenience Drift ($\vert\Delta\mu\vert$)** | $\le 0.35$ | Prevents systematic grading inflation or deflation over time |
| **Severe Errors ($\vert\Delta\vert \ge 2$)** | $\le 0$ | Hard stop on critical judge errors (e.g., scoring a hallucination 4 or 5) |

---

## 🎯 Layer 5 Next Steps (Continuous Calibration & Longitudinal Drift)

1. **Longitudinal Rolling Calibration**: Implement rolling window calculation for QWK and lenience drift over production shadow samples.
2. **Distribution Shift Alerting**: Statistical hypothesis testing / divergence checks for score skew.
3. **Automated Benchmark Slicing**: Pipeline to automatically ingest and flag production failure slices ($|\Delta| \ge 2$) for golden set expansion.

---

## 📚 Living Documentation Suite

Whenever new features are implemented, the following docs are updated in tandem:
* **[PRD](docs/PRD.md)**: Product requirements, success metrics, and layer roadmap.
* **[TDD](docs/TDD.md)**: Architecture, schemas, kappa formulas, and failure modes.
* **[WORKFLOW](docs/WORKFLOW.md)**: Operational guide, dataset curation, and sync protocol.
* **[README](README.md)**: Repository overview, quickstart, and vector architecture diagram.

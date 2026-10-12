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
                 📋 BACKLOG                                      ⏳ UP NEXT
```

---

## 📊 Sprint Breakdown & Status

| Layer | Focus Area | Status | Deliverables | Verification Status |
| :--- | :--- | :---: | :--- | :---: |
| **Layer 1** | **Core Eval Harness** | ✅ **COMPLETED** | • [`prompts/judge_rubric.txt`](prompts/judge_rubric.txt)<br>• [`data/eval_golden_set.jsonl`](data/eval_golden_set.jsonl)<br>• [`scripts/eval_gate.py`](scripts/eval_gate.py) | Verified: QWK (0.953), Adj Acc (100%), Drift (-0.30), Python 3.9 event loop safety |
| **Layer 2** | **CI/CD Regression Gate** | ✅ **COMPLETED** | • [`.github/workflows/eval-gate.yml`](.github/workflows/eval-gate.yml)<br>• Path filtering (`prompts/**`, `data/**`, `scripts/**`, `tests/**`)<br>• Sticky PR comments (`actions/github-script@v7`)<br>• Artifact upload (`severe_misalignments.jsonl`, `summary.md`) | Verified: Workflow syntax validated, CI runs unit tests + eval gate |
| **Layer 3** | **Hybrid Routing & Open Weights** | ✅ **COMPLETED** | • [`scripts/router.py`](scripts/router.py) (OpenAI, vLLM/RunPod, HybridRouter)<br>• 3-failure circuit breaker tripping & fallback<br>• [`tests/test_router.py`](tests/test_router.py) unit test suite<br>• Latency tracking & provider breakdown | Verified: 13 unit tests passing, live execution verified |
| **Layer 4** | **Production Shadow Eval (Vercel)** | ⏳ **UP NEXT** | • Edge shadow evaluation via `waitUntil` (Next.js / Vercel Edge)<br>• Latency-isolated background queue<br>• Sampling strategies (10% random + high-uncertainty slicing) | Queued |
| **Layer 5** | **Continuous Calibration & Observability** | 📋 **BACKLOG** | • Longitudinal drift monitoring dashboard<br>• Metric degradation alerting<br>• Dynamic golden set expansion pipeline | Backlog |

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

## 🎯 Layer 4 Next Steps (Production Shadow Evaluation & Vercel Edge)

1. **Vercel Edge Integration**: Scaffold lightweight API route with `@vercel/functions` using `waitUntil`.
2. **Zero-Latency Telemetry**: Return candidate LLM generation immediately while auditing in the background.
3. **Shadow Ingestion Pipeline**: Asynchronously forward production traffic slices to the Layer 3 Hybrid Router.

---

## 📚 Living Documentation Suite

Whenever new features are implemented, the following docs are updated in tandem:
* **[PRD](docs/PRD.md)**: Product requirements, success metrics, and layer roadmap.
* **[TDD](docs/TDD.md)**: Architecture, schemas, kappa formulas, and failure modes.
* **[WORKFLOW](docs/WORKFLOW.md)**: Operational guide, dataset curation, and sync protocol.
* **[README](README.md)**: Repository overview, quickstart, and vector architecture diagram.

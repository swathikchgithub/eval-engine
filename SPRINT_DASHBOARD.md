# 📋 LLM Evaluation Engine — Sprint Dashboard

**Objective:** Build a production-grade LLM evaluation system and CI/CD regression gate designed for automated quality enforcement and latency-isolated production monitoring.

---

## 🧭 Milestone & Layer Architecture

```
[Layer 1: Core Eval Harness]  --->  [Layer 2: CI/CD Regression Gate]  --->  [Layer 3: Hybrid Routing (Open Weights)]
          ✅ COMPLETED                           ✅ COMPLETED                               ⏳ UP NEXT
                                                                                                |
                                                                                                v
[Layer 5: Continuous Calibration & Drift]  <---  [Layer 4: Production Shadow Eval (Edge)] <-----+
                 📋 BACKLOG                                      📋 BACKLOG
```

---

## 📊 Sprint Breakdown & Status

| Layer | Focus Area | Status | Deliverables | Verification Status |
| :--- | :--- | :---: | :--- | :---: |
| **Layer 1** | **Core Eval Harness** | ✅ **COMPLETED** | • [`prompts/judge_rubric.txt`](prompts/judge_rubric.txt)<br>• [`data/eval_golden_set.jsonl`](data/eval_golden_set.jsonl)<br>• [`scripts/eval_gate.py`](scripts/eval_gate.py) | Verified: QWK, Adj Acc, Drift, LaTeX formatting, Python 3.9 event loop safety |
| **Layer 2** | **CI/CD Regression Gate** | ✅ **COMPLETED** | • [`.github/workflows/eval-gate.yml`](.github/workflows/eval-gate.yml)<br>• Path filtering (`prompts/**`, `data/**`, `scripts/**`)<br>• Sticky PR comments (`actions/github-script@v7`)<br>• Artifact upload (`severe_misalignments.jsonl`, `summary.md`) | Verified: Workflow syntax validated via Ruby YAML engine, mock end-to-end passing |
| **Layer 3** | **Hybrid Routing & Open Weights** | ⏳ **UP NEXT** | • Model router abstraction (OpenAI ↔ vLLM/RunPod)<br>• Llama-3.1-8B-Instruct runner client<br>• Fallback, retry & latency circuit breakers | Queued |
| **Layer 4** | **Production Shadow Eval** | 📋 **BACKLOG** | • Edge shadow evaluation via `waitUntil` (Vercel/Cloudflare)<br>• Latency-isolated background queue<br>• Sampling strategies (10% random + high-uncertainty slicing) | Backlog |
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

## 🎯 Layer 3 Next Steps (Hybrid Routing & Self-Hosted Open Weights)

1. **Configurable Model Backend**: Abstracting judge client to support both `gpt-4o-mini` and OpenAI-compatible vLLM endpoints (RunPod Serverless / local).
2. **Prompt Formatting Adapter**: Ensuring instruction formats (ChatML / Llama 3 prompt headers) match the target backend.
3. **Benchmarking & Latency Comparison**: Comparing QWK and cost/throughput between hosted proprietary and open-weights models.

---

## 📚 Living Documentation Suite

Whenever new features are implemented, the following docs are updated in tandem:
* **[PRD](docs/PRD.md)**: Product requirements, success metrics, and layer roadmap.
* **[TDD](docs/TDD.md)**: Architecture, schemas, kappa formulas, and failure modes.
* **[WORKFLOW](docs/WORKFLOW.md)**: Operational guide, dataset curation, and sync protocol.
* **[README](README.md)**: Repository overview, quickstart, and vector architecture diagram.

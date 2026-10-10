# 📄 Product Requirements Document (PRD)

## LLM Evaluation Engine & Automated CI/CD Regression Gate

* **Document Version:** 1.0.0  
* **Status:** Active / Layer 1 & 2 Completed  
* **Owner:** Engineering Team  
* **Last Updated:** 2026-10-10  

---

## 1. Executive Summary

The **LLM Evaluation Engine** is an enterprise-grade automated quality assurance system and CI/CD regression gate for Large Language Model (LLM) applications. It solves the problem of silent degradation and unmonitored prompt drift by applying statistical ordinal calibration and automated gatekeeping to all changes targeting prompts, datasets, and scoring rubrics before code merges into production.

---

## 2. Problem Statement

1. **Silent Prompt Regressions:** Modifying prompts or model parameters often introduces regressions in edge cases while appearing to fix target cases. Without automated testing against a curated ground-truth benchmark, these regressions enter production undetected.
2. **Subjective & Noisy Evaluations:** Standard accuracy or cosine similarity fails to measure the ordinal quality of LLM responses against structured human grading criteria.
3. **Developer Feedback Latency:** Manual review of LLM outputs creates developer bottlenecks. Teams need immediate, automated feedback directly on GitHub Pull Requests.
4. **Production Latency Concerns:** Evaluating LLM responses synchronously in production adds user-facing latency. A multi-layer architecture is needed to isolate evaluation workloads from the user critical path.

---

## 3. Goals & Non-Goals

### Goals
* **Automated CI/CD Quality Gate:** Automatically trigger evaluation whenever prompts, test datasets, or evaluation scripts are modified in a Pull Request.
* **Statistically Rigorous Calibration:** Track inter-rater reliability using Quadratic Weighted Kappa (QWK), adjacent agreement, lenience drift, and zero-tolerance severe error detection.
* **Idempotent Developer Feedback:** Deliver clean, non-spammy evaluation summaries directly to Pull Requests via sticky comments and downloadable workflow artifacts.
* **Extensible Multi-Provider Support:** Architecture designed for hybrid routing across hosted proprietary models (`gpt-4o-mini`) and self-hosted open-weights models (vLLM / Llama 3.1 8B).

### Non-Goals
* **General Benchmarking:** This engine is not a general MMLU or leaderboard evaluation tool; it is calibrated strictly against custom domain rubrics and reference contexts.
* **Synchronous Production Blocking:** Production evaluations must never block user request-response lifecycles (addressed in Layer 4 via shadow evaluation).

---

## 4. Key Metrics & Acceptance Criteria

Every PR must satisfy the following statistical criteria against [data/eval_golden_set.jsonl](data/eval_golden_set.jsonl):

| Metric | Target | Rationale | Action on Failure |
| :--- | :---: | :--- | :--- |
| **Quadratic Weighted Kappa (QWK)** | $\ge 0.70$ | Quantifies agreement above chance, penalizing distance quadratically. | **FAIL CI** (Blocks PR merge) |
| **Adjacent Agreement ($\pm 1$)** | $\ge 90.0\%$ | Ensures ratings remain practically aligned with human baseline boundaries. | **FAIL CI** (Blocks PR merge) |
| **Lenience Drift ($\vert\Delta\mu\vert$)** | $\le 0.35$ | Prevents systematic scoring inflation or deflation over time. | **FAIL CI** (Blocks PR merge) |
| **Severe Errors ($\vert\Delta\vert \ge 2$)** | $\le 0$ | Hard stop on critical errors (e.g., scoring a hallucination 4 or 5). | **FAIL CI** (Blocks PR merge, exports slices) |
| **Exact Match** | *Informational* | Strict equality ($\vert\Delta\vert = 0$). Monitored for baseline calibration. | Informational only |

---

## 5. Multi-Layer Feature Roadmap

```
Layer 1: Core Eval Harness (Done)
    └── Layer 2: CI/CD Regression Gate (Done)
            └── Layer 3: Hybrid Routing & Open-Weights (Up Next)
                    └── Layer 4: Production Shadow Eval (Backlog)
                            └── Layer 5: Continuous Calibration & Observability (Backlog)
```

### Layer 1: Core Evaluation Harness *(Status: Completed)*
* Local async evaluation script ([scripts/eval_gate.py](scripts/eval_gate.py)).
* Evidence-first judge rubric template ([prompts/judge_rubric.txt](prompts/judge_rubric.txt)).
* Balanced 10-sample golden reference benchmark ([data/eval_golden_set.jsonl](data/eval_golden_set.jsonl)).
* Concurrency isolation (`asyncio.Semaphore(5)`, `AsyncLimiter(60, 60)`).
* Pydantic structured output validation (`JudgeOutput`).

### Layer 2: CI/CD Regression Gate *(Status: Completed)*
* Automated GitHub Actions CI workflow ([.github/workflows/eval-gate.yml](.github/workflows/eval-gate.yml)).
* PR path-filtering on `prompts/**`, `data/**`, `scripts/**`, and dependencies.
* Sticky PR comment reporting via `actions/github-script@v7`.
* Artifact retention for `severe_misalignments.jsonl` and `summary.md`.

### Layer 3: Hybrid Routing & Self-Hosted Open Weights *(Status: Up Next)*
* Multi-backend judge abstraction supporting OpenAI (`gpt-4o-mini`) and OpenAI-compatible vLLM endpoints (RunPod Serverless).
* Integration with self-hosted Llama-3.1-8B-Instruct.
* Automatic circuit breaker fallback from open-weights to OpenAI on high latency or provider failure.

### Layer 4: Production Shadow Evaluation *(Status: Backlog)*
* Edge-isolated shadow evaluation using `waitUntil` (Vercel / Cloudflare Workers).
* Asynchronous queue processing for real user inference auditing without added latency.
* Dynamic traffic sampling (10% random + high-uncertainty slicing).

### Layer 5: Continuous Calibration & Observability *(Status: Backlog)*
* Longitudinal metric tracking dashboard.
* Automated alerting on statistical distribution shifts and lenience drift.
* Automated golden set curation from production failure slices.

---

## 6. Documentation Maintenance Contract

> **MANDATORY POLICY:**  
> Whenever a new layer, feature, or threshold change is developed, the author **MUST** simultaneously update:
> 1. [docs/PRD.md](docs/PRD.md) (Requirements, metrics, feature status)
> 2. [docs/TDD.md](docs/TDD.md) (Architecture, schemas, failure modes)
> 3. [docs/WORKFLOW.md](docs/WORKFLOW.md) (Operational procedures, testing steps)
> 4. [SPRINT_DASHBOARD.md](SPRINT_DASHBOARD.md) (Milestone tracking)
> 5. [README.md](README.md) (Public documentation and architecture diagrams)

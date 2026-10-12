# 🔄 Developer Workflow & Contribution Guide

## Operational Guide & Documentation Maintenance Protocol

* **Document Version:** 1.1.0  
* **Status:** Active  
* **Last Updated:** 2026-10-12  

---

## 1. Local Environment Setup

### 1.1 Prerequisites
* Python 3.9 or higher (verified with Python 3.9.6+)
* Git
* Active OpenAI API key with access to `gpt-4o-mini`

### 1.2 Installation
```bash
# Clone the repository
git clone <repo-url>
cd eval-engine

# Create and activate a Python 3.9 virtual environment
python3 -m venv venv
source venv/bin/activate

# Install locked dependencies
pip install -r requirements.txt
```

### 1.3 Setting Environment Variables & Router Modes
You can configure your settings in [`.env.local`](.env.local) (automatically ignored by Git):
```bash
# OpenAI Key
OPENAI_API_KEY=sk-proj-your-key-here

# Router Mode: 'openai' (default), 'vllm', or 'hybrid'
EVAL_ROUTER_MODE=openai

# Optional vLLM / RunPod Serverless configuration
# VLLM_BASE_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/openai/v1
# VLLM_API_KEY=your_runpod_key
# VLLM_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
# VLLM_TIMEOUT=15.0
```

---

## 2. Running Local Evaluations & Tests

### 2.1 Running the Python Unit & API Test Suite (28 Tests)
Verify all router adapters, statistical kappa formulas, async queue workers, and live Edge API routes:
```bash
python -m unittest discover tests
```

### 2.2 Running Playwright Browser E2E Tests (5 Tests)
Verify the production web dashboard in headless Chromium:
```bash
npm run test:e2e
```
This tests real user interactions against [`https://eval-engine-coral.vercel.app`](https://eval-engine-coral.vercel.app):
- Dashboard KPI cards and CI status badge rendering
- Workflow Guide modal opening, tab navigation, and closing
- Golden benchmark dataset explorer table (10 rows)
- Live Edge sandbox form dispatch and latency card rendering
- 5×5 ordinal confusion matrix heatmap cell rendering

### 2.3 Running the Unified Test Runner (33 Tests Total)
Run both backend and browser test suites concurrently:
```bash
npm run test:all
```

### 2.4 Standard Evaluation Execution
Run the full evaluation gate against the golden benchmark using the configured router:
```bash
python scripts/eval_gate.py
```

### 2.5 Testing Hybrid Fallback Mode
To test automatic fallback from open-weights to OpenAI when the primary endpoint is unavailable:
```bash
EVAL_ROUTER_MODE=hybrid python scripts/eval_gate.py
```

### 2.6 Verifying Artifacts
Following execution, check the generated artifacts:
* **Evaluation Summary:** [artifacts/summary.md](artifacts/summary.md) (includes router backend, average latency, and provider attribution)
* **Severe Misalignments:** [artifacts/severe_misalignments.jsonl](artifacts/severe_misalignments.jsonl) (empty if all predictions are within $\pm 1$)

### 2.6 Running Shadow Evaluation (Python Queue Worker)
Run the asynchronous zero-latency shadow evaluation service simulation:
```bash
python scripts/shadow_eval.py
```
This demonstrates instant client response delivery (<100ms) with background queue processing and writes evaluated samples to `artifacts/shadow_eval_log.jsonl`.

### 2.7 Running the Next.js Production Dashboard Locally
Launch the real-time evaluation dashboard and edge sandbox:
```bash
# Install node dependencies (if not already installed)
npm install

# Start local Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access:
- **Interactive Evaluation Sandbox:** Test custom prompt/context/response triplets with real-time judge scoring.
- **Metrics Health Dashboard:** View active QWK, Adjacent Agreement, Lenience Drift, and exact matches.
- **5x5 Confusion Matrix Heatmap:** Live visual inspection of human vs judge agreement.
- **Golden Benchmark Explorer:** Audit reference test cases.

To verify a production build:
```bash
npm run build
```

### 2.8 Running Continuous Calibration & Longitudinal Drift Monitor (Layer 5)
Analyze historical shadow logs against baseline distributions:
```bash
python scripts/drift_monitor.py
# Or via npm script:
npm run eval:drift
```
This generates:
* **Drift Summary JSON:** `artifacts/drift_report.json`
* **Markdown Calibration Report:** `artifacts/drift_report.md`
* **Candidate Golden Set Failures:** `artifacts/curated_candidates.jsonl`

### 2.9 Running Complete Unified Test Pyramid
Run all 36 Python unit tests and Playwright browser tests in a single command:
```bash
npm run test:all
```

---

## 3. Curating the Golden Benchmark Dataset

The ground-truth benchmark is stored at [data/eval_golden_set.jsonl](data/eval_golden_set.jsonl).

### 3.1 Curation Standards
1. **Balanced Distribution:** Maintain roughly balanced representation across all scores (1 to 5).
2. **Deterministic Contexts:** Ensure reference contexts are unambiguous so humans and LLM judges have sufficient grounding.
3. **Hard Hallucination Probes:** Include adversarial samples that sound polished and fluent but contradict subtle context facts (scores 1 and 2).
4. **Format & Constraint Checks:** Include samples testing explicit formatting instructions (bullet points, sentence count constraints, etc.).

### 3.2 Adding a New Test Case
Append a new JSON object to [data/eval_golden_set.jsonl](data/eval_golden_set.jsonl):
```json
{
  "id": "tc_11",
  "prompt": "What is the policy on return shipping costs?",
  "context": "Customers are responsible for return shipping unless the item arrived damaged.",
  "response": "Return shipping is free for all returns regardless of reason.",
  "human_score": 1
}
```

After modifying the dataset, immediately run `python scripts/eval_gate.py` to calibrate and verify that judge agreement remains above thresholds.

---

## 4. GitHub Actions CI/CD PR Workflow

### 4.1 Trigger Conditions
The CI workflow ([.github/workflows/eval-gate.yml](.github/workflows/eval-gate.yml)) runs automatically when a Pull Request or push touches any of:
* `prompts/**`
* `data/**`
* `scripts/**`
* `tests/**`
* `requirements.txt`
* `.github/workflows/eval-gate.yml`

### 4.2 GitHub Secrets Setup
To enable CI execution in your GitHub repository:
1. Navigate to **Repository Settings** $\to$ **Secrets and variables** $\to$ **Actions**.
2. Create a new repository secret:
   * **Name:** `OPENAI_API_KEY`
   * **Value:** Your OpenAI API Key.

### 4.3 Inspecting PR Results
* **Sticky Comment:** The bot will post or update a single sticky comment on the PR containing the regression gate status, QWK, Adjacent Agreement, Lenience Drift, and Confusion Matrix.
* **Workflow Artifacts:** In the GitHub Actions run summary, download the `severe-misalignments` artifact to inspect any failure cases where $| \Delta | \ge 2$.
* **Merge Protection:** If any quality threshold is breached, the CI check will fail (exit code 1), preventing merging until regressions are resolved.

---

## 5. Deploying to Vercel (Edge Runtime & Production Dashboard)

The application is structured as a standard Next.js 14 project ready for one-click deployment on [Vercel](https://vercel.com):

### 5.1 Connecting the Repository
1. Navigate to your [Vercel Dashboard](https://vercel.com/new).
2. Click **Import Repository** and select `swathikchgithub/eval-engine`.
3. Keep the default Framework Preset (`Next.js`).

### 5.2 Configuring Environment Variables in Vercel
Before clicking Deploy, add your project environment variables in the Vercel project configuration:
* `OPENAI_API_KEY`: Your OpenAI API key (required for Edge shadow audits and live sandbox).
* `EVAL_ROUTER_MODE`: `openai` (or `hybrid` / `vllm`).
* *(Optional)* `VLLM_BASE_URL`, `VLLM_API_KEY`, `VLLM_MODEL`: For RunPod or self-hosted open-weights routing.

### 5.3 Edge Function Execution
* The route `/api/chat` automatically runs on Vercel's global Edge network (`runtime = 'edge'`).
* Responses return to callers in under 100ms.
* Shadow evaluations run asynchronously in the background via `@vercel/functions` `waitUntil`.

---

## 6. Mandatory Documentation Update Protocol

To ensure documentation never drifts from code, follow this protocol whenever implementing a new layer or modifying system behavior:

```
┌─────────────────────────────────────────────────────────────┐
│             FEATURE DEVELOPMENT LIFECYCLE                   │
│                                                             │
│   1. Implement Feature Code / Prompt / Benchmark Changes    │
│   2. Validate Locally (python scripts/eval_gate.py)        │
│   3. UPDATE ALL PROJECT DOCS (Protocol below)               │
│   4. Open PR & Verify CI Sticky Comment & Artifacts         │
└─────────────────────────────────────────────────────────────┘
```

### 📋 The 5-Document Sync Checklist

Before submitting or merging any PR, verify that all 5 documents are synchronized:

| Document | File Path | What Must Be Updated |
| :--- | :--- | :--- |
| **PRD** | [docs/PRD.md](docs/PRD.md) | Update feature statuses, roadmap layers, metric definitions, and user requirements. |
| **TDD** | [docs/TDD.md](docs/TDD.md) | Update architecture diagrams, component specs, schemas, error-handling models, and algorithms. |
| **Workflow Guide** | [docs/WORKFLOW.md](docs/WORKFLOW.md) | Update CLI commands, local execution procedures, configuration parameters, and developer workflows. |
| **Sprint Dashboard** | [SPRINT_DASHBOARD.md](SPRINT_DASHBOARD.md) | Update layer milestone progress badges, deliverables, and verification dates. |
| **README** | [README.md](README.md) | Update public overview, architecture diagram, usage guide, and quickstart commands. |

> **Enforcement Rule:** A feature is **not considered complete** until its corresponding changes are reflected across all 5 documents.

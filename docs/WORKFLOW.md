# 🔄 Developer Workflow & Contribution Guide

## Operational Guide & Documentation Maintenance Protocol

* **Document Version:** 1.0.0  
* **Status:** Active  
* **Last Updated:** 2026-10-10  

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

### 1.3 Setting Environment Variables
You can either export `OPENAI_API_KEY` in your shell or populate [`.env.local`](.env.local) (which is automatically ignored by Git):
```bash
# Option A: In .env.local (recommended for local development)
echo 'OPENAI_API_KEY=sk-proj-your-key-here' >> .env.local

# Option B: Direct shell export
export OPENAI_API_KEY="sk-proj-your-key-here"
```

---

## 2. Running Local Evaluations

### 2.1 Standard Execution
Run the full evaluation gate against the golden benchmark:
```bash
python scripts/eval_gate.py
```

### 2.2 Verifying Artifacts
Following execution, check the generated artifacts:
* **Evaluation Summary:** [artifacts/summary.md](artifacts/summary.md)
* **Severe Misalignments:** [artifacts/severe_misalignments.jsonl](artifacts/severe_misalignments.jsonl) (empty if all predictions are within $\pm 1$).

### 2.3 Simulating CI Locally
To verify that the script properly sets exit codes for CI:
```bash
python scripts/eval_gate.py
echo "Exit code: $?"  # 0 indicates PASSED, 1 indicates REGRESSION FAILED
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

## 5. Mandatory Documentation Update Protocol

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

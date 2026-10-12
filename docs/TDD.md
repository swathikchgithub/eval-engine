# 🛠️ Technical Design Document (TDD)

## LLM Evaluation Engine Architecture & Test Specifications

* **Document Version:** 1.1.0  
* **Status:** Active / Layers 1, 2, 3 & 4 Completed  
* **Runtime:** Python 3.9+ (`asyncio`, `aiolimiter`, `tenacity`, `scikit-learn`, `pydantic`) + Next.js 14 (Vercel Edge Runtime)  
* **Last Updated:** 2026-10-12  

---

## 1. Architectural Overview & System Flow

The evaluation pipeline executes an asynchronous evaluation loop against a golden test set, validates LLM judge responses via Pydantic structured output parsing, calculates statistical agreement metrics against human labels, and enforces deployment gatekeeping.

```
[Golden Benchmark JSONL] + [Judge Rubric TXT]
                    │
                    ▼
          [asyncio Task Queue]
                    │
                    ▼
     [Concurrency Isolation Layer]
       ├── asyncio.Semaphore(5)
       └── aiolimiter.AsyncLimiter(60 RPM)
                    │
                    ▼
           [LLM Judge Pipeline]
       ├── tenacity: 5 retries / exp backoff
       ├── openai.beta.chat.completions.parse
       └── model: gpt-4o-mini (temp=0.0)
                    │
                    ▼
         [Pydantic JudgeOutput]
       ├── chain_of_thought: str
       └── score: int [1..5]
                    │
                    ▼
       [Statistical Metrics Engine]
       ├── Cohen's QWK (Quadratic Weighted Kappa)
       ├── Adjacent Agreement (±1 delta)
       ├── Lenience Drift (mean delta)
       └── 5x5 Confusion Matrix
                    │
                    ▼
       [CI Regression Quality Gate]
       ├── Exit Code 0: All Thresholds Met
       └── Exit Code 1: Any Violation (Blocks PR)
                    │
                    ▼
         [Artifact Generation]
       ├── artifacts/summary.md
       ├── artifacts/severe_misalignments.jsonl
       └── Sticky PR Status Comment (actions/github-script)
```

---

## 2. Concurrency & Event Loop Safety (Python 3.9+)

In Python 3.9, instantiating `asyncio.Semaphore` or event-loop dependent synchronization primitives at the global module level binds them to whatever default loop was active or uninitialized at import time, leading to `RuntimeError: There is no current event loop` or cross-loop race conditions when `asyncio.run()` creates a new loop.

### Implementation Standard:
```python
# Concurrency primitives MUST be initialized inside main() or within an active running loop
async def main():
    semaphore = asyncio.Semaphore(5)
    limiter = AsyncLimiter(max_rate=60, time_period=60)
    ...
    tasks = [evaluate_sample(r, template, semaphore, limiter) for r in records]
    results = await asyncio.gather(*tasks)
```

* **`AsyncLimiter(max_rate=60, time_period=60)`**: Enforces a sliding token bucket of 60 requests per 60 seconds, preventing HTTP 429 quota exhaustion.
* **`asyncio.Semaphore(5)`**: Caps inflight TCP connections and concurrent OpenAI sessions at 5, preventing connection pooling stalls and thread exhaustion.

---

## 3. Data Schemas & Contracts

### 3.1 LLM Judge Structured Output Schema
```python
class JudgeOutput(BaseModel):
    chain_of_thought: str = Field(..., description="Step-by-step reasoning against rubric")
    score: int = Field(..., ge=1, le=5, description="Integer rating from 1 to 5")
```

OpenAI Structured Outputs guarantee strict adherence to this schema at the token sampler level. The client additionally audits for model refusals:
```python
message = completion.choices[0].message
if getattr(message, "refusal", None):
    raise ValueError(f"Model refused evaluation: {message.refusal}")
if message.parsed is None:
    raise ValueError("Failed to parse structured output from model response")
```

### 3.2 Golden Benchmark Record Schema (`data/eval_golden_set.jsonl`)
```json
{
  "id": "tc_01",
  "prompt": "What is the return policy for hardware?",
  "context": "Hardware returns are accepted within 90 days. Software is 14 days.",
  "response": "You can return hardware items within 90 days of purchase.",
  "human_score": 5
}
```

### 3.3 Severe Misalignment Export Schema (`artifacts/severe_misalignments.jsonl`)
Contains all evaluation records where $| \text{LLM} - \text{Human} | \ge 2$:
```json
{
  "id": "tc_02",
  "prompt": "...",
  "context": "...",
  "response": "...",
  "human_score": 1,
  "llm_score": 4,
  "reasoning": "...",
  "status": "SUCCESS"
}
```

---

## 4. Statistical Metrics Mathematical Formulation

### 4.1 Quadratic Weighted Kappa (QWK)
Quadratic Weighted Kappa quantifies the agreement between two raters who each classify $N$ items into $C = 5$ ordinal categories ($1, 2, 3, 4, 5$).

Let $O_{i,j}$ be the observed matrix of counts (row $i$ = human, column $j$ = LLM).  
Let $E_{i,j}$ be the expected matrix under chance:
$$E_{i,j} = \frac{(\sum_{k} O_{i,k}) (\sum_{k} O_{k,j})}{N}$$

The quadratic weight penalty matrix $W_{i,j}$ is:
$$W_{i,j} = \frac{(i - j)^2}{(C - 1)^2} = \frac{(i - j)^2}{16}$$

The Quadratic Weighted Kappa is computed as:
$$\kappa = 1 - \frac{\sum_{i=1}^{5} \sum_{j=1}^{5} W_{i,j} O_{i,j}}{\sum_{i=1}^{5} \sum_{j=1}^{5} W_{i,j} E_{i,j}}$$

* **Threshold:** $\kappa \ge 0.70$ (Industry standard for substantial ordinal agreement).

### 4.2 Adjacent Agreement ($\pm 1$)
$$\text{Adjacent Agreement} = \frac{1}{N} \sum_{k=1}^{N} \mathbb{I}(|y_{\text{LLM}}^{(k)} - y_{\text{Human}}^{(k)}| \le 1)$$
* **Threshold:** $\ge 90.0\%$.

### 4.3 Lenience Drift ($\Delta\mu$)
$$\Delta\mu = \bar{y}_{\text{LLM}} - \bar{y}_{\text{Human}} = \left( \frac{1}{N} \sum_{k=1}^{N} y_{\text{LLM}}^{(k)} \right) - \left( \frac{1}{N} \sum_{k=1}^{N} y_{\text{Human}}^{(k)} \right)$$
* **Threshold:** $|\Delta\mu| \le 0.35$.

### 4.4 Severe Misalignment Count ($|\Delta| \ge 2$)
$$\text{Severe Count} = \sum_{k=1}^{N} \mathbb{I}(|y_{\text{LLM}}^{(k)} - y_{\text{Human}}^{(k)}| \ge 2)$$
* **Threshold:** $\text{Severe Count} \le 0$ (Zero tolerance).

---

## 5. Fault Tolerance & Retry Architecture

Network calls to LLM endpoints are wrapped with `tenacity` exponential backoff:

```python
RETRYABLE_EXCEPTIONS = (
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    json.JSONDecodeError,
)

@retry(
    retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
    wait=wait_random_exponential(min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
async def _invoke_judge(prompt_text: str) -> JudgeOutput: ...
```

* **Retry Strategy:** Jittered exponential backoff (1s min, 30s max, 5 attempts).
* **Terminal Errors:** Authentication errors (`AuthenticationError`), malformed requests, or invalid parameters fail immediately without retry loops.

---

## 6. GitHub Actions CI Gating & Sticky Comments

The CI workflow ([.github/workflows/eval-gate.yml](.github/workflows/eval-gate.yml)) enforces evaluation gates on PR branches:

```javascript
// Idempotent Sticky Comment Algorithm
const headerIdentifier = '<!-- eval-gate-pr-comment -->';
const { data: comments } = await github.rest.issues.listComments({
  owner: context.repo.owner,
  repo: context.repo.repo,
  issue_number: prNumber,
});

const existingComment = comments.find(c => c.body && c.body.includes(headerIdentifier));
if (existingComment) {
  await github.rest.issues.updateComment({ ... });
} else {
  await github.rest.issues.createComment({ ... });
}
```

* **Always-Executed Artifacts:** `upload-artifact@v4` runs with `if: always()` to capture `artifacts/severe_misalignments.jsonl` even when the evaluation gate fails.
* **Deterministic Merge Blocking:** If `python scripts/eval_gate.py` returns non-zero, the job fails, preventing PR merge when branch protection is enabled.

---

## 7. Multi-Backend Hybrid Router Architecture (Layer 3 — Implemented)

The evaluation judge uses a pluggable router abstraction in [`scripts/router.py`](../scripts/router.py):

```python
class BaseJudgeClient(ABC):
    name: str

    @abstractmethod
    async def evaluate(self, prompt_text: str) -> tuple[JudgeOutput, str]:
        """Evaluates a prompt and returns (JudgeOutput, provider_identifier)."""
        pass
```

### 7.1 Router Implementations
1. **`OpenAIJudgeClient`**:
   - Uses `AsyncOpenAI.beta.chat.completions.parse` with Pydantic `JudgeOutput`.
   - Employs `tenacity` exponential backoff across retryable exceptions.
2. **`VLLMJudgeClient`**:
   - Uses `AsyncOpenAI` pointing to OpenAI-compatible base URLs (`VLLM_BASE_URL`).
   - Targets open-weights models (`meta-llama/Meta-Llama-3.1-8B-Instruct`).
   - Robust `_extract_json_payload` handles raw JSON, markdown-fenced code blocks, and bare text.
   - Enforces per-request timeouts via `asyncio.wait_for(timeout=VLLM_TIMEOUT)`.
3. **`HybridJudgeRouter`**:
   - Wraps a `primary` (e.g., `VLLMJudgeClient`) and `secondary` (e.g., `OpenAIJudgeClient`).
   - Tracks consecutive failures. If primary encounters 3 consecutive failures, the **circuit breaker trips OPEN**, automatically routing subsequent evaluations directly to the secondary to prevent cascading timeouts.
   - Tags returned provider identifier with `[fallback]` for auditability.

### 7.2 Configuration Environment Variables
* `EVAL_ROUTER_MODE`: `"openai"` (default), `"vllm"`, or `"hybrid"`
* `VLLM_BASE_URL`: OpenAI-compatible endpoint (e.g., `https://api.runpod.ai/v2/.../openai/v1`)
* `VLLM_API_KEY`: Endpoint authorization token
* `VLLM_MODEL`: Target model identifier
* `VLLM_TIMEOUT`: Maximum seconds before triggering fallback (default: 12.0s in hybrid mode)

---

## 8. Layer 4: Production Shadow Evaluation Architecture (Implemented)

Layer 4 integrates evaluation into live inference serving without introducing user-facing latency, running out-of-band via edge execution and asynchronous queue workers.

```
                    [Client Request (Inference)]
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │     Next.js / Vercel Edge Route Handler      │
         │             (app/api/chat/route.ts)          │
         │   • runtime = 'edge'                         │
         │   • Fast candidate response generation       │
         └──────────────────────┬───────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                               │
        ▼ (Immediate Response)                          ▼ (Non-blocking Out-of-band)
[Client / User: <100ms]                     waitUntil(async () => {
                                                • Check ShadowSampler
                                                • If sampled: Call Judge Router
                                                • Append to Audit Log
                                            })
```

### 8.1 Vercel Edge `waitUntil` Integration (`app/api/chat/route.ts`)
The Edge API route leverages `@vercel/functions` `waitUntil` under `export const runtime = 'edge'`.
- The user prompt is processed, and a candidate response is generated and returned immediately to the client in `<100ms`.
- `waitUntil` keeps the Edge worker invocation alive in the background to execute shadow evaluation:
  1. Inspects sampling conditions (`ShadowSampler`).
  2. If selected, calls `HybridJudgeRouter` or OpenAI judge with the rubric template.
  3. Records timestamp, candidate response, judge score (1–5), reasoning, provider attribution, and latency.

```typescript
import { waitUntil } from '@vercel/functions';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { prompt, context } = await req.json();
  const startTime = Date.now();
  
  // 1. Generate candidate response immediately
  const candidateResponse = await generateCandidate(prompt, context);
  const userLatency = Date.now() - startTime;

  // 2. Schedule non-blocking shadow evaluation
  waitUntil(
    executeShadowAudit({
      requestId: crypto.randomUUID(),
      prompt,
      context,
      candidateResponse,
      userLatency,
    })
  );

  // 3. Return candidate response with zero added latency
  return Response.json({
    response: candidateResponse,
    meta: { userLatencyMs: userLatency, shadowAudited: true }
  });
}
```

### 8.2 Production Sampling Strategy (`ShadowSampler`)
To minimize evaluation compute costs while maximizing regression detection, `ShadowSampler` in [`scripts/shadow_eval.py`](../scripts/shadow_eval.py) implements a hybrid policy:
1. **Keyword Triggers (High Uncertainty / High Risk):** Evaluates 100% of requests containing policy or sensitive keywords (e.g. `policy`, `refund`, `return`, `legal`, `security`, `cancel`).
2. **Uniform Random Sampling:** Evaluates a configurable percentage of general traffic (e.g. 10% sample rate, configurable via `sample_rate=0.10`).

### 8.3 Python Asynchronous Shadow Worker Service (`scripts/shadow_eval.py`)
For environments using Python backends (FastAPI/Tornado), the shadow engine provides an in-process queue worker:
- **`asyncio.Queue` Decoupling:** Ingestion enqueues audit jobs in `<5ms`.
- **Worker Pool:** `start_workers(num_workers=2)` consumes jobs concurrently in the background.
- **Graceful Shutdown:** `drain_and_stop()` flushes pending evaluations upon SIGTERM/SIGINT.
- **Audit Logging:** Evaluated samples append to `artifacts/shadow_eval_log.jsonl`.

### 8.4 Interactive Web Dashboard & Metrics API
- **Live Dashboard (`app/page.tsx`):** A responsive, dark-mode Next.js UI featuring:
  - **Live Evaluation Sandbox:** Allows entering arbitrary prompts, contexts, and candidate responses with instant evaluation and reasoning breakdown.
  - **Regression Metrics Cards:** Real-time display of QWK, Adjacent Agreement, Exact Match, and Lenience Drift.
  - **5x5 Interactive Confusion Matrix:** Visual heatmap of human vs judge score distribution.
  - **Golden Benchmark Explorer:** Filterable dataset inspector with score chips and context viewer.
- **Metrics API (`app/api/metrics/route.ts`):** Serves current gate metrics, golden set items, and recent shadow evaluation logs.

### 8.5 Unit Test Verification (`tests/test_shadow_eval.py` & `tests/test_eval_metrics.py`)
- **Queue & Sampler (`tests/test_shadow_eval.py`):** 5 tests validate keyword sampling triggers, uniform random rates, microsecond enqueue (<10ms), worker queue execution, and clean shutdown.
- **Statistical Formulas (`tests/test_eval_metrics.py`):** 5 tests validate QWK edge cases, adjacent agreement ($\pm 1$), severe error slicing ($|\Delta| \ge 2$), and lenience drift mathematical consistency.
- **Live Edge API Contracts (`tests/test_e2e_api.py`):** 5 tests validate live HTTP responses from `/api/metrics` and `/api/chat` against production edge nodes.

### 8.6 Playwright Browser End-to-End Test Architecture (`e2e/dashboard.spec.ts`)
To prevent visual and client-side JavaScript regressions, Playwright tests the real DOM in headless Chromium (`playwright.config.ts`):
1. **Header & KPI Rendering:** Verifies CI gate badge (`CI GATE: PASSED`), 5 KPI metric cards, and sprint layer progress.
2. **Interactive Workflow Modal:** Opens `#open-workflow-modal-btn`, verifies tab switching between Architecture, Developer CI, Production Edge, and Docs, and closes cleanly.
3. **Golden Benchmark Explorer:** Verifies all 10 ground-truth samples render in the benchmark table.
4. **Interactive Sandbox Dispatch:** Fills prompt/context textareas, clicks `#send-edge-request-btn`, and verifies candidate response card with latency badge appears in `<15s`.
5. **5×5 Confusion Matrix Heatmap:** Verifies 25 ordinal grid cells render without severe off-diagonal distributions.

---

## 9. Upcoming Extension: Layer 5 Continuous Calibration & Longitudinal Drift

For Layer 5, the evaluation system will continuously monitor production telemetry:
1. **Longitudinal Metric Tracking:** Rolling window QWK and lenience drift calculated over daily/weekly production shadow samples.
2. **Distribution Shift Alerts:** Statistical detection of score skew (e.g., sudden increase in 1s or 2s).
3. **Dynamic Golden Set Curation:** Automatic slicing of production failures ($|\Delta| \ge 2$) for human annotation and automated inclusion in `data/eval_golden_set.jsonl`.

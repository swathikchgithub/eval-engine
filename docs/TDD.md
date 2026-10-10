# 🛠️ Technical Design Document (TDD)

## LLM Evaluation Engine Architecture & Test Specifications

* **Document Version:** 1.0.0  
* **Status:** Active / Layer 1 & 2 Completed  
* **Runtime:** Python 3.9+ (`asyncio`, `aiolimiter`, `tenacity`, `scikit-learn`, `pydantic`)  
* **Last Updated:** 2026-10-10  

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

## 7. Upcoming Extension: Layer 3 Hybrid Router Spec

For Layer 3, the judge client will be refactored into a provider-agnostic router:

```python
class BaseJudgeClient(ABC):
    @abstractmethod
    async def evaluate(self, prompt: str) -> JudgeOutput: ...

class OpenAIJudgeClient(BaseJudgeClient):
    # gpt-4o-mini implementation via AsyncOpenAI
    ...

class VLLMJudgeClient(BaseJudgeClient):
    # Llama-3.1-8B-Instruct on RunPod Serverless / vLLM
    ...

class HybridRouter(BaseJudgeClient):
    # Primary: vLLM -> Fallback: OpenAI on timeout / error
    ...
```

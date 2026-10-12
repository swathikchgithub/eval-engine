from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, Optional

from aiolimiter import AsyncLimiter
import numpy as np
import pandas as pd
from sklearn.metrics import cohen_kappa_score, confusion_matrix

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.router import BaseJudgeClient, JudgeOutput, create_judge_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("eval_gate")

# ---------------------------------------------------------------------------
# Pipeline Thresholds & Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
GOLDEN_SET_PATH = REPO_ROOT / "data" / "eval_golden_set.jsonl"
PROMPT_TEMPLATE_PATH = REPO_ROOT / "prompts" / "judge_rubric.txt"
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
MISALIGNMENTS_FILE = ARTIFACTS_DIR / "severe_misalignments.jsonl"

QWK_MIN_THRESHOLD = 0.70
ADJACENT_ACC_THRESHOLD = 0.90
MAX_LENIENCE_DRIFT = 0.35
MAX_ALLOWED_SEVERE_ERRORS = 0  # Fail build if any prediction differs by >= 2 points


def _load_env_file() -> None:
    for filename in [".env.local", ".env"]:
        env_path = REPO_ROOT / filename
        if env_path.is_file():
            try:
                for line in env_path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        key, val = key.strip(), val.strip().strip('"\'')
                        if key and key not in os.environ and val and val != "your_openai_api_key_here":
                            os.environ[key] = val
                break
            except Exception as err:
                logger.warning(f"Could not read {filename}: {err}")


async def evaluate_sample(
    item: dict[str, Any],
    template: str,
    router: BaseJudgeClient,
    semaphore: asyncio.Semaphore,
    limiter: AsyncLimiter,
) -> dict[str, Any]:
    formatted_prompt = template.format(
        prompt=item["prompt"],
        context=item.get("context") or "N/A",
        response=item["response"],
    )

    async with semaphore:
        async with limiter:
            try:
                t0 = time.perf_counter()
                res, provider = await router.evaluate(formatted_prompt)
                latency_ms = int((time.perf_counter() - t0) * 1000)
                return {
                    "id": item.get("id"),
                    "prompt": item["prompt"],
                    "context": item.get("context") or "",
                    "response": item["response"],
                    "human_score": int(item["human_score"]),
                    "llm_score": int(res.score),
                    "reasoning": res.chain_of_thought,
                    "provider": provider,
                    "latency_ms": latency_ms,
                    "status": "SUCCESS",
                }
            except Exception as e:
                logger.error(f"Sample {item.get('id')} failed: {e}")
                return {
                    "id": item.get("id"),
                    "prompt": item["prompt"],
                    "context": item.get("context") or "",
                    "response": item["response"],
                    "human_score": int(item["human_score"]),
                    "llm_score": None,
                    "reasoning": str(e),
                    "provider": getattr(router, "name", "unknown"),
                    "latency_ms": None,
                    "status": "FAILED",
                }


async def main():
    if not GOLDEN_SET_PATH.exists():
        logger.error(f"Dataset missing at {GOLDEN_SET_PATH}")
        sys.exit(1)

    if not PROMPT_TEMPLATE_PATH.exists():
        logger.error(f"Prompt template missing at {PROMPT_TEMPLATE_PATH}")
        sys.exit(1)

    _load_env_file()
    try:
        router = create_judge_router()
    except Exception as err:
        logger.error(f"Failed to initialize judge router: {err}")
        sys.exit(1)

    # Initialized inside the running event loop to support Python 3.9
    semaphore = asyncio.Semaphore(5)
    limiter = AsyncLimiter(max_rate=60, time_period=60)

    template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
    df_raw = pd.read_json(GOLDEN_SET_PATH, lines=True)
    records = df_raw.to_dict(orient="records")

    logger.info(f"Dispatching async evaluation for {len(records)} test samples using router '{router.name}'...")
    tasks = [evaluate_sample(r, template, router, semaphore, limiter) for r in records]
    results = await asyncio.gather(*tasks)

    df = pd.DataFrame(results)

    failed_evals = df[df["status"] == "FAILED"]
    if len(failed_evals) > 0:
        logger.error(f"{len(failed_evals)} items failed after retries.")
        if len(failed_evals) > len(df) * 0.05:
            sys.exit(1)

    valid_df = df[df["status"] == "SUCCESS"].copy()
    if valid_df.empty:
        logger.error("No successful evaluations to analyze.")
        sys.exit(1)

    valid_df["human_score"] = valid_df["human_score"].astype(int)
    valid_df["llm_score"] = valid_df["llm_score"].astype(int)
    valid_df["delta"] = (valid_df["llm_score"] - valid_df["human_score"]).abs()

    # Slice severe failures (|LLM - Human| >= 2)
    severe_df = valid_df[valid_df["delta"] >= 2]
    num_severe = len(severe_df)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    if num_severe > 0:
        severe_df.to_json(MISALIGNMENTS_FILE, orient="records", lines=True)
    else:
        MISALIGNMENTS_FILE.write_text("")

    # Statistical metrics
    human_y = valid_df["human_score"].values
    llm_y = valid_df["llm_score"].values
    categories = [1, 2, 3, 4, 5]

    qwk = cohen_kappa_score(human_y, llm_y, labels=categories, weights="quadratic")
    qwk = float(qwk) if not np.isnan(qwk) else (1.0 if np.array_equal(human_y, llm_y) else 0.0)
    adj_acc = float(np.mean(valid_df["delta"] <= 1))
    exact_acc = float(np.mean(valid_df["delta"] == 0))
    drift = float(np.mean(llm_y) - np.mean(human_y))
    cm = confusion_matrix(human_y, llm_y, labels=categories)

    avg_latency = int(valid_df["latency_ms"].mean()) if "latency_ms" in valid_df and valid_df["latency_ms"].notna().any() else 0
    provider_counts = valid_df["provider"].value_counts().to_dict()
    provider_summary = ", ".join(f"`{k}`: {v}" for k, v in provider_counts.items())

    # Threshold checks
    failures = []
    if qwk < QWK_MIN_THRESHOLD:
        failures.append(f"QWK `{qwk:.3f}` < required `{QWK_MIN_THRESHOLD}`")
    if adj_acc < ADJACENT_ACC_THRESHOLD:
        failures.append(f"Adjacent agreement `{adj_acc:.1%}` < required `{ADJACENT_ACC_THRESHOLD:.1%}`")
    if abs(drift) > MAX_LENIENCE_DRIFT:
        failures.append(f"Lenience drift `|{drift:+.2f}|` exceeds max `{MAX_LENIENCE_DRIFT:.2f}`")
    if num_severe > MAX_ALLOWED_SEVERE_ERRORS:
        failures.append(f"Severe misalignments (`|Δ| ≥ 2`): found {num_severe}, allowed {MAX_ALLOWED_SEVERE_ERRORS}")

    status = "FAILED" if failures else "PASSED"

    summary_md = f"""## ⚖️ LLM Judge CI Regression Gate

**Status:** `{'🔴 ' + status if status == 'FAILED' else '🟢 ' + status}`
**Router Backend:** `{router.name}`
**Average Latency:** `{avg_latency} ms`
**Engine Providers:** {provider_summary}

| Metric | Measured | Threshold | Result |
| :--- | :--- | :--- | :--- |
| **Quadratic Weighted Kappa (QWK)** | `{qwk:.3f}` | `>= {QWK_MIN_THRESHOLD}` | {'✅' if qwk >= QWK_MIN_THRESHOLD else '❌'} |
| **Adjacent Agreement ($\pm 1$)** | `{adj_acc:.1%}` | `>= {ADJACENT_ACC_THRESHOLD:.1%}` | {'✅' if adj_acc >= ADJACENT_ACC_THRESHOLD else '❌'} |
| **Exact Match** | `{exact_acc:.1%}` | *Informational* | ℹ️ |
| **Lenience Drift ($\Delta\mu$)** | `{drift:+.3f}` | `|$\Delta$| <= {MAX_LENIENCE_DRIFT}` | {'✅' if abs(drift) <= MAX_LENIENCE_DRIFT else '❌'} |
| **Severe Errors ($\\\\vert{{}}\\\\Delta\\\\vert{{}} \\\\ge 2$)** | `{num_severe}` | `<= {MAX_ALLOWED_SEVERE_ERRORS}` | {'✅' if num_severe <= MAX_ALLOWED_SEVERE_ERRORS else '❌'} |

### Confusion Matrix (Rows: Human, Columns: LLM)
```text
{cm}
```
"""

    if failures:
        summary_md += "\n\n### ⚠️ Regressions Detected\n" + "\n".join(f"- {f}" for f in failures)
    if num_severe > 0:
        summary_md += f"\n\n> 📁 **{num_severe} severe misalignment(s)** exported to workflow artifacts for download (`artifacts/severe_misalignments.jsonl`)."

    # Persist summary markdown artifact
    summary_file = ARTIFACTS_DIR / "summary.md"
    summary_file.write_text(summary_md, encoding="utf-8")

    # Write to GitHub Step Summary if running in Actions
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(summary_md)

    print("\n" + summary_md)

    if failures:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import random
import sys
import time
from typing import Any, Optional

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.router import BaseJudgeClient, create_judge_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("eval_gate.shadow")

ARTIFACTS_DIR = REPO_ROOT / "artifacts"
SHADOW_LOG_FILE = ARTIFACTS_DIR / "shadow_eval_log.jsonl"
PROMPT_TEMPLATE_PATH = REPO_ROOT / "prompts" / "judge_rubric.txt"


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


# ---------------------------------------------------------------------------
# Sampling Strategy
# ---------------------------------------------------------------------------
class ShadowSampler:
    """Configurable traffic sampling strategy for production shadow evaluation."""

    def __init__(
        self,
        sample_rate: float = 0.20,
        trigger_keywords: Optional[list[str]] = None,
    ):
        self.sample_rate = float(os.environ.get("SHADOW_SAMPLE_RATE", sample_rate))
        self.trigger_keywords = trigger_keywords or [
            "refund",
            "cancel",
            "warranty",
            "policy",
            "error",
            "security",
            "confidential",
            "prorated",
        ]

    def should_sample(
        self,
        prompt: str,
        context: Optional[str] = None,
        force_eval: bool = False,
    ) -> tuple[bool, str]:
        if force_eval:
            return True, "force_eval"

        # Deterministic trigger on high-risk keywords
        combined = f"{prompt} {context or ''}".lower()
        for kw in self.trigger_keywords:
            if kw in combined:
                return True, f"keyword_trigger:{kw}"

        # Uniform random sampling for baseline monitoring
        if random.random() < self.sample_rate:
            return True, "random_sample"

        return False, "skipped"


# ---------------------------------------------------------------------------
# Background Shadow Evaluation Pipeline (Latency-Isolated)
# ---------------------------------------------------------------------------
class ShadowEvaluationService:
    """Manages non-blocking background queue and telemetry logging for live inference."""

    def __init__(
        self,
        router: Optional[BaseJudgeClient] = None,
        sampler: Optional[ShadowSampler] = None,
        concurrency: int = 3,
    ):
        self.router = router
        self.sampler = sampler or ShadowSampler()
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.concurrency = concurrency
        self._worker_tasks: list[asyncio.Task[None]] = []
        self._running = False
        self._template: Optional[str] = None

    def _get_template(self) -> str:
        if self._template is None:
            if PROMPT_TEMPLATE_PATH.exists():
                self._template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
            else:
                self._template = "Prompt: {prompt}\nContext: {context}\nResponse: {response}"
        return self._template

    async def start(self) -> None:
        """Starts background evaluation workers."""
        if self._running:
            return

        if self.router is None:
            _load_env_file()
            self.router = create_judge_router()

        self._running = True
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        for i in range(self.concurrency):
            task = asyncio.create_task(self._worker(f"shadow-worker-{i+1}"))
            self._worker_tasks.append(task)
        logger.info(f"Started {self.concurrency} background shadow evaluation worker(s)")

    async def stop(self) -> None:
        """Flushes queue and gracefully shuts down background workers."""
        self._running = False
        await self.queue.join()
        for task in self._worker_tasks:
            task.cancel()
        await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        self._worker_tasks.clear()
        logger.info("Shadow evaluation service stopped cleanly")

    async def enqueue(
        self,
        prompt: str,
        response: str,
        context: Optional[str] = None,
        request_id: Optional[str] = None,
        force_eval: bool = False,
    ) -> dict[str, Any]:
        """Dispatches an inference request immediately without waiting for evaluation.

        Returns metadata indicating whether the query was sampled for shadow evaluation.
        """
        sampled, reason = self.sampler.should_sample(prompt, context, force_eval)
        req_id = request_id or f"req_{int(time.time()*1000)}_{random.randint(100, 999)}"

        payload = {
            "id": req_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "prompt": prompt,
            "response": response,
            "context": context or "",
            "sampled": sampled,
            "sample_reason": reason,
        }

        if sampled:
            await self.queue.put(payload)
            logger.info(f"[{req_id}] Sampled for background shadow evaluation ({reason})")
        else:
            logger.debug(f"[{req_id}] Skipped shadow evaluation ({reason})")

        return {
            "request_id": req_id,
            "sampled": sampled,
            "reason": reason,
            "status": "QUEUED" if sampled else "SKIPPED",
        }

    async def _worker(self, worker_id: str) -> None:
        template = self._get_template()
        while self._running or not self.queue.empty():
            try:
                item = await asyncio.wait_for(self.queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            try:
                t0 = time.perf_counter()
                formatted_prompt = template.format(
                    prompt=item["prompt"],
                    context=item.get("context") or "N/A",
                    response=item["response"],
                )

                assert self.router is not None
                judge_output, provider = await self.router.evaluate(formatted_prompt)
                duration_ms = int((time.perf_counter() - t0) * 1000)

                log_entry = {
                    "id": item["id"],
                    "timestamp": item["timestamp"],
                    "eval_completed_at": datetime.now(timezone.utc).isoformat(),
                    "prompt": item["prompt"],
                    "context": item["context"],
                    "response": item["response"],
                    "llm_score": judge_output.score,
                    "reasoning": judge_output.chain_of_thought,
                    "provider": provider,
                    "sample_reason": item["sample_reason"],
                    "eval_latency_ms": duration_ms,
                    "status": "SUCCESS",
                }

                # Append to JSONL audit file
                with open(SHADOW_LOG_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(log_entry) + "\n")

                logger.info(
                    f"[{worker_id}] Finished shadow eval for {item['id']}: "
                    f"score={judge_output.score}/5 via {provider} in {duration_ms}ms"
                )
            except Exception as err:
                logger.error(f"[{worker_id}] Shadow eval failed for {item.get('id')}: {err}")
                error_entry = {
                    "id": item["id"],
                    "timestamp": item["timestamp"],
                    "eval_completed_at": datetime.now(timezone.utc).isoformat(),
                    "prompt": item["prompt"],
                    "context": item.get("context", ""),
                    "response": item["response"],
                    "llm_score": None,
                    "reasoning": str(err),
                    "provider": getattr(self.router, "name", "unknown"),
                    "status": "FAILED",
                }
                with open(SHADOW_LOG_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(error_entry) + "\n")
            finally:
                self.queue.task_done()


# ---------------------------------------------------------------------------
# Simulation CLI for Testing & Benchmarking
# ---------------------------------------------------------------------------
async def run_simulation(num_requests: int = 10) -> None:
    """Simulates production traffic to benchmark latency isolation."""
    _load_env_file()
    service = ShadowEvaluationService()
    await service.start()

    sample_pool = [
        ("What is the return policy for hardware?", "Hardware items can be returned within 90 days with a valid receipt.", "Hardware returns accepted within 90 days."),
        ("How do I cancel my subscription?", "You can cancel immediately under Account Settings with no prorated refunds.", "Cancel immediately, no prorated refunds."),
        ("Can I export data to Excel?", "Yes, we support exports in CSV and JSON formats.", "Exports supported in CSV and JSON formats."),
        ("Is support available on weekends?", "Support is open 24/7 every day of the week.", "Support is Monday-Friday 8am-5pm."),
        ("Where do I ship warranty claims?", "Send all warranty claims to our Reno, NV facility.", "Warranty repairs must be shipped to Reno, NV."),
    ]

    print(f"\n🚀 Simulating {num_requests} production requests with latency isolation...")
    client_latencies = []

    for i in range(num_requests):
        prompt, response, context = random.choice(sample_pool)
        t_start = time.perf_counter()

        # Simulate user generation latency (e.g. 80ms)
        await asyncio.sleep(0.05)
        # Enqueue non-blocking shadow eval
        result = await service.enqueue(prompt=prompt, response=response, context=context)
        t_user_elapsed = (time.perf_counter() - t_start) * 1000

        client_latencies.append(t_user_elapsed)
        print(f"  [Request {i+1:02d}] User response returned in {t_user_elapsed:.1f}ms | Shadow: {result['status']} ({result['reason']})")

    avg_user_latency = sum(client_latencies) / len(client_latencies)
    print(f"\n⚡ Average Client-Facing Latency: {avg_user_latency:.1f}ms (Completely unblocked by evaluation)")
    print("⏳ Awaiting completion of background shadow evaluations...")

    await service.stop()
    print(f"✅ Shadow evaluations flushed to: {SHADOW_LOG_FILE}\n")


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 5
    asyncio.run(run_simulation(count))

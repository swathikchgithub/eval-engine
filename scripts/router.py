from __future__ import annotations

from abc import ABC, abstractmethod
import asyncio
import json
import logging
import os
import re
from typing import Any, Optional

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)
from pydantic import BaseModel, Field, ValidationError
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)

logger = logging.getLogger("eval_gate.router")


# ---------------------------------------------------------------------------
# Output Schema
# ---------------------------------------------------------------------------
class JudgeOutput(BaseModel):
    chain_of_thought: str = Field(..., description="Step-by-step reasoning against rubric")
    score: int = Field(..., ge=1, le=5, description="Integer rating from 1 to 5")


RETRYABLE_EXCEPTIONS = (
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    json.JSONDecodeError,
)


def _extract_json_payload(raw_text: str) -> dict[str, Any]:
    """Extracts JSON object from text, stripping markdown code blocks if present."""
    text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    match_bare = re.search(r"(\{.*\})", text, re.DOTALL)
    if match_bare:
        return json.loads(match_bare.group(1))

    return json.loads(text)


# ---------------------------------------------------------------------------
# Abstract Judge Client
# ---------------------------------------------------------------------------
class BaseJudgeClient(ABC):
    name: str

    @abstractmethod
    async def evaluate(self, prompt_text: str) -> tuple[JudgeOutput, str]:
        """Evaluates a prompt and returns (JudgeOutput, provider_identifier)."""
        pass


# ---------------------------------------------------------------------------
# OpenAI Judge Client (gpt-4o-mini)
# ---------------------------------------------------------------------------
class OpenAIJudgeClient(BaseJudgeClient):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.0,
    ):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIJudgeClient.")
        self.model = model
        self.temperature = temperature
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.name = f"openai:{self.model}"

    @retry(
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
        wait=wait_random_exponential(min=1, max=30),
        stop=stop_after_attempt(5),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    async def evaluate(self, prompt_text: str) -> tuple[JudgeOutput, str]:
        completion = await self.client.beta.chat.completions.parse(
            model=self.model,
            temperature=self.temperature,
            seed=42,
            messages=[
                {"role": "system", "content": "You are a strict, objective evaluation judge."},
                {"role": "user", "content": prompt_text},
            ],
            response_format=JudgeOutput,
        )
        message = completion.choices[0].message
        if getattr(message, "refusal", None):
            raise ValueError(f"OpenAI refused evaluation: {message.refusal}")
        if message.parsed is None:
            raise ValueError("Failed to parse structured output from OpenAI response")

        return message.parsed, self.name


# ---------------------------------------------------------------------------
# vLLM / RunPod Open-Weights Judge Client (e.g. Llama-3.1-8B-Instruct)
# ---------------------------------------------------------------------------
class VLLMJudgeClient(BaseJudgeClient):
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: str = "meta-llama/Meta-Llama-3.1-8B-Instruct",
        timeout: float = 15.0,
        temperature: float = 0.0,
    ):
        self.base_url = base_url or os.environ.get("VLLM_BASE_URL", "http://localhost:8000/v1")
        self.api_key = api_key or os.environ.get("VLLM_API_KEY", "EMPTY")
        self.model = model or os.environ.get("VLLM_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct")
        self.timeout = timeout
        self.temperature = temperature
        self.client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)
        self.name = f"vllm:{self.model}"

    async def evaluate(self, prompt_text: str) -> tuple[JudgeOutput, str]:
        json_instruction = (
            "\n\nRespond ONLY with a valid JSON object matching this exact schema:\n"
            '{\n  "chain_of_thought": "<step-by-step audit>",\n  "score": <integer 1 to 5>\n}\n'
            "Do not include any text outside the JSON block."
        )
        full_user_content = prompt_text + json_instruction

        async def _call():
            completion = await self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=[
                    {"role": "system", "content": "You are a strict, objective evaluation judge."},
                    {"role": "user", "content": full_user_content},
                ],
                response_format={"type": "json_object"},
            )
            raw = completion.choices[0].message.content or ""
            parsed_data = _extract_json_payload(raw)
            return JudgeOutput.model_validate(parsed_data)

        parsed_output = await asyncio.wait_for(_call(), timeout=self.timeout)
        return parsed_output, self.name


# ---------------------------------------------------------------------------
# Hybrid Judge Router (Primary with Circuit Breaker Fallback)
# ---------------------------------------------------------------------------
class HybridJudgeRouter(BaseJudgeClient):
    def __init__(
        self,
        primary: BaseJudgeClient,
        secondary: BaseJudgeClient,
        max_consecutive_failures: int = 3,
    ):
        self.primary = primary
        self.secondary = secondary
        self.max_consecutive_failures = max_consecutive_failures
        self._consecutive_failures = 0
        self._circuit_open = False
        self.name = f"hybrid({primary.name} -> {secondary.name})"

    async def evaluate(self, prompt_text: str) -> tuple[JudgeOutput, str]:
        if not self._circuit_open:
            try:
                output, provider = await self.primary.evaluate(prompt_text)
                self._consecutive_failures = 0
                return output, provider
            except Exception as err:
                self._consecutive_failures += 1
                logger.warning(
                    f"Primary judge '{self.primary.name}' failed ({type(err).__name__}: {err}). "
                    f"Consecutive failures: {self._consecutive_failures}. "
                    f"Falling back to secondary '{self.secondary.name}'."
                )
                if self._consecutive_failures >= self.max_consecutive_failures:
                    logger.error(
                        f"Primary judge '{self.primary.name}' reached {self._consecutive_failures} "
                        "consecutive failures. Tripping circuit breaker for remaining samples."
                    )
                    self._circuit_open = True
        else:
            logger.info(f"Circuit breaker OPEN for '{self.primary.name}'. Routing directly to '{self.secondary.name}'.")

        # Fallback invocation
        output, provider = await self.secondary.evaluate(prompt_text)
        return output, f"{provider} [fallback]"


# ---------------------------------------------------------------------------
# Router Factory
# ---------------------------------------------------------------------------
def create_judge_router() -> BaseJudgeClient:
    mode = os.environ.get("EVAL_ROUTER_MODE", "openai").lower().strip()
    logger.info(f"Initializing evaluation router in '{mode}' mode")

    if mode == "openai":
        return OpenAIJudgeClient()

    if mode == "vllm":
        timeout = float(os.environ.get("VLLM_TIMEOUT", "15.0"))
        return VLLMJudgeClient(timeout=timeout)

    if mode == "hybrid":
        vllm_client = VLLMJudgeClient(
            timeout=float(os.environ.get("VLLM_TIMEOUT", "12.0"))
        )
        openai_client = OpenAIJudgeClient()
        return HybridJudgeRouter(primary=vllm_client, secondary=openai_client)

    raise ValueError(f"Unknown EVAL_ROUTER_MODE: '{mode}'. Expected 'openai', 'vllm', or 'hybrid'.")

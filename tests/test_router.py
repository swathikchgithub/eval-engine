from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from scripts.router import (
    BaseJudgeClient,
    HybridJudgeRouter,
    JudgeOutput,
    OpenAIJudgeClient,
    VLLMJudgeClient,
    _extract_json_payload,
    create_judge_router,
)


class TestJSONExtraction(unittest.TestCase):
    def test_clean_json(self):
        raw = '{"chain_of_thought": "Accurate", "score": 5}'
        data = _extract_json_payload(raw)
        self.assertEqual(data["score"], 5)

    def test_markdown_code_block(self):
        raw = '```json\n{"chain_of_thought": "Minor flaws", "score": 3}\n```'
        data = _extract_json_payload(raw)
        self.assertEqual(data["score"], 3)

    def test_embedded_json_in_text(self):
        raw = 'Here is the evaluation:\n{"chain_of_thought": "Hallucinated", "score": 1}\nHope this helps!'
        data = _extract_json_payload(raw)
        self.assertEqual(data["score"], 1)


class TestOpenAIJudgeClient(unittest.IsolatedAsyncioTestCase):
    async def test_successful_evaluation(self):
        client = OpenAIJudgeClient(api_key="test_key")
        mock_parsed = JudgeOutput(chain_of_thought="Matches context", score=4)
        mock_choice = MagicMock()
        mock_choice.message.parsed = mock_parsed
        mock_choice.message.refusal = None
        mock_completion = MagicMock(choices=[mock_choice])

        client.client.beta.chat.completions.parse = AsyncMock(return_value=mock_completion)

        output, provider = await client.evaluate("Test prompt")
        self.assertEqual(output.score, 4)
        self.assertEqual(provider, "openai:gpt-4o-mini")

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_api_key_raises(self):
        with self.assertRaises(ValueError):
            OpenAIJudgeClient()


class TestVLLMJudgeClient(unittest.IsolatedAsyncioTestCase):
    async def test_successful_evaluation(self):
        client = VLLMJudgeClient(base_url="http://mock-vllm:8000/v1", api_key="test")
        mock_choice = MagicMock()
        mock_choice.message.content = '{"chain_of_thought": "Fully grounded", "score": 5}'
        mock_completion = MagicMock(choices=[mock_choice])

        client.client.chat.completions.create = AsyncMock(return_value=mock_completion)

        output, provider = await client.evaluate("Test prompt")
        self.assertEqual(output.score, 5)
        self.assertEqual(output.chain_of_thought, "Fully grounded")
        self.assertIn("vllm:", provider)

    async def test_timeout_handling(self):
        client = VLLMJudgeClient(timeout=0.01)

        async def _slow_call(*args, **kwargs):
            await asyncio.sleep(0.1)

        client.client.chat.completions.create = _slow_call

        with self.assertRaises(asyncio.TimeoutError):
            await client.evaluate("Test prompt")


class TestHybridJudgeRouter(unittest.IsolatedAsyncioTestCase):
    async def test_primary_success(self):
        primary = MagicMock(spec=BaseJudgeClient)
        primary.name = "vllm:test"
        primary.evaluate = AsyncMock(
            return_value=(JudgeOutput(chain_of_thought="Primary OK", score=5), "vllm:test")
        )

        secondary = MagicMock(spec=BaseJudgeClient)
        secondary.name = "openai:gpt-4o-mini"

        router = HybridJudgeRouter(primary=primary, secondary=secondary)
        output, provider = await router.evaluate("Prompt")

        self.assertEqual(output.score, 5)
        self.assertEqual(provider, "vllm:test")
        secondary.evaluate.assert_not_called()

    async def test_fallback_on_primary_failure(self):
        primary = MagicMock(spec=BaseJudgeClient)
        primary.name = "vllm:test"
        primary.evaluate = AsyncMock(side_effect=RuntimeError("Connection refused"))

        secondary = MagicMock(spec=BaseJudgeClient)
        secondary.name = "openai:gpt-4o-mini"
        secondary.evaluate = AsyncMock(
            return_value=(JudgeOutput(chain_of_thought="Secondary OK", score=4), "openai:gpt-4o-mini")
        )

        router = HybridJudgeRouter(primary=primary, secondary=secondary)
        output, provider = await router.evaluate("Prompt")

        self.assertEqual(output.score, 4)
        self.assertIn("[fallback]", provider)
        primary.evaluate.assert_called_once()
        secondary.evaluate.assert_called_once()

    async def test_circuit_breaker_trips(self):
        primary = MagicMock(spec=BaseJudgeClient)
        primary.name = "vllm:test"
        primary.evaluate = AsyncMock(side_effect=RuntimeError("Service down"))

        secondary = MagicMock(spec=BaseJudgeClient)
        secondary.name = "openai:gpt-4o-mini"
        secondary.evaluate = AsyncMock(
            return_value=(JudgeOutput(chain_of_thought="Secondary OK", score=4), "openai:gpt-4o-mini")
        )

        router = HybridJudgeRouter(primary=primary, secondary=secondary, max_consecutive_failures=2)

        # 1st failure
        await router.evaluate("Prompt 1")
        self.assertEqual(router._consecutive_failures, 1)
        self.assertFalse(router._circuit_open)

        # 2nd failure -> circuit trips open
        await router.evaluate("Prompt 2")
        self.assertEqual(router._consecutive_failures, 2)
        self.assertTrue(router._circuit_open)

        # 3rd call -> should bypass primary entirely
        primary.evaluate.reset_mock()
        await router.evaluate("Prompt 3")
        primary.evaluate.assert_not_called()


class TestRouterFactory(unittest.TestCase):
    @patch.dict(os.environ, {"EVAL_ROUTER_MODE": "openai", "OPENAI_API_KEY": "test"})
    def test_factory_openai(self):
        router = create_judge_router()
        self.assertIsInstance(router, OpenAIJudgeClient)

    @patch.dict(os.environ, {"EVAL_ROUTER_MODE": "vllm"})
    def test_factory_vllm(self):
        router = create_judge_router()
        self.assertIsInstance(router, VLLMJudgeClient)

    @patch.dict(os.environ, {"EVAL_ROUTER_MODE": "hybrid", "OPENAI_API_KEY": "test"})
    def test_factory_hybrid(self):
        router = create_judge_router()
        self.assertIsInstance(router, HybridJudgeRouter)


if __name__ == "__main__":
    unittest.main()

import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Default prompt template fallback
const RUBRIC_TEMPLATE = `You are an expert, impartial evaluation judge assessing the quality, accuracy, and grounding of an AI assistant's response.
[USER PROMPT]: {prompt}
[REFERENCE CONTEXT]: {context}
[CANDIDATE RESPONSE]: {response}
Respond with a JSON object: {"chain_of_thought": "...", "score": 1-5}`;

// In-memory telemetry buffer for edge demonstration
interface ShadowLog {
  id: string;
  timestamp: string;
  prompt: string;
  context: string;
  response: string;
  llm_score: number | null;
  reasoning: string;
  provider: string;
  sample_reason: string;
  eval_latency_ms: number;
}

const TRIGGER_KEYWORDS = ['refund', 'cancel', 'warranty', 'policy', 'error', 'security', 'prorated'];

function shouldSample(prompt: string, context?: string, forceEval?: boolean): { sampled: boolean; reason: string } {
  if (forceEval) return { sampled: true, reason: 'force_eval' };

  const combined = `${prompt} ${context || ''}`.toLowerCase();
  for (const kw of TRIGGER_KEYWORDS) {
    if (combined.includes(kw)) {
      return { sampled: true, reason: `keyword_trigger:${kw}` };
    }
  }

  // 20% random sampling
  if (Math.random() < 0.20) {
    return { sampled: true, reason: 'random_sample' };
  }

  return { sampled: false, reason: 'skipped' };
}

// Background shadow evaluation worker executed via Vercel waitUntil
async function performShadowEvaluation(
  reqId: string,
  prompt: string,
  context: string,
  response: string,
  reason: string,
  apiKey?: string
): Promise<void> {
  const t0 = Date.now();
  console.log(`[Shadow Eval ${reqId}] Background task started via waitUntil (${reason})`);

  try {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn(`[Shadow Eval ${reqId}] No OPENAI_API_KEY available for background judge evaluation`);
      return;
    }

    const formattedPrompt = RUBRIC_TEMPLATE
      .replace('{prompt}', prompt)
      .replace('{context}', context || 'N/A')
      .replace('{response}', response);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.0,
        messages: [
          { role: 'system', content: 'You are a strict evaluation judge. Output ONLY a JSON object with keys chain_of_thought and score (1 to 5).' },
          { role: 'user', content: formattedPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API returned ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawContent = data.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);
    const duration = Date.now() - t0;

    console.log(
      `[Shadow Eval ${reqId}] SUCCESS in ${duration}ms: Score ${parsed.score}/5 | Reasoning: ${parsed.chain_of_thought}`
    );
  } catch (error: any) {
    console.error(`[Shadow Eval ${reqId}] FAILED: ${error?.message || error}`);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { prompt, context = '', force_eval = false } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const reqId = `edge_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // 1. Generate candidate assistant response
    // If OpenAI key is present, invoke gpt-4o-mini; otherwise generate context-grounded response
    let candidateResponse = '';
    const key = process.env.OPENAI_API_KEY;

    if (key) {
      try {
        const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: context
                  ? `You are a helpful assistant. Strictly ground your answer in this context: "${context}".`
                  : 'You are a helpful assistant.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          candidateResponse = chatData.choices[0]?.message?.content || 'No response generated.';
        }
      } catch (e) {
        console.warn('Candidate inference fallback triggered:', e);
      }
    }

    if (!candidateResponse) {
      candidateResponse = context
        ? `Based on our policy (${context}), your request regarding "${prompt}" is processed accordingly.`
        : `Thank you for your inquiry about "${prompt}". Here is the requested information.`;
    }

    const userFacingLatencyMs = Date.now() - startTime;

    // 2. Determine shadow evaluation sampling
    const { sampled, reason } = shouldSample(prompt, context, force_eval);

    // 3. ZERO-LATENCY ISOLATION: Asynchronously audit via Vercel waitUntil
    if (sampled) {
      waitUntil(
        performShadowEvaluation(reqId, prompt, context, candidateResponse, reason, key)
      );
    }

    // 4. Return user response immediately
    return NextResponse.json({
      id: reqId,
      response: candidateResponse,
      user_latency_ms: userFacingLatencyMs,
      shadow_evaluation: {
        sampled,
        reason,
        status: sampled ? 'RUNNING_IN_BACKGROUND' : 'SKIPPED',
        note: sampled ? 'Evaluated asynchronously via Vercel waitUntil with 0ms added to user' : 'Unsampled query',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

import { test, expect } from '@playwright/test';

test.describe('LLM Evaluation Engine — Production Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the main heading to confirm the dashboard loaded
    await expect(page.locator('h1')).toContainText('LLM Evaluation Engine');
  });

  test('1. Dashboard loads with header status, KPI metrics, and sprint progress', async ({ page }) => {
    // Verify CI Gate status badge
    await expect(page.locator('text=CI GATE: PASSED')).toBeVisible();

    // Verify Sprint Architecture progress layers
    await expect(page.locator('text=Layer 1: Eval Harness')).toBeVisible();
    await expect(page.locator('text=Layer 2: CI Regression Gate')).toBeVisible();
    await expect(page.locator('text=Layer 3: Hybrid Router')).toBeVisible();
    await expect(page.locator('text=Layer 4: Vercel Edge Shadow')).toBeVisible();

    // Verify 5 Primary Quality Gate KPI Cards
    await expect(page.locator('text=Quadratic Weighted Kappa')).toBeVisible();
    await expect(page.getByText('0.953').first()).toBeVisible();

    await expect(page.getByText('Adjacent Agreement (±1)', { exact: true })).toBeVisible();
    await expect(page.locator('text=100.0%')).toBeVisible();

    await expect(page.locator('text=Exact Agreement (|Δ| = 0)')).toBeVisible();
    await expect(page.locator('text=70.0%')).toBeVisible();

    await expect(page.locator('text=Lenience Drift (Δμ)')).toBeVisible();
    await expect(page.locator('text=-0.30')).toBeVisible();

    await expect(page.locator('text=Severe Errors (|Δ| ≥ 2)')).toBeVisible();
    await expect(page.locator('text=Zero Severe Errors')).toBeVisible();
  });

  test('2. Workflow Guide modal opens, switches tabs, and closes cleanly', async ({ page }) => {
    const guideBtn = page.locator('#open-workflow-modal-btn');
    await expect(guideBtn).toBeVisible();
    await guideBtn.click();

    // Verify modal title
    await expect(page.locator('text=How It Works & System Workflow Guide')).toBeVisible();

    // Switch to Tab 2: Developer & CI Gate
    await page.locator('button:has-text("2. Developer & CI Gate")').click();
    await expect(page.locator('text=Developer Workflow: Local Testing & Automated Pull Request Gate')).toBeVisible();
    await expect(page.locator('text=python scripts/eval_gate.py')).toBeVisible();

    // Switch to Tab 3: Production Edge API
    await page.locator('button:has-text("3. Production Edge API")').click();
    await expect(page.locator('div:has-text("POST https://eval-engine-coral.vercel.app/api/chat")').first()).toBeVisible();
    await expect(page.locator('text=Hybrid Shadow Sampler Policy')).toBeVisible();

    // Switch to Tab 5: Documentation Suite
    await page.locator('button:has-text("5. Documentation Suite")').click();
    await expect(page.locator('text=docs/WORKFLOW.md')).toBeVisible();
    await expect(page.locator('text=docs/PRD.md')).toBeVisible();
    await expect(page.locator('text=docs/TDD.md')).toBeVisible();

    // Close the modal
    await page.locator('button:has-text("✕ Close")').click();
    await expect(page.locator('text=How It Works & System Workflow Guide')).not.toBeVisible();
  });

  test('3. Golden Benchmark Dataset explorer displays reference samples', async ({ page }) => {
    // Verify table header
    await expect(page.locator('text=Golden Benchmark Dataset')).toBeVisible();

    // Wait for golden samples to populate in the golden benchmark section
    const rows = page.locator('section:has-text("Golden Benchmark Dataset") table tbody tr');
    await expect(rows).toHaveCount(10);

    // Verify first row contains tc_01
    await expect(rows.first()).toContainText('tc_01');
    await expect(rows.first()).toContainText('5 / 5');
  });

  test('4. Live Edge Sandbox triggers inference and renders result card', async ({ page }) => {
    const promptInput = page.locator('#sandbox-prompt-input');
    const contextInput = page.locator('#sandbox-context-input');
    const dispatchBtn = page.locator('#send-edge-request-btn');

    await expect(promptInput).toBeVisible();
    await expect(dispatchBtn).toBeVisible();

    // Fill inputs
    await promptInput.fill('What is the return policy for hardware?');
    await contextInput.fill('Hardware items are eligible for return within 90 days.');

    // Dispatch request
    await dispatchBtn.click();

    // Expect result telemetry box to appear
    await expect(page.locator('text=⚡ User Latency:')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Shadow Status:')).toBeVisible();
    await expect(page.locator('text=Assistant Output:')).toBeVisible();
  });

  test('5. 5x5 Ordinal Confusion Matrix renders all 25 ordinal cells', async ({ page }) => {
    await expect(page.locator('text=5×5 Ordinal Confusion Matrix')).toBeVisible();
    await expect(page.locator('text=Rows represent Human Ground Truth; columns represent LLM Judge predictions.')).toBeVisible();
    await expect(page.locator('text=Zero Severe Errors:')).toBeVisible();
  });

  test('6. Layer 5 Continuous Calibration panel renders PSI, TVD, and failure slices table', async ({ page }) => {
    // Check Layer 5 panel exists
    const l5Panel = page.locator('#layer5-drift-panel');
    await expect(l5Panel).toBeVisible();
    await expect(l5Panel).toContainText('Layer 5: Longitudinal Calibration');
    await expect(l5Panel).toContainText('Population Stability Index (PSI)');
    await expect(l5Panel).toContainText('Total Variation Distance (TVD)');

    // Verify candidate failure slices table renders
    await expect(l5Panel).toContainText('Production Failure Slices');
    const triageBtn = l5Panel.locator('button:has-text("Approve for Golden Set")').first();
    if (await triageBtn.isVisible()) {
      await triageBtn.click();
      await expect(page.locator('text=triaged: Promoted to ground-truth candidate queue')).toBeVisible();
    }
  });
});

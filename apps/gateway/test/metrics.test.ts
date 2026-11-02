import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMetrics } from '../src/metrics.ts';
import { Router } from '../src/router.ts';

// Request counters
test('metrics request counters', () => {
  const metrics = createMetrics();
  metrics.request('ok', 'n1');
  metrics.request('ok', 'n1');
  metrics.request('budget_exceeded', undefined);
  const output = metrics.render(new Router(['n1', 'n2'], 4, 10, 1000));
  assert.ok(output.includes('codehaunt_gateway_requests_total{outcome="ok",node="n1"} 2'));
  assert.ok(output.includes('codehaunt_gateway_requests_total{outcome="budget_exceeded",node="none"} 1'));
});

// TTFT histogram
test('metrics TTFT histogram', () => {
  const metrics = createMetrics();
  metrics.ttft('n1', 0.3);
  const output = metrics.render(new Router(['n1'], 4, 10, 1000));
  const lines = output.split('\n');
  const bucket = (le: string) => lines.find((l) => l.includes(`codehaunt_gateway_ttft_seconds_bucket{node="n1",le="${le}"}`));
  assert.ok(bucket('0.1')?.endsWith(' 0'));
  assert.ok(bucket('0.25')?.endsWith(' 0'));
  assert.ok(bucket('0.5')?.endsWith(' 1'));
  assert.ok(bucket('1')?.endsWith(' 1'));
  const sumLine = lines.find((l) => l.includes('codehaunt_gateway_ttft_seconds_sum{node="n1"}'));
  const countLine = lines.find((l) => l.includes('codehaunt_gateway_ttft_seconds_count{node="n1"}'));
  assert.ok(sumLine?.endsWith(' 0.3'));
  assert.ok(countLine?.endsWith(' 1'));
});

// Router gauges (node health)
test('metrics router gauges', () => {
  const router = new Router(['n1', 'n2'], 4, 10, 1000);
  router.setHealthy('n1', true);
  const metrics = createMetrics();
  const output = metrics.render(router);
  const lines = output.split('\n');
  const healthyN1 = lines.find((l) => l.includes('codehaunt_gateway_node_healthy{node="n1"}'));
  const healthyN2 = lines.find((l) => l.includes('codehaunt_gateway_node_healthy{node="n2"}'));
  assert.ok(healthyN1?.endsWith(' 1'));
  assert.ok(healthyN2?.endsWith(' 0'));
});

// Token counters
test('metrics token counters', () => {
  const metrics = createMetrics();
  metrics.tokens(10, 5);
  metrics.tokens(10, 5);
  const output = metrics.render(new Router(['n1'], 4, 10, 1000));
  assert.ok(output.includes('codehaunt_gateway_prompt_tokens_total 20'));
  assert.ok(output.includes('codehaunt_gateway_completion_tokens_total 10'));
});

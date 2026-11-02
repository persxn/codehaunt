/**
 * In-process Prometheus metrics registry for the gateway.
 * Implements the {@link GatewayMetrics} interface used by the server.
 */
import type { GatewayErrorCode } from '@codehaunt/contracts';
import type { GatewayMetrics } from './server.ts';
import type { Router } from './router.ts';

/** Escape Prometheus label values (\, ", \n). */
function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Create a new metrics registry. */
export function createMetrics(): GatewayMetrics {
  // request counters: key "outcome|node"
  const requestCounts = new Map<string, number>();
  // retry counters per node
  const retryCounts = new Map<string, number>();
  // token totals
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;

  // TTFT histograms per node
  interface Hist {
    buckets: number[]; // cumulative counts per bucket
    sum: number;
    count: number;
  }
  const ttftHistograms = new Map<string, Hist>();
  const bucketBounds = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, Infinity];
  const bucketLabels = bucketBounds.map((b) => (b === Infinity ? '+Inf' : b.toString()));

  const request = (outcome: 'ok' | GatewayErrorCode, node: string | undefined): void => {
    const nodeLabel = node ?? 'none';
    const key = `${outcome}|${nodeLabel}`;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
  };

  const ttft = (node: string, seconds: number): void => {
    let hist = ttftHistograms.get(node);
    if (!hist) {
      hist = { buckets: new Array(bucketBounds.length).fill(0), sum: 0, count: 0 };
      ttftHistograms.set(node, hist);
    }
    for (let i = 0; i < bucketBounds.length; i++) {
      if (seconds <= bucketBounds[i]!) {
        hist.buckets[i]! += 1;
      }
    }
    hist.sum += seconds;
    hist.count += 1;
  };

  const tokens = (prompt: number, completion: number): void => {
    promptTokensTotal += prompt;
    completionTokensTotal += completion;
  };

  const retry = (node: string): void => {
    retryCounts.set(node, (retryCounts.get(node) ?? 0) + 1);
  };

  const render = (router: Router): string => {
    const lines: string[] = [];

    // Requests
    lines.push('# HELP codehaunt_gateway_requests_total Total number of gateway requests');
    lines.push('# TYPE codehaunt_gateway_requests_total counter');
    for (const [key, cnt] of requestCounts) {
      const [outcome = '', node = ''] = key.split('|');
      lines.push(
        `codehaunt_gateway_requests_total{outcome="${escapeLabel(outcome)}",node="${escapeLabel(node)}"} ${cnt}`,
      );
    }

    // Retries
    lines.push('# HELP codehaunt_gateway_retries_total Total number of retries before first byte');
    lines.push('# TYPE codehaunt_gateway_retries_total counter');
    for (const [node, cnt] of retryCounts) {
      lines.push(
        `codehaunt_gateway_retries_total{node="${escapeLabel(node)}"} ${cnt}`,
      );
    }

    // Prompt tokens
    lines.push('# HELP codehaunt_gateway_prompt_tokens_total Total prompt tokens');
    lines.push('# TYPE codehaunt_gateway_prompt_tokens_total counter');
    lines.push(`codehaunt_gateway_prompt_tokens_total ${promptTokensTotal}`);

    // Completion tokens
    lines.push('# HELP codehaunt_gateway_completion_tokens_total Total completion tokens');
    lines.push('# TYPE codehaunt_gateway_completion_tokens_total counter');
    lines.push(`codehaunt_gateway_completion_tokens_total ${completionTokensTotal}`);

    // TTFT histogram
    lines.push('# HELP codehaunt_gateway_ttft_seconds Time to first token in seconds');
    lines.push('# TYPE codehaunt_gateway_ttft_seconds histogram');
    for (const [node, hist] of ttftHistograms) {
      for (let i = 0; i < bucketBounds.length; i++) {
        const le = bucketLabels[i];
        lines.push(
          `codehaunt_gateway_ttft_seconds_bucket{node="${escapeLabel(node)}",le="${le}"} ${hist.buckets[i]}`,
        );
      }
      lines.push(
        `codehaunt_gateway_ttft_seconds_sum{node="${escapeLabel(node)}"} ${hist.sum}`,
      );
      lines.push(
        `codehaunt_gateway_ttft_seconds_count{node="${escapeLabel(node)}"} ${hist.count}`,
      );
    }

    // Node inflight gauge
    lines.push('# HELP codehaunt_gateway_node_inflight Number of inflight requests per node');
    lines.push('# TYPE codehaunt_gateway_node_inflight gauge');
    for (const [node, state] of router.nodes) {
      lines.push(
        `codehaunt_gateway_node_inflight{node="${escapeLabel(node)}"} ${state.inflight}`,
      );
    }

    // Node healthy gauge
    lines.push('# HELP codehaunt_gateway_node_healthy Node health status (1 healthy, 0 unhealthy)');
    lines.push('# TYPE codehaunt_gateway_node_healthy gauge');
    for (const [node, state] of router.nodes) {
      const val = state.healthy ? 1 : 0;
      lines.push(
        `codehaunt_gateway_node_healthy{node="${escapeLabel(node)}"} ${val}`,
      );
    }

    // Queue depth gauge
    lines.push('# HELP codehaunt_gateway_queue_depth Queue depth of pending requests');
    lines.push('# TYPE codehaunt_gateway_queue_depth gauge');
    lines.push(`codehaunt_gateway_queue_depth ${router.queueDepth}`);

    return `${lines.join('\n')}\n`;
  };

  return { request, ttft, tokens, retry, render };
}

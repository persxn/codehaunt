/** Process-wide service instances for route handlers (one web process; ADR-003). */
import { AppError } from '../server/errors.ts';
import { GatewayClient, type ModelClient } from '../server/gateway-client.ts';
import { noAccessSync, type AccessGroupSync } from '../server/staff-service.ts';
import { loadConfig } from './config.ts';

let model: ModelClient | null = null;

export function modelClient(): ModelClient {
  if (model) return model;
  const config = loadConfig();
  if (!config.GATEWAY_URL || !config.GATEWAY_TOKEN) {
    throw new AppError(503, 'model_unavailable', 'The model is not available right now. Tell a volunteer.');
  }
  model = new GatewayClient({ primaryUrl: config.GATEWAY_URL, fallbackUrl: config.GATEWAY_FALLBACK_URL, token: config.GATEWAY_TOKEN });
  return model;
}

/** Cloudflare Access group sync for staff (ADR-013); a no-op until WP-06 adds the token. */
export function accessSync(): AccessGroupSync {
  return noAccessSync;
}

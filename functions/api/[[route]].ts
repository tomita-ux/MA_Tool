import { handleApi } from '../../server/api';
import type { Env } from '../../server/types';

// Cloudflare Pages Function: every /api/* request → server/api.ts
export const onRequest = (ctx: { request: Request; env: Env }) => handleApi(ctx.request, ctx.env);

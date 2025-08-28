/**
 * Re-exports validation from @trilium-cli/zod package
 * Plus additional app-specific validations
 */

import { z } from 'zod';

// Re-export all validations from the zod package
export * from '@trilium-cli/zod';

import {
  EntityIdSchema,
  OrderDirectionSchema
} from '@trilium-cli/zod';

// ========== App-Specific Validations ==========

/**
 * SearchOptions schema validation (app-specific extension)
 */
export const SearchOptionsSchema = z.object({
  fastSearch: z.boolean(),
  includeArchived: z.boolean(),
  limit: z.number().int().positive().max(10000, 'Limit cannot exceed 10000'),
  regexMode: z.boolean(),
  includeContent: z.boolean(),
  contextLines: z.number().int().nonnegative(),
  ancestorNoteId: EntityIdSchema.optional(),
  ancestorDepth: z.string().optional(),
  orderBy: z.string().optional(),
  orderDirection: OrderDirectionSchema.optional(),
});

/**
 * ApiClientConfig schema validation (app-specific)
 */
export const ApiClientConfigSchema = z.object({
  baseUrl: z.string().url('Invalid base URL'),
  apiToken: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().nonnegative().max(10, 'Maximum 10 retries allowed').optional(),
  debugMode: z.boolean().optional(),
  rateLimitConfig: z.object({
    maxRequests: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }).optional(),
});

/**
 * Validate and parse ApiClientConfig
 */
export function validateApiClientConfig(config: unknown): z.infer<typeof ApiClientConfigSchema> {
  try {
    return ApiClientConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid ApiClientConfig: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}
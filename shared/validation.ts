import { z } from "zod";
import type { Command } from "./contracts";
const name = z
  .string()
  .min(1)
  .max(120)
  .refine((v) => !v.includes("\0"), "Names cannot contain null bytes");
const ns = z.object({ connectionId: name, database: name, collection: name });
export const querySchema = ns.extend({
  requestId: z.string().uuid().optional(),
  mode: z.enum(["find", "aggregate"]),
  filter: z.string().max(1000000),
  projection: z.string().max(1000000),
  sort: z.string().max(1000000),
  pipeline: z.string().max(1000000),
  pipelineDisabled: z
    .array(z.number().int().min(0).max(99))
    .max(100)
    .optional(),
  limit: z.number().int().min(1).max(500),
  skip: z.number().int().min(0).max(10000000),
});
const stageSchema = querySchema.extend({
  mode: z.literal("aggregate"),
  stage: z.number().int().min(0).max(99),
  side: z.enum(["input", "output"]),
});
export const connectionSchema = z.object({
  id: name.optional(),
  name,
  uri: z
    .string()
    .min(1)
    .max(16000)
    .regex(
      /^mongodb(?:\+srv)?:\/\//,
      "Use a mongodb:// or mongodb+srv:// connection string",
    ),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  environment: z.enum(["local", "development", "staging", "production"]),
  readOnly: z.boolean(),
  remember: z.boolean(),
  // An ssh destination: user@host, ssh://user@host:port, or a ~/.ssh/config alias. Never an option.
  ssh: z
    .string()
    .max(255)
    .regex(/^[^-\s][^\s]*$/, "Use an SSH destination such as user@bastion")
    .optional(),
});
export const schemas: Record<Command, z.ZodTypeAny> = {
  copyText: z.object({ text: z.string().max(50_000_000) }),
  boot: z.undefined(),
  connect: connectionSchema,
  reconnect: z.object({ connectionId: name }),
  disconnect: z.object({ connectionId: name }),
  forgetConnection: z.object({ connectionId: name }),
  databases: z.object({ connectionId: name }),
  collections: z.object({ connectionId: name, database: name }),
  query: querySchema,
  previewStage: stageSchema,
  countStage: stageSchema,
  cancelQuery: z.object({ connectionId: name, requestId: z.string().uuid() }),
  explain: querySchema.extend({
    verbosity: z.enum(["queryPlanner", "executionStats"]).optional(),
  }),
  indexes: ns,
  schema: ns,
  createIndex: ns.extend({
    keys: z.string().max(100000),
    name: z.string().max(120),
    unique: z.boolean(),
  }),
  dropIndex: ns.extend({ name }),
  insert: ns.extend({ documents: z.string().min(2).max(10000000) }),
  replace: ns.extend({
    original: z.string().min(2).max(20000000),
    document: z.string().min(2).max(20000000),
  }),
  delete: ns.extend({ original: z.string().min(2).max(20000000) }),
  createCollection: ns,
  dropCollection: ns.extend({ confirmation: name }),
  saveQuery: z.object({ id: name.optional(), name, query: querySchema }),
  removeQuery: z.object({ id: name }),
  clearHistory: z.undefined(),
  workspace: z.undefined(),
};

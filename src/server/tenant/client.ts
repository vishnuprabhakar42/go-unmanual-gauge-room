import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { APPEND_ONLY_MODELS, AUDITED_MODELS, GLOBAL_MODELS, ORG_SCOPED_MODELS, PLANT_SCOPED_MODELS } from "./models";

/**
 * Multi-tenant data access.
 *
 *   const db = tenantDb(ctx)                 → scoped reads
 *   await withTenantTx(ctx, async (tx) => …) → scoped reads + writes, audited atomically
 *
 * Every query on an org-scoped model gets `organizationId = ctx.organizationId` (and, for plant-scoped
 * models, `plantId IN ctx.plantIds`) AND-ed into its filter; creates are stamped with the org id.
 * Mutations on audited models write AuditLog rows in the same transaction. Hard deletes are refused.
 *
 * Not covered (by design, keep out of app code): nested relation writes, $queryRaw/$executeRaw.
 */
export type TenantContext = {
  organizationId: string;
  /** User performing the action; null for system jobs */
  actorId: string | null;
  /** Plants the actor may access */
  plantIds: "ALL" | readonly string[];
  ip?: string | null;
};

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

type ModelName = Prisma.ModelName;
type Row = Record<string, unknown> & { id?: unknown };
type Args = Record<string, unknown>;
type Delegate = {
  findUnique(args: Args): Promise<Row | null>;
  findMany(args: Args): Promise<Row[]>;
  createManyAndReturn(args: Args): Promise<Row[]>;
};

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const DELETE_OPS = new Set(["delete", "deleteMany"]);
const AUTH_ONLY_MODELS = new Set<ModelName>(["Account", "Session", "VerificationToken"]);
const REDACTED_KEYS = new Set(["passwordHash", "access_token", "refresh_token", "id_token"]);

const txStorage = new AsyncLocalStorage<{ tx: TenantTx; ctx: TenantContext }>();

function delegateKey(model: ModelName): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Filter AND-ed into every query on `model` for this context. */
export function scopeFilter(model: ModelName, ctx: TenantContext): Args | null {
  if (model === "Organization") return { id: ctx.organizationId };
  if (model === "User") return { memberships: { some: { organizationId: ctx.organizationId } } };
  if (model === "Vendor") return { links: { some: { organizationId: ctx.organizationId } } };
  if (model === "VendorScope" || model === "VendorUser")
    return { vendor: { links: { some: { organizationId: ctx.organizationId } } } };
  if (!ORG_SCOPED_MODELS.has(model)) return null;
  const filter: Args = { organizationId: ctx.organizationId };
  const plantCol = PLANT_SCOPED_MODELS[model];
  if (plantCol && ctx.plantIds !== "ALL") filter[plantCol] = { in: [...ctx.plantIds] };
  return filter;
}

function mergeWhere(where: unknown, scope: Args | null): Args | undefined {
  const base = (where ?? {}) as Args;
  if (!scope) return base;
  const and = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...and, scope] };
}

function assertPlantAllowed(model: ModelName, ctx: TenantContext, plantId: unknown) {
  const col = PLANT_SCOPED_MODELS[model];
  if (!col || ctx.plantIds === "ALL") return;
  if (col === "id") throw new TenantViolationError(`Only org-wide users can create ${model}`);
  if (typeof plantId !== "string" || !ctx.plantIds.includes(plantId)) {
    throw new TenantViolationError(`No access to plant ${String(plantId)} for ${model}`);
  }
}

function stampCreate(model: ModelName, ctx: TenantContext, data: unknown): Args {
  const row = { ...((data ?? {}) as Args) };
  if (model === "Organization") {
    // Only first-run setup creates an org: it pre-generates the id and opens a context for it.
    if (row.id !== ctx.organizationId) throw new TenantViolationError("Organizations are created via setup only");
    return row;
  }
  if (!ORG_SCOPED_MODELS.has(model)) return row;
  if (row.organizationId !== undefined && row.organizationId !== ctx.organizationId) {
    throw new TenantViolationError(`Cannot create ${model} in another organization`);
  }
  if ("organization" in row) throw new TenantViolationError(`Use organizationId (not a nested connect) on ${model}`);
  row.organizationId = ctx.organizationId;
  const col = PLANT_SCOPED_MODELS[model];
  if (col) assertPlantAllowed(model, ctx, col === "id" ? undefined : row[col]);
  return row;
}

function guardUpdate(model: ModelName, ctx: TenantContext, data: unknown): void {
  const row = (data ?? {}) as Args;
  if ("organizationId" in row && row.organizationId !== ctx.organizationId) {
    throw new TenantViolationError(`Cannot move ${model} to another organization`);
  }
  const col = PLANT_SCOPED_MODELS[model];
  if (col === "plantId" && "plantId" in row) assertPlantAllowed(model, ctx, row.plantId);
}

function snapshot(row: Row | null | undefined): Prisma.InputJsonValue | undefined {
  if (!row) return undefined;
  const clean: Row = {};
  for (const [k, v] of Object.entries(row)) if (!REDACTED_KEYS.has(k)) clean[k] = v;
  return JSON.parse(JSON.stringify(clean)) as Prisma.InputJsonValue;
}

function actionFor(before: Row | null, after: Row | null): AuditAction {
  if (!before) return "CREATE";
  if (after && before.archivedAt == null && after.archivedAt != null) return "ARCHIVE";
  if (after && before.archivedAt != null && after.archivedAt == null) return "RESTORE";
  if (after && "status" in before && before.status !== after.status) return "STATUS_CHANGE";
  return "UPDATE";
}

function auditRow(model: ModelName, before: Row | null, after: Row | null, ctx: TenantContext) {
  return {
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    entity: model,
    entityId: String((after ?? before)?.id ?? ""),
    action: actionFor(before, after),
    before: snapshot(before),
    after: snapshot(after),
    ip: ctx.ip ?? null,
  };
}

async function writeAudit(model: ModelName, before: Row | null, after: Row | null) {
  await writeAuditMany(model, [[before, after]]);
}

/** One AuditLog row per pair, inserted in a single statement (bulk imports). */
async function writeAuditMany(model: ModelName, pairs: [Row | null, Row | null][]) {
  const store = txStorage.getStore();
  if (!store || pairs.length === 0) return;
  const data = pairs.map(([b, a]) => auditRow(model, b, a, store.ctx));
  if (data.length === 1) await store.tx.auditLog.create({ data: data[0] });
  else await store.tx.auditLog.createMany({ data });
}

function delegateOf(model: ModelName): Delegate {
  const store = txStorage.getStore();
  if (!store) throw new TenantViolationError("No active tenant transaction");
  return (store.tx as unknown as Record<string, Delegate>)[delegateKey(model)];
}

export function tenantDb(ctx: TenantContext) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = model as ModelName;
          const a = { ...((args ?? {}) as Args) };
          const scope = scopeFilter(m, ctx);

          if (AUTH_ONLY_MODELS.has(m)) throw new TenantViolationError(`${m} is managed by Auth.js only`);
          if (DELETE_OPS.has(operation)) {
            throw new TenantViolationError(`Hard deletes are not allowed (${m}.${operation}); set archivedAt instead`);
          }
          if (!ORG_SCOPED_MODELS.has(m) && !GLOBAL_MODELS.has(m)) {
            throw new TenantViolationError(`Model ${m} is not classified in tenant/models.ts`);
          }

          if (READ_OPS.has(operation)) {
            a.where = mergeWhere(a.where, scope);
            return query(a as typeof args);
          }

          // ── Mutations ──
          if (APPEND_ONLY_MODELS.has(m)) {
            if (operation !== "create" && operation !== "createMany") throw new TenantViolationError(`${m} is append-only`);
            a.data = Array.isArray(a.data) ? a.data.map((d) => stampCreate(m, ctx, d)) : stampCreate(m, ctx, a.data);
            return query(a as typeof args);
          }
          const store = txStorage.getStore();
          if (!store) throw new TenantViolationError(`Mutations must run inside withTenantTx() (${m}.${operation})`);
          const audited = AUDITED_MODELS.has(m);

          switch (operation) {
            case "create": {
              a.data = stampCreate(m, ctx, a.data);
              const result = (await query(a as typeof args)) as Row;
              if (audited && result?.id) {
                const fresh = await delegateOf(m).findUnique({ where: { id: result.id } });
                await writeAudit(m, null, fresh ?? result);
              }
              return result;
            }
            case "createMany": {
              const list = Array.isArray(a.data) ? a.data : [a.data];
              a.data = list.map((d) => stampCreate(m, ctx, d));
              if (!audited) return query(a as typeof args);
              // Re-enters this extension as createManyAndReturn, which writes the audit rows.
              const rows = await delegateOf(m).createManyAndReturn(a);
              return { count: rows.length };
            }
            case "createManyAndReturn": {
              const list = Array.isArray(a.data) ? a.data : [a.data];
              a.data = list.map((d) => stampCreate(m, ctx, d));
              const rows = (await query(a as typeof args)) as Row[];
              if (audited)
                await writeAuditMany(
                  m,
                  rows.map((r) => [null, r]),
                );
              return rows;
            }
            case "update":
            case "upsert": {
              a.where = mergeWhere(a.where, scope);
              if (operation === "update") guardUpdate(m, ctx, a.data);
              else {
                a.create = stampCreate(m, ctx, a.create);
                guardUpdate(m, ctx, a.update);
              }
              const before = audited ? await delegateOf(m).findUnique({ where: a.where }) : null;
              const result = (await query(a as typeof args)) as Row;
              if (audited && result?.id)
                await writeAudit(m, before, await delegateOf(m).findUnique({ where: { id: result.id } }));
              return result;
            }
            case "updateMany":
            case "updateManyAndReturn": {
              a.where = mergeWhere(a.where, scope);
              guardUpdate(m, ctx, a.data);
              if (!audited) return query(a as typeof args);
              const before = await delegateOf(m).findMany({ where: a.where });
              const result = await query(a as typeof args);
              const after = await delegateOf(m).findMany({ where: { id: { in: before.map((b) => b.id) } } });
              const afterById = new Map(after.map((r) => [r.id, r]));
              await writeAuditMany(
                m,
                before.map((b) => [b, afterById.get(b.id) ?? null]),
              );
              return result;
            }
            default:
              throw new TenantViolationError(`Unsupported operation ${m}.${operation}`);
          }
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof tenantDb>;
export type TenantTx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

/** Context of the enclosing withTenantTx(); throws outside one. */
export function currentTenant(): TenantContext {
  const store = txStorage.getStore();
  if (!store) throw new TenantViolationError("No active tenant transaction");
  return store.ctx;
}

/** Runs `fn` in one DB transaction with tenant scoping and automatic audit logging. */
export async function withTenantTx<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  const db = tenantDb(ctx);
  // Await inside run(): Prisma queries are lazy thenables and must start within the ALS scope.
  return db.$transaction((tx) => txStorage.run({ tx, ctx }, async () => await fn(tx)), { maxWait: 10_000, timeout: 60_000 });
}

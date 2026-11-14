import { z } from "zod";
import { D } from "./decimal";
import { validCommission } from "./price-rules";

const money = (label: string) =>
  z.string().trim().refine(validCommission, `Enter the ${label} with at most two decimals`);
const whole = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const agentSettingsSchema = z.object({
  agentFeePercent: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter the agent fee as a percent, e.g. 5")
    .refine((v) => new D(v).lte(50), "The agent fee can be at most 50%"),
  gatewayFeeRate: z
    .string()
    .trim()
    .regex(/^0(\.\d{1,4})?$/, "Enter the gateway fee as a rate below 1, e.g. 0.033"),
  basketLockAmount: money("basket lock amount"),
  agentDeposit: money("agent deposit"),
  maxWaitDays: whole(1, 365),
  paymentHoldMinutes: whole(1, 240),
  collectHours: whole(1, 720),
  returnHandoverDays: whole(1, 60),
  buyerHandoverDays: whole(1, 30),
  agentRadiusM: whole(100, 50_000),
  agentGapM: whole(100, 50_000),
});

/** Core admin's Agents and orders settings. The agent fee is typed as a percent (5) and stored
 * as a rate (0.0500). Throws ZodError on bad input. */
export function parseAgentSettings(fields: Record<string, unknown>) {
  const { agentFeePercent, ...rest } = agentSettingsSchema.parse(fields);
  return { ...rest, agentFeeRate: new D(agentFeePercent).div(100).toFixed(4) };
}

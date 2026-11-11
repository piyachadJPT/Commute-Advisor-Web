import { z } from "zod";
import { isAllowedPushEndpoint } from "./domain/pushEndpoint";

/** What the browser's `PushSubscription.toJSON()` gives us, validated before anything is stored. */
export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine(isAllowedPushEndpoint, "endpoint is not a known push service"),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(512),
  }),
});
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const notificationTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

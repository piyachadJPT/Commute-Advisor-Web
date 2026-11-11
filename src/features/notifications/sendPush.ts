import { isAllowedPushEndpoint } from "./domain/pushEndpoint";
import type { PushPayload } from "./domain/payload";
import type { PushSubscriptionRow } from "./data/pushSubscriptionRepo";

/** Sends one message to one subscription. Rejects with an error carrying `statusCode`. */
export type SendFn = (
  subscription: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">,
  body: string,
) => Promise<unknown>;

export type SendResult = {
  /** Subscriptions whose push service accepted the message. */
  sent: number[];
  /** To delete: the service answered 404/410 or the endpoint is not an allowed push host. */
  gone: number[];
  /** Other failures, to count against the subscription. */
  failed: Array<{ id: number; failureCount: number; status: number | null }>;
};

/** A Web Push body must stay under 4 KB (plan §13.3). */
const MAX_BODY_BYTES = 4000;

/**
 * Sends `payload` to every subscription of one user, one at a time, and sorts the outcomes.
 * Endpoints are checked against the allow-list first: the request goes to an address a client
 * supplied (plan §14.4).
 */
export async function sendToSubscriptions(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
  send: SendFn,
): Promise<SendResult> {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    throw new Error("Push payload is too large");
  }

  const result: SendResult = { sent: [], gone: [], failed: [] };
  for (const sub of subscriptions) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      result.gone.push(sub.id);
      continue;
    }
    try {
      await send(sub, body);
      result.sent.push(sub.id);
    } catch (err) {
      const status =
        typeof err === "object" &&
        err !== null &&
        "statusCode" in err &&
        typeof err.statusCode === "number"
          ? err.statusCode
          : null;
      if (status === 404 || status === 410) result.gone.push(sub.id);
      else
        result.failed.push({
          id: sub.id,
          failureCount: sub.failureCount,
          status,
        });
    }
  }
  return result;
}

import { isHigh } from "./analyzer";
import { localTimeOf } from "./tz";
import type { Reason, TripAnalysis } from "./types";

const windowLabel = (t: TripAnalysis) =>
  `${t.window.localStart}–${t.window.localEnd}`;

/**
 * Structured reason for a result (plan §5.3, §6.3). Stores codes and numbers, not sentences,
 * because the user can switch language. The threshold is always included so the text can state
 * it when a label and the decision disagree (§5.4).
 */
export function deriveReason(
  dep: TripAnalysis,
  ret: TripAnalysis,
  threshold: number,
  timeZone: string,
): Reason {
  const depHigh = isHigh(dep, threshold);
  const retHigh = isHigh(ret, threshold);

  if (depHigh || retHigh) {
    // Name the trip that triggered it; if both did, the higher risk (a tie names departure).
    const useReturn = retHigh && (!depHigh || ret.risk! > dep.risk!);
    const trip = useReturn ? ret : dep;
    const other = useReturn ? dep : ret;
    return {
      code: useReturn ? "returnHigh" : "departureHigh",
      params: {
        risk: trip.risk!,
        source: trip.riskSource!,
        window: windowLabel(trip),
        threshold,
        ...(other.isComplete ? {} : { otherIncomplete: true as const }),
      },
    };
  }

  if (!dep.isComplete || !ret.isComplete) {
    const trip = !dep.isComplete ? dep : ret;
    const source = trip.missingBuckets[0]!.location;
    const hours = trip.missingBuckets
      .filter((b) => b.location === source)
      .map((b) => localTimeOf(b.time, timeZone))
      .join(", ");
    return {
      code: "incomplete",
      params: { trip: trip.window.type, source, hours, threshold },
    };
  }

  return {
    code: "bothLow",
    params: { threshold, max: Math.max(dep.risk!, ret.risk!) },
  };
}

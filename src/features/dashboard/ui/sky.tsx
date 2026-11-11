import type { SkyKind } from "./risk-style";

const SKY_BG: Record<SkyKind, string> = {
  car: "bg-(image:--sky-car)",
  moto: "bg-(image:--sky-moto)",
  mist: "bg-(image:--sky-mist)",
};

/** Full-screen sky that encodes the verdict (§12.1). Rain streaks only on rainy days. */
export function Sky({ kind }: { kind: SkyKind }) {
  return (
    <div aria-hidden="true" className={`fixed inset-0 -z-10 ${SKY_BG[kind]}`}>
      {kind === "car" ? (
        <div className="absolute inset-0 rain-streaks" />
      ) : null}
    </div>
  );
}

export type SettingsFormState = {
  status: "idle" | "saved" | "invalid" | "failed";
};
export const initialSettingsState: SettingsFormState = { status: "idle" };

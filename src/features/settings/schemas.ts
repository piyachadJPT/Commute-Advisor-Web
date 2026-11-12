import { z } from "zod";
import {
  ADVISORY_GROUP_NAMES,
  TEMPERATURE_OFFSET_MAX,
  TEMPERATURE_OFFSET_MIN,
} from "@/features/commute/domain/advisoryGroups";

/** Validation for settings forms (plan §11.6). Pure; shared by Server Actions and tests. */

export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const; // Mon..Sun
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const intField = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const commuteSchema = z.object({
  departureTime: time,
  returnTime: time,
  durationMinutes: intField(15, 180),
  threshold: intField(10, 90),
  // Sum of the checked weekday bits. Any other value is rejected, not masked.
  commuteDays: z
    .array(z.number().int())
    .refine((bits) =>
      bits.every((b) => (WEEKDAY_BITS as readonly number[]).includes(b)),
    )
    .refine((bits) => new Set(bits).size === bits.length)
    .transform((bits) => bits.reduce((sum, b) => sum + b, 0)),
  // Advisory groups turned off (plan §23.6). Only the known groups; thunderstorm and heavy rain
  // are not groups, so they can never be listed here.
  advisoriesDisabled: z
    .array(z.enum(ADVISORY_GROUP_NAMES))
    .refine((groups) => new Set(groups).size === groups.length),
  // Signed, so it cannot reuse `intField`. Empty fails before conversion (Number("") is 0).
  temperatureOffset: z
    .string()
    .trim()
    .regex(/^-?\d+$/)
    .transform(Number)
    .pipe(
      z.number().int().min(TEMPERATURE_OFFSET_MIN).max(TEMPERATURE_OFFSET_MAX),
    ),
});
export type CommuteInput = z.infer<typeof commuteSchema>;

// Number("") is 0, so an empty field must fail before conversion, not become 0°N.
const coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(-limit).max(limit));

export const locationSchema = z.object({
  key: z.enum(["home", "work"]),
  latitude: coordinate(90),
  longitude: coordinate(180),
  name: z
    .string()
    .trim()
    .max(80)
    .transform((s) => (s === "" ? null : s)),
});
export type LocationInput = z.infer<typeof locationSchema>;

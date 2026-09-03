import { z } from "zod";

/** Strip ASCII control characters (keep normal whitespace). */
export function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** Trim and collapse internal whitespace. */
export function collapseSpaces(value: string): string {
  return stripControlChars(value).trim().replace(/\s+/g, " ");
}

export function sanitizeFreeText(value: string): string {
  return collapseSpaces(value);
}

const PERSON_NAME_PATTERN = /^[\p{L}\p{M}'\-. ]+$/u;

export const personNameField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z
      .string()
      .min(1, "Required")
      .max(100, "Must be 100 characters or fewer")
      .regex(
        PERSON_NAME_PATTERN,
        "Use letters, spaces, hyphens, apostrophes, or periods only",
      ),
  );

export const optionalPersonNameField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .max(100, "Must be 100 characters or fewer")
        .regex(
          PERSON_NAME_PATTERN,
          "Use letters, spaces, hyphens, apostrophes, or periods only",
        ),
    ]),
  )
  .transform((value) => (value === "" ? undefined : value));

/** Middle name on registration forms (empty string allowed in UI). */
export const middleNameInputField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .max(100, "Must be 100 characters or fewer")
        .regex(
          PERSON_NAME_PATTERN,
          "Use letters, spaces, hyphens, apostrophes, or periods only",
        ),
    ]),
  );

export const emailField = z
  .string()
  .transform((value) => collapseSpaces(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Email is required")
      .max(254, "Email is too long")
      .email("Enter a valid email address"),
  );

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or fewer");

export const loginPasswordField = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password is too long");

export const profileFullNameField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or fewer")
      .regex(
        PERSON_NAME_PATTERN,
        "Use letters, spaces, hyphens, apostrophes, or periods only",
      ),
  );

export const optionalReasonField = z
  .string()
  .transform((value) => sanitizeFreeText(value))
  .pipe(z.string().max(2000, "Reason must be 2000 characters or fewer"))
  .transform((value) => (value === "" ? undefined : value));

/** Reason textarea bound to React state (keeps empty string). */
export const reasonInputField = z
  .string()
  .transform((value) => sanitizeFreeText(value))
  .pipe(z.string().max(2000, "Reason must be 2000 characters or fewer"));

export const optionalNoteField = z
  .string()
  .transform((value) => sanitizeFreeText(value))
  .pipe(z.string().max(500, "Note must be 500 characters or fewer"))
  .transform((value) => (value === "" ? undefined : value));

/** Note input bound to React state (keeps empty string). */
export const noteInputField = z
  .string()
  .transform((value) => sanitizeFreeText(value))
  .pipe(z.string().max(500, "Note must be 500 characters or fewer"));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  const [yRaw, mRaw, dRaw] = value.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return false;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export const optionalDateOfBirthField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .regex(ISO_DATE, "Use YYYY-MM-DD")
        .refine(isValidCalendarDate, "Enter a valid calendar date")
        .refine((value) => {
          const date = new Date(`${value}T12:00:00.000Z`);
          return date.getTime() <= Date.now();
        }, "Date of birth cannot be in the future")
        .refine((value) => {
          const year = Number(value.slice(0, 4));
          return year >= 1900;
        }, "Year must be 1900 or later"),
    ]),
  )
  .transform((value) => (value === "" ? undefined : value));

/** Date of birth on registration forms (empty string allowed in UI). */
export const dateOfBirthInputField = z
  .string()
  .transform((value) => collapseSpaces(value))
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .regex(ISO_DATE, "Use YYYY-MM-DD")
        .refine(isValidCalendarDate, "Enter a valid calendar date")
        .refine((value) => {
          const date = new Date(`${value}T12:00:00.000Z`);
          return date.getTime() <= Date.now();
        }, "Date of birth cannot be in the future")
        .refine((value) => {
          const year = Number(value.slice(0, 4));
          return year >= 1900;
        }, "Year must be 1900 or later"),
    ]),
  );

export const patientSexField = z.enum(["", "M", "F", "O", "U"]);

export const accessionInputField = z
  .string()
  .transform((value) => collapseSpaces(value).toUpperCase())
  .pipe(
    z
      .string()
      .min(1, "Accession is required")
      .max(64, "Accession must be 64 characters or fewer")
      .regex(
        /^[A-Z0-9][A-Z0-9._-]*$/,
        "Use letters, numbers, dots, dashes, or underscores",
      ),
  );

export const searchQueryField = z
  .string()
  .transform((value) => sanitizeFreeText(value))
  .pipe(z.string().max(200, "Search is too long"));

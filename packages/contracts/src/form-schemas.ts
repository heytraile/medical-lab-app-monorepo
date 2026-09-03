import { z } from "zod";
import { StaffJobTitleSchema, StaffRoleSchema } from "./schemas";
import {
  accessionInputField,
  dateOfBirthInputField,
  emailField,
  loginPasswordField,
  middleNameInputField,
  noteInputField,
  passwordField,
  patientSexField,
  personNameField,
  profileFullNameField,
  reasonInputField,
  searchQueryField,
} from "./form-validators";

/** Patient registration form (web). */
export const RegisterPatientFormSchema = z.object({
  firstName: personNameField,
  middleName: middleNameInputField,
  lastName: personNameField,
  dateOfBirth: dateOfBirthInputField,
  sex: patientSexField,
});

export type RegisterPatientFormValues = z.input<typeof RegisterPatientFormSchema>;
export type RegisterPatientFormOutput = z.output<typeof RegisterPatientFormSchema>;

export function toCreatePatientRequest(values: RegisterPatientFormOutput) {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    middleName: values.middleName || undefined,
    dateOfBirth: values.dateOfBirth || undefined,
    sex: values.sex === "" ? undefined : values.sex,
  };
}

/** Staff registration form (web). */
export const RegisterStaffFormSchema = z.object({
  fullName: profileFullNameField,
  email: emailField,
  password: passwordField,
  role: StaffRoleSchema,
  jobTitle: StaffJobTitleSchema,
});

export type RegisterStaffFormValues = z.infer<typeof RegisterStaffFormSchema>;

/** Staff inline edit form (web). */
export const EditStaffFormSchema = z.object({
  fullName: profileFullNameField,
  role: StaffRoleSchema,
  jobTitle: StaffJobTitleSchema,
});

export type EditStaffFormValues = z.infer<typeof EditStaffFormSchema>;

/** Login form (web). */
export const LoginFormSchema = z.object({
  email: emailField,
  password: loginPasswordField,
});

export type LoginFormValues = z.infer<typeof LoginFormSchema>;

/** Profile display name form (web). */
export const ProfileNameFormSchema = z.object({
  fullName: profileFullNameField,
});

export type ProfileNameFormValues = z.infer<typeof ProfileNameFormSchema>;

/** Optional accession recall / return reason. */
export const AccessionReasonFormSchema = z.object({
  reason: reasonInputField,
});

export type AccessionReasonFormValues = z.infer<
  typeof AccessionReasonFormSchema
>;

/** Authorizer notify note. */
export const NotifyAuthorizerFormSchema = z.object({
  note: noteInputField,
});

export type NotifyAuthorizerFormValues = z.infer<
  typeof NotifyAuthorizerFormSchema
>;

/** Report email recipient form. */
export const EmailPatientReportFormSchema = z.object({
  to: emailField,
});

export type EmailPatientReportFormValues = z.infer<
  typeof EmailPatientReportFormSchema
>;

/** Labels / scanner accession lookup. */
export const AccessionLookupFormSchema = z.object({
  accession: accessionInputField,
});

export type AccessionLookupFormValues = z.infer<
  typeof AccessionLookupFormSchema
>;

/** Patient registry search box. */
export const PatientSearchFormSchema = z.object({
  query: searchQueryField,
});

export type PatientSearchFormValues = z.infer<typeof PatientSearchFormSchema>;

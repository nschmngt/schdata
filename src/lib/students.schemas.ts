import { z } from "zod";

export const studentIdSchema = z.object({
  id: z.string().trim().min(1, "Student ID is required."),
});

export const studentQuerySchema = z.object({
  search: z.string().optional().default(""),
  className: z.string().optional().default(""),
  gender: z.string().optional().default(""),
  feeStatus: z.string().optional().default(""),
  status: z.string().optional().default(""),
});

export const updateStudentDetailSchema = z.object({
  id: z.string().trim().min(1, "Student admission ID is required."),
  studentName: z.string().trim().min(2, "Student name must be at least 2 characters."),
  gender: z.string().trim().min(1, "Gender is required."),
  dob: z.string().nullable().optional(),
  placeOfBirth: z.string().nullable().optional(),
  classAdmitted: z.string().trim().min(1, "Class is required."),
  previousSchool: z.string().nullable().optional(),
  previousClass: z.string().nullable().optional(),
  lastAttendance: z.string().nullable().optional(),
  reasonForLeaving: z.string().nullable().optional(),
  disabilityStatus: z.string().default("No"),
  disabilityType: z.string().nullable().optional(),
  assistanceNeeded: z.string().nullable().optional(),
  parentName: z.string().trim().min(2, "Parent name is required."),
  relationship: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  altContact: z.string().nullable().optional(),
  parentEmail: z.string().trim().email("Valid parent email is required."),
  emergencyName: z.string().nullable().optional(),
  emergencyPhone: z.string().nullable().optional(),
  emergencyRelationship: z.string().nullable().optional(),
  emergencyResidence: z.string().nullable().optional(),
  emergencyResidenceDistrict: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  community: z.string().nullable().optional(),
  digitalAddress: z.string().nullable().optional(),
  hometown: z.string().nullable().optional(),
  hometownDistrict: z.string().nullable().optional(),
  residence: z.string().nullable().optional(),
  residenceDistrict: z.string().nullable().optional(),
  status: z.enum(["admitted", "promoted", "transferred", "graduated", "suspended", "withdrawn"]).default("admitted"),
});

export const updateStudentClassSchema = z.object({
  id: z.string().trim().min(1, "Student admission ID is required."),
  className: z.string().trim().min(1, "Class name is required."),
});

export const recordStudentExeatSchema = z.object({
  admissionId: z.string().trim().min(1, "Student admission ID is required."),
  status: z.enum(["out", "in_school"]),
  reason: z.string().trim().min(1, "Reason is required."),
  destination: z.string().trim().optional().default(""),
  returnAt: z.string().optional().default(""),
});

export type StudentIdInput = z.infer<typeof studentIdSchema>;
export type StudentQueryInput = z.infer<typeof studentQuerySchema>;
export type UpdateStudentDetailInput = z.infer<typeof updateStudentDetailSchema>;
export type UpdateStudentClassInput = z.infer<typeof updateStudentClassSchema>;
export type RecordStudentExeatInput = z.infer<typeof recordStudentExeatSchema>;

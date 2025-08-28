/**
 * Zod schemas for Special ETAPI endpoints
 * Including calendar, inbox, and system endpoints
 */

import { z } from 'zod';
import {
  EntityIdSchema,
  DateSchema,
  MonthSchema,
  YearSchema,
  UtcDateTimeSchema
} from './base.js';
import { NoteSchema } from './notes.js';

// ========== Calendar Schemas ==========

/**
 * CalendarNote schema - notes with calendar attributes
 */
export const CalendarNoteSchema = NoteSchema.extend({
  dateNote: DateSchema.optional(),
  weekNote: z.string().optional(),
  monthNote: MonthSchema.optional(),
  yearNote: YearSchema.optional()
});

/**
 * InboxNote schema - for GET /inbox/{date}
 */
export const InboxNoteSchema = NoteSchema.extend({
  inboxDate: DateSchema
});

/**
 * DayNotes response schema - for GET /calendar/days/{date}
 */
export const DayNotesResponseSchema = z.object({
  date: DateSchema,
  dayNote: CalendarNoteSchema.optional(),
  notes: z.array(CalendarNoteSchema)
});

/**
 * WeekNotes response schema - for GET /calendar/weeks/{date}
 */
export const WeekNotesResponseSchema = z.object({
  weekStart: DateSchema,
  weekEnd: DateSchema,
  weekNote: CalendarNoteSchema.optional(),
  notes: z.array(CalendarNoteSchema)
});

/**
 * MonthNotes response schema - for GET /calendar/months/{month}
 */
export const MonthNotesResponseSchema = z.object({
  month: MonthSchema,
  monthNote: CalendarNoteSchema.optional(),
  notes: z.array(CalendarNoteSchema)
});

/**
 * YearNotes response schema - for GET /calendar/years/{year}
 */
export const YearNotesResponseSchema = z.object({
  year: YearSchema,
  yearNote: CalendarNoteSchema.optional(),
  notes: z.array(CalendarNoteSchema)
});

// ========== Auth Schemas ==========

/**
 * LoginRequest schema - for POST /auth/login
 */
export const LoginRequestSchema = z.object({
  password: z.string().min(1)
});

/**
 * LoginResponse schema
 */
export const LoginResponseSchema = z.object({
  authToken: z.string().min(1)
});

/**
 * LogoutResponse schema - for POST /auth/logout
 */
export const LogoutResponseSchema = z.object({
  success: z.boolean()
});

// ========== System Schemas ==========

/**
 * AppInfo schema - for GET /app-info
 */
export const AppInfoSchema = z.object({
  appVersion: z.string(),
  dbVersion: z.number().int(),
  syncVersion: z.number().int(),
  buildDate: z.string(),
  buildRevision: z.string(),
  dataDirectory: z.string(),
  clipperProtocolVersion: z.string().optional(),
  utcDateTime: UtcDateTimeSchema
});

/**
 * BackupResponse schema - for PUT /backup/{backupName}
 */
export const BackupResponseSchema = z.object({
  success: z.boolean(),
  backupFile: z.string().optional(),
  message: z.string().optional()
});

/**
 * RefreshNoteOrderingResponse schema - for POST /refresh-note-ordering/{parentNoteId}
 */
export const RefreshNoteOrderingResponseSchema = z.object({
  success: z.boolean(),
  orderedNoteIds: z.array(EntityIdSchema).optional(),
  message: z.string().optional()
});

// Export types
export type CalendarNote = z.infer<typeof CalendarNoteSchema>;
export type InboxNote = z.infer<typeof InboxNoteSchema>;
export type DayNotesResponse = z.infer<typeof DayNotesResponseSchema>;
export type WeekNotesResponse = z.infer<typeof WeekNotesResponseSchema>;
export type MonthNotesResponse = z.infer<typeof MonthNotesResponseSchema>;
export type YearNotesResponse = z.infer<typeof YearNotesResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
export type AppInfo = z.infer<typeof AppInfoSchema>;
export type BackupResponse = z.infer<typeof BackupResponseSchema>;
export type RefreshNoteOrderingResponse = z.infer<typeof RefreshNoteOrderingResponseSchema>;
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const parkinsonUsers = pgTable("parkinson_users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
});

export const parkinsonSessions = pgTable("parkinson_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => parkinsonUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const patientCaregiverConnections = pgTable("patient_caregiver_connections", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => parkinsonUsers.id, { onDelete: "cascade" }),
  caregiverId: integer("caregiver_id").references(() => parkinsonUsers.id, { onDelete: "set null" }),
  caregiverEmail: text("caregiver_email").notNull(),
  caregiverName: text("caregiver_name").notNull(),
  caregiverPhone: text("caregiver_phone").notNull(),
  relationship: text("relationship").notNull(),
  status: text("status").notNull().default("PENDING"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type ParkinsonUser = typeof parkinsonUsers.$inferSelect;
export type PatientCaregiverConnection = typeof patientCaregiverConnections.$inferSelect;
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, parkinsonUsers, patientCaregiverConnections } from "@workspace/db";
import {
  ActivateEmergencyBody,
  CreateAppointmentBody,
  CreateMedicineBody,
  CreateMedicineOrderBody,
  SendChatMessageBody,
  UpdateCaregiverBody,
  UpdateDoseStatusBody,
  UpdateLocationBody,
  UpdateMedicineBody,
  UpdatePatientProfileBody,
} from "@workspace/api-zod";

type Medicine = {
  id: number;
  name: string;
  dosage: string;
  type: string;
  scheduledTime: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  instructions: string;
  active: boolean;
};
type Dose = {
  id: number;
  medicineId: number;
  medicineName: string;
  dosage: string;
  scheduledTime: string;
  date: string;
  actualTakenTime: string | null;
  status: "pending" | "due" | "taken" | "missed";
  instructions: string;
};

const today = new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

const medicines: Medicine[] = [
  {
    id: 1,
    name: "Levodopa",
    dosage: "100 mg",
    type: "Tablet",
    scheduledTime: "08:00 AM",
    frequency: "Daily",
    startDate: "2026-09-01",
    endDate: null,
    instructions: "Before food",
    active: true,
  },
  {
    id: 2,
    name: "Carbidopa",
    dosage: "25 mg",
    type: "Tablet",
    scheduledTime: "08:00 PM",
    frequency: "Daily",
    startDate: "2026-09-01",
    endDate: null,
    instructions: "With water",
    active: true,
  },
];
const initialMedicines: Medicine[] = structuredClone(medicines);
const medicinesByPatient = new Map<number, Medicine[]>();
function patientMedicines(patientId: number) {
  if (!medicinesByPatient.has(patientId)) medicinesByPatient.set(patientId, patientId === 1 ? structuredClone(initialMedicines) : []);
  return medicinesByPatient.get(patientId)!;
}

const doses: Dose[] = [
  { id: 1, medicineId: 1, medicineName: "Levodopa", dosage: "100 mg", scheduledTime: "08:00 AM", date: today, actualTakenTime: "07:56 AM", status: "taken", instructions: "Before food" },
  { id: 2, medicineId: 2, medicineName: "Carbidopa", dosage: "25 mg", scheduledTime: "08:00 PM", date: today, actualTakenTime: null, status: "pending", instructions: "With water" },
  { id: 3, medicineId: 1, medicineName: "Levodopa", dosage: "100 mg", scheduledTime: "08:00 AM", date: "2026-09-24", actualTakenTime: null, status: "missed", instructions: "Before food" },
  { id: 4, medicineId: 2, medicineName: "Carbidopa", dosage: "25 mg", scheduledTime: "08:00 PM", date: "2026-09-24", actualTakenTime: "07:59 PM", status: "taken", instructions: "With water" },
];
const initialDoses: Dose[] = structuredClone(doses);
const dosesByPatient = new Map<number, Dose[]>();
function patientDoses(patientId: number) {
  if (!dosesByPatient.has(patientId)) dosesByPatient.set(patientId, patientId === 1 ? structuredClone(initialDoses) : []);
  return dosesByPatient.get(patientId)!;
}

const initialNotifications = [
  { id: 1, title: "Evening dose coming up", message: "Carbidopa 25 mg is scheduled for 08:00 PM.", type: "medicine", createdAt: now(), read: false },
  { id: 2, title: "Weekly check-in", message: "Your adherence is 84% this week. Keep going.", type: "insight", createdAt: now(), read: false },
  { id: 3, title: "Demo mode is active", message: "External alerts and appointments stay inside this demo until a provider is connected.", type: "system", createdAt: now(), read: true },
];
const notificationsByPatient = new Map<number, typeof initialNotifications>();
function patientNotifications(patientId: number) {
  if (!notificationsByPatient.has(patientId)) notificationsByPatient.set(patientId, patientId === 1 ? structuredClone(initialNotifications) : []);
  return notificationsByPatient.get(patientId)!;
}

const initialActivity = [
  { id: 1, title: "Dose recorded", detail: "Levodopa 100 mg marked taken", timestamp: "Today, 07:56 AM", tone: "success" },
  { id: 2, title: "Reminder scheduled", detail: "Carbidopa 25 mg at 08:00 PM", timestamp: "Today, 07:40 AM", tone: "info" },
  { id: 3, title: "Adherence insight", detail: "Weekly adherence improved by 6%", timestamp: "Yesterday", tone: "warning" },
];
const activityByPatient = new Map<number, typeof initialActivity>();
function patientActivity(patientId: number) {
  if (!activityByPatient.has(patientId)) activityByPatient.set(patientId, patientId === 1 ? structuredClone(initialActivity) : []);
  return activityByPatient.get(patientId)!;
}

const initialChatHistory: Array<{ id: number; role: "user" | "assistant"; message: string; createdAt: string }> = [
  { id: 1, role: "assistant" as const, message: "Hello, I’m your Parkinson Care assistant. I can help you review today’s schedule and activity. I can’t diagnose, prescribe, or change your medicines.", createdAt: now() },
];
const chatHistoryByPatient = new Map<number, typeof initialChatHistory>();
function patientChatHistory(patientId: number) {
  if (!chatHistoryByPatient.has(patientId)) chatHistoryByPatient.set(patientId, patientId === 1 ? structuredClone(initialChatHistory) : []);
  return chatHistoryByPatient.get(patientId)!;
}

const initialCaregiver = { name: "Maya Thompson", phone: "+1 555 014 2255", email: "maya@example.test", relationship: "Daughter" };
const caregiversByPatient = new Map<number, typeof initialCaregiver>();
function patientCaregiver(patientId: number) {
  if (!caregiversByPatient.has(patientId)) caregiversByPatient.set(patientId, patientId === 1 ? { ...initialCaregiver } : { name: "", phone: "", email: "", relationship: "" });
  return caregiversByPatient.get(patientId)!;
}
type PatientLocation = { latitude: number; longitude: number; accuracy?: number; address?: string; updatedAt: string };
const locationsByPatient = new Map<number, PatientLocation>();
type PatientProfile = { id: number; fullName: string; age: number | null; email: string; phone: string; address: string; doctorName: string; clinic: string; doctorPhone: string; doctorEmail: string; department: string };
const patientProfiles = new Map<number, PatientProfile>();
function patientProfile(id: number) {
  if (!patientProfiles.has(id)) patientProfiles.set(id, { id, fullName: "Patient", age: null, email: "", phone: "", address: "", doctorName: "", clinic: "", doctorPhone: "", doctorEmail: "", department: "" });
  return patientProfiles.get(id)!;
}
export function setProfileIdentity(id: number, fullName: string, email: string) {
  Object.assign(patientProfile(id), { fullName, email });
}
const emergencies: Array<Record<string, unknown>> = [];
type ConnectionStatus = "Pending" | "Accepted" | "Rejected" | "Revoked";
type CaregiverConnection = {
  id: number;
  patientId: number;
  patientEmail: string;
  patientName: string;
  caregiverId: number | null;
  caregiverEmail: string;
  caregiverName: string;
  caregiverPhone: string;
  relationship: string;
  status: ConnectionStatus;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
const connections: CaregiverConnection[] = [];
async function hydrateConnections() {
  const [rows, users] = await Promise.all([db.select().from(patientCaregiverConnections), db.select().from(parkinsonUsers)]);
  const patientById = new Map(users.map((user) => [user.id, user]));
  connections.splice(0, connections.length, ...rows.map((row) => {
    const patient = patientById.get(row.patientId);
    return {
      id: row.id,
      patientId: row.patientId,
      patientEmail: patient?.email ?? "",
      patientName: patient?.fullName ?? "Patient",
      caregiverId: row.caregiverId,
      caregiverEmail: row.caregiverEmail,
      caregiverName: row.caregiverName,
      caregiverPhone: row.caregiverPhone,
      relationship: row.relationship,
      status: row.status.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase()) as ConnectionStatus,
      invitedAt: row.invitedAt?.toISOString() ?? now(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }));
}
const initialAppointments: Array<Record<string, unknown>> = [
  { id: 1, placeId: 1, hospitalName: "City Neurology Centre", doctorOrDepartment: "Movement Disorders", date: "2026-10-02", time: "10:30 AM", reason: "Routine follow-up", status: "Requested", createdAt: now() },
];
const appointmentsByPatient = new Map<number, Array<Record<string, unknown>>>();
function patientAppointments(patientId: number) {
  if (!appointmentsByPatient.has(patientId)) appointmentsByPatient.set(patientId, patientId === 1 ? structuredClone(initialAppointments) : []);
  return appointmentsByPatient.get(patientId)!;
}
const ordersByPatient = new Map<number, Array<Record<string, unknown>>>();
function patientOrders(patientId: number) {
  if (!ordersByPatient.has(patientId)) ordersByPatient.set(patientId, []);
  return ordersByPatient.get(patientId)!;
}
const places = [
  { id: 1, name: "City Neurology Centre", category: "Hospital", distance: "1.8 km", address: "14 Residency Road, Bengaluru", phone: "+91 80 5555 0111", status: "Open today", services: ["Neurology", "Emergency care", "Pharmacy"], integrationStatus: "Demo directory" },
  { id: 2, name: "Green Cross Hospital", category: "Hospital", distance: "3.4 km", address: "88 Richmond Road, Bengaluru", phone: "+91 80 5555 0222", status: "Open 24 hours", services: ["Emergency care", "Imaging"], integrationStatus: "Demo directory" },
];
const nearbyPlacesById = new Map<number, { name: string; category: string; address: string; distance: string; latitude: number; longitude: number; directionsUrl: string; provider: string }>();
const nearbySearchCache = new Map<string, { createdAt: number; results: Array<Record<string, unknown>> }>();
const NEARBY_PAGE_SIZE = 10;
const NEARBY_CACHE_MS = 3 * 60 * 1000;
const pharmacies = [
  { id: 3, name: "WellSpring Pharmacy", category: "Pharmacy", distance: "0.9 km", address: "3 Church Street, Bengaluru", phone: "+91 80 5555 0333", status: "Open until 10 PM", services: ["Prescription pickup"], integrationStatus: "Inventory integration required" },
  { id: 4, name: "CarePoint Pharmacy", category: "Pharmacy", distance: "2.2 km", address: "29 MG Road, Bengaluru", phone: "+91 80 5555 0444", status: "Open today", services: ["Home delivery"], integrationStatus: "Inventory integration required" },
];
const ambulances = [
  { id: 5, name: "Emergency services directory", category: "Emergency service", distance: "Call local service", address: "Use your local emergency number", phone: "112", status: "Dispatch integration required", services: ["Emergency call", "Directions"], integrationStatus: "Integration required" },
];

function stats(doseRows: Dose[] = doses, notificationRows = initialNotifications) {
  const todayDoses = doseRows.filter((dose) => dose.date === today);
  const taken = doseRows.filter((dose) => dose.status === "taken").length;
  const missed = doseRows.filter((dose) => dose.status === "missed").length;
  const completed = taken + missed;
  const adherence = completed ? Math.round((taken / completed) * 100) : 100;
  return { todayDoses: todayDoses.length, takenDoses: todayDoses.filter((d) => d.status === "taken").length, missedDoses: todayDoses.filter((d) => d.status === "missed").length, pendingDoses: todayDoses.filter((d) => d.status === "pending" || d.status === "due").length, adherence, unreadNotifications: notificationRows.filter((n) => !n.read).length, riskLevel: adherence >= 80 ? "LOW" : adherence >= 60 ? "MEDIUM" : "HIGH" };
}

function risk(doseRows: Dose[] = doses, notificationRows = initialNotifications) {
  const s = stats(doseRows, notificationRows);
  const probability = s.riskLevel === "LOW" ? 18 : s.riskLevel === "MEDIUM" ? 46 : 78;
  return { adherence: s.adherence, riskLevel: s.riskLevel, probability, totalDoses: doseRows.length, takenDoses: doseRows.filter((d) => d.status === "taken").length, missedDoses: doseRows.filter((d) => d.status === "missed").length, pendingDoses: doseRows.filter((d) => d.status === "pending" || d.status === "due").length, explanation: s.riskLevel === "LOW" ? "Your recent medication routine is consistent." : "Your medication adherence is decreasing. Stronger reminders may be helpful.", recommendation: "Keep your schedule visible, use voice reminders, and contact your doctor for medical questions." };
}

const router: IRouter = Router();
router.use((req, res, next) => {
  const user = res.locals.user as { role?: "patient" | "caregiver" } | undefined;
  if (req.path.startsWith("/caregiver")) return next();
  if (user?.role !== "patient") return res.status(403).json({ error: "Patient account required." });
  return next();
});

router.get("/dashboard", (req, res) => {
  const user = res.locals.user as { id: number; fullName: string };
  const userDoses = patientDoses(user.id);
  const s = stats(userDoses, patientNotifications(user.id));
  res.json({ patientName: user.fullName, greeting: "Good morning", stats: s, nextDose: userDoses.find((d) => d.date === today && (d.status === "pending" || d.status === "due")) ?? null, recentActivity: patientActivity(user.id), adherence: [{ label: "Mon", value: s.adherence }, { label: "Tue", value: s.adherence }, { label: "Wed", value: s.adherence }, { label: "Thu", value: s.adherence }, { label: "Fri", value: s.adherence }, { label: "Sat", value: s.adherence }, { label: "Sun", value: s.adherence }] });
});
router.get("/medicines", (_req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientMedicines(user.id));
});
router.post("/medicines", (req, res) => {
  const input = CreateMedicineBody.parse(req.body);
  const user = res.locals.user as { id: number };
  const userMedicines = patientMedicines(user.id);
  const medicine: Medicine = { id: Math.max(...userMedicines.map((m) => m.id), 0) + 1, startDate: input.startDate ?? today, endDate: input.endDate ?? null, active: true, ...input };
  userMedicines.push(medicine);
  res.status(201).json(medicine);
});
router.put("/medicines/:id", (req, res) => {
  const input = UpdateMedicineBody.parse(req.body);
  const user = res.locals.user as { id: number };
  const medicine = patientMedicines(user.id).find((m) => m.id === Number(req.params.id));
  if (!medicine) return res.status(404).json({ error: "Medicine not found" });
  Object.assign(medicine, input);
  return res.json(medicine);
});
router.delete("/medicines/:id", (req, res) => {
  const user = res.locals.user as { id: number };
  const userMedicines = patientMedicines(user.id);
  const index = userMedicines.findIndex((m) => m.id === Number(req.params.id));
  if (index < 0) return res.status(404).json({ error: "Medicine not found" });
  userMedicines.splice(index, 1);
  return res.sendStatus(204);
});
router.get("/dose-status", (_req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientDoses(user.id));
});
router.post("/dose-status", (req, res) => {
  const input = UpdateDoseStatusBody.parse(req.body);
  const user = res.locals.user as { id: number };
  const dose = patientDoses(user.id).find((d) => d.id === input.doseId);
  if (!dose) return res.status(404).json({ error: "Dose not found" });
  dose.status = input.status as Dose["status"];
  dose.actualTakenTime = input.status === "taken" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return res.json(dose);
});
router.get("/notifications", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientNotifications(user.id));
});
router.put("/notifications/:id/read", (req, res) => {
  const user = res.locals.user as { id: number };
  const notification = patientNotifications(user.id).find((n) => n.id === Number(req.params.id));
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  notification.read = true;
  return res.json(notification);
});
router.get("/chat/history", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientChatHistory(user.id));
});
router.post("/chat", (req, res) => {
  const sessionUser = res.locals.user as { id: number };
  const chatHistory = patientChatHistory(sessionUser.id);
  const input = SendChatMessageBody.parse(req.body);
  const user = { id: chatHistory.length + 1, role: "user" as const, message: input.message, createdAt: now() };
  const text = input.message.toLowerCase();
  const userDoses = patientDoses(sessionUser.id);
  const userNotifications = patientNotifications(sessionUser.id);
  const userRisk = risk(userDoses, userNotifications);
  let message = "I can help you review your Parkinson Care schedule. I can’t diagnose, prescribe, or change medication. For medical decisions, please speak with your doctor.";
  if (text.includes("today") || text.includes("medicine")) message = `You have ${stats(userDoses, userNotifications).todayDoses} medicines scheduled today. Your next dose is ${userDoses.find((d) => d.date === today && (d.status === "pending" || d.status === "due"))?.medicineName ?? "none pending"}.`;
  if (text.includes("miss")) message = `You have ${stats(userDoses, userNotifications).missedDoses} missed doses today and ${userRisk.missedDoses} in your current history.`;
  if (text.includes("adherence")) message = `Your current informational adherence estimate is ${userRisk.adherence}%, which is ${userRisk.riskLevel.toLowerCase()} risk.`;
  const assistant = { id: chatHistory.length + 2, role: "assistant" as const, message, createdAt: now() };
  chatHistory.push(user, assistant);
  return res.json(assistant);
});
router.get("/ai-risk", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(risk(patientDoses(user.id), patientNotifications(user.id)));
});
router.get("/caregiver", (_req, res) => {
  const user = res.locals.user as { id: number; role: "patient" | "caregiver" };
  if (user.role !== "patient") return res.status(403).json({ error: "Patient account required." });
  return res.json(patientCaregiver(user.id));
});
router.put("/caregiver", (req, res) => {
  const user = res.locals.user as { id: number; role: "patient" | "caregiver" };
  if (user.role !== "patient") return res.status(403).json({ error: "Patient account required." });
  const caregiver = UpdateCaregiverBody.parse(req.body);
  caregiversByPatient.set(user.id, caregiver);
  return res.json(caregiver);
});
router.get("/caregiver/connections", async (req, res) => {
  const user = res.locals.user as { id: number; email: string; fullName: string; role: "patient" | "caregiver" };
  await hydrateConnections();
  if (user.role === "caregiver") return res.json(connections.filter((connection) => connection.caregiverEmail === user.email));
  return res.json(connections.filter((connection) => connection.patientId === user.id));
});
router.post("/caregiver/connections", async (req, res) => {
  const user = res.locals.user as { id: number; email: string; fullName: string; role: "patient" | "caregiver" };
  if (user.role !== "patient") return res.status(403).json({ error: "Only patients can invite caregivers." });
  await hydrateConnections();
  const body = req.body as Record<string, unknown>;
  const caregiverEmail = String(body.email ?? "").trim().toLowerCase();
  const caregiverName = String(body.name ?? "").trim();
  const caregiverPhone = String(body.phone ?? "").trim();
  const relationship = String(body.relationship ?? "").trim();
  if (caregiverName.length < 2 || !caregiverEmail.includes("@") || !caregiverPhone || !relationship) return res.status(400).json({ error: "Caregiver name, email, phone, and relationship are required." });
  if (caregiverEmail === user.email) return res.status(400).json({ error: "A patient cannot invite their own account." });
  if (connections.some((connection) => connection.patientId === user.id && connection.caregiverEmail === caregiverEmail && connection.status !== "Revoked")) return res.status(409).json({ error: "This caregiver already has an active invitation or connection." });
  const [stored] = await db.insert(patientCaregiverConnections).values({ patientId: user.id, caregiverId: null, caregiverEmail, caregiverName, caregiverPhone, relationship, status: "PENDING" }).returning({ id: patientCaregiverConnections.id });
  const connection: CaregiverConnection = { id: stored.id, patientId: user.id, patientEmail: user.email, patientName: user.fullName, caregiverId: null, caregiverEmail, caregiverName, caregiverPhone, relationship, status: "Pending", invitedAt: now(), acceptedAt: null, revokedAt: null };
  connections.push(connection);
  return res.status(201).json(connection);
});
router.get("/caregiver/invitations", async (req, res) => {
  const user = res.locals.user as { email: string; role: "patient" | "caregiver" };
  if (user.role !== "caregiver") return res.status(403).json({ error: "Caregiver account required." });
  await hydrateConnections();
  return res.json(connections.filter((connection) => connection.caregiverEmail === user.email && connection.status === "Pending"));
});
router.post("/caregiver/invitations/:id/:decision", async (req, res) => {
  const user = res.locals.user as { id: number; email: string; role: "patient" | "caregiver" };
  if (user.role !== "caregiver") return res.status(403).json({ error: "Caregiver account required." });
  await hydrateConnections();
  const connection = connections.find((item) => item.id === Number(req.params.id) && item.caregiverEmail === user.email && item.status === "Pending");
  if (!connection) return res.status(404).json({ error: "Invitation not found or no longer pending." });
  if (req.params.decision !== "accept" && req.params.decision !== "reject") return res.status(400).json({ error: "Decision must be accept or reject." });
  connection.status = req.params.decision === "accept" ? "Accepted" : "Rejected";
  connection.caregiverId = user.id;
  connection.acceptedAt = connection.status === "Accepted" ? now() : null;
  await db.update(patientCaregiverConnections).set({ caregiverId: user.id, status: connection.status.toUpperCase(), acceptedAt: connection.acceptedAt ? new Date(connection.acceptedAt) : null }).where(eq(patientCaregiverConnections.id, connection.id));
  return res.json(connection);
});
router.patch("/caregiver/connections/:id/revoke", async (req, res) => {
  const user = res.locals.user as { id: number; role: "patient" | "caregiver" };
  if (user.role !== "patient") return res.status(403).json({ error: "Only patients can revoke caregiver access." });
  await hydrateConnections();
  const connection = connections.find((item) => item.id === Number(req.params.id) && item.patientId === user.id);
  if (!connection) return res.status(404).json({ error: "Caregiver connection not found." });
  connection.status = "Revoked";
  connection.revokedAt = now();
  await db.update(patientCaregiverConnections).set({ status: "REVOKED", revokedAt: new Date(connection.revokedAt) }).where(eq(patientCaregiverConnections.id, connection.id));
  return res.json(connection);
});
router.get("/caregiver/patients", async (req, res) => {
  const user = res.locals.user as { email: string; role: "patient" | "caregiver" };
  if (user.role !== "caregiver") return res.status(403).json({ error: "Caregiver account required." });
  await hydrateConnections();
  return res.json(connections.filter((connection) => connection.caregiverEmail === user.email && connection.status === "Accepted").map((connection) => ({ id: connection.patientId, name: connection.patientName, relationship: connection.relationship, connectedAt: connection.acceptedAt })));
});
function acceptedConnectionFor(res: any, patientId: number) {
  const user = res.locals.user as { email: string; role: "patient" | "caregiver" };
  if (user.role !== "caregiver") return null;
  return connections.find((connection) => connection.patientId === patientId && connection.caregiverEmail === user.email && connection.status === "Accepted") ?? null;
}
router.get("/caregiver/patients/:patientId/summary", async (req, res) => {
  const patientId = Number(req.params.patientId);
  await hydrateConnections();
  if (!acceptedConnectionFor(res, patientId)) return res.status(403).json({ error: "This patient is not connected to your caregiver account." });
  const patientDoseRows = patientDoses(patientId);
  const patientNotificationRows = patientNotifications(patientId);
  const s = stats(patientDoseRows, patientNotificationRows);
  return res.json({ patientId, patientName: connections.find((connection) => connection.patientId === patientId)?.patientName, stats: s, todayDoses: patientDoseRows.filter((dose) => dose.date === today), medicationHistory: patientDoseRows, risk: risk(patientDoseRows, patientNotificationRows) });
});
router.get("/caregiver/emergency-alerts", async (req, res) => {
  const user = res.locals.user as { email: string; role: "patient" | "caregiver" };
  if (user.role !== "caregiver") return res.status(403).json({ error: "Caregiver account required." });
  await hydrateConnections();
  const patientIds = new Set(connections.filter((connection) => connection.caregiverEmail === user.email && connection.status === "Accepted").map((connection) => connection.patientId));
  return res.json(emergencies.filter((event) => patientIds.has(Number(event.patientId))));
});
router.get("/emergency/history", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(emergencies.filter((event) => Number(event.patientId) === user.id));
});
router.post("/emergency/sos", (req, res) => {
  const input = req.body && Object.keys(req.body).length ? ActivateEmergencyBody.parse(req.body) : null;
  const sessionUser = res.locals.user as { id: number; email: string; fullName: string };
  const savedLocation = locationsByPatient.get(sessionUser.id);
  const event = { id: emergencies.length + 1, status: "Activated", createdAt: now(), patientId: sessionUser.id, patientEmail: sessionUser.email, patientName: sessionUser.fullName, latitude: input?.latitude ?? savedLocation?.latitude ?? null, longitude: input?.longitude ?? savedLocation?.longitude ?? null, notificationStatus: "Demo notification created", resolutionStatus: "Open" };
  emergencies.unshift(event);
  const userNotifications = patientNotifications(sessionUser.id);
  userNotifications.unshift({ id: Math.max(...userNotifications.map((notification) => notification.id), 0) + 1, title: "Emergency SOS activated", message: "Demo notification created for your caregiver. No SMS or dispatch service is connected.", type: "emergency", createdAt: now(), read: false });
  return res.status(201).json(event);
});
router.post("/emergency/:id/cancel", (req, res) => {
  const user = res.locals.user as { id: number };
  const event = emergencies.find((item) => item.id === Number(req.params.id) && Number(item.patientId) === user.id);
  if (!event) return res.status(404).json({ error: "Emergency event not found" });
  event.status = "Cancelled";
  event.resolutionStatus = "Cancelled";
  return res.json(event);
});
router.get("/location/current", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(locationsByPatient.get(user.id) ?? null);
});
router.post("/location/update", (req, res) => {
  const input = UpdateLocationBody.parse(req.body);
  const user = res.locals.user as { id: number };
  const accuracy = Number(req.body?.accuracy);
  const saved: PatientLocation = { ...input, accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : undefined, updatedAt: now() };
  locationsByPatient.set(user.id, saved);
  return res.json(saved);
});
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
let nominatimLastRequest = 0;
async function searchNearby(res: import("express").Response, patientId: number, latitude: number, longitude: number, category: "hospital" | "pharmacy", offset: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return res.status(400).json({ error: "Valid coordinates are required." });
  const latestLocation = locationsByPatient.get(patientId);
  if (!latestLocation || latestLocation.latitude !== latitude || latestLocation.longitude !== longitude) return res.status(403).json({ error: "Nearby search is limited to your saved, permissioned current location. Refresh your location first." });
  const cacheKey = `${patientId}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${category}`;
  const cached = nearbySearchCache.get(cacheKey);
  const page = (results: Array<Record<string, unknown>>) => {
    const pageResults = results.slice(offset, offset + NEARBY_PAGE_SIZE);
    const nextOffset = offset + pageResults.length < results.length ? offset + pageResults.length : null;
    return res.json({ provider: "OpenStreetMap / Nominatim", results: pageResults, offset, nextOffset, totalReturned: results.length });
  };
  if (cached && Date.now() - cached.createdAt < NEARBY_CACHE_MS) return page(cached.results);
  const latPadding = 0.18;
  const lonPadding = 0.18 / Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  const params = new URLSearchParams({ format: "jsonv2", q: category, viewbox: `${longitude - lonPadding},${latitude + latPadding},${longitude + lonPadding},${latitude - latPadding}`, bounded: "1", addressdetails: "1", limit: "40" });
  try {
    const waitMs = Math.max(0, 1100 - (Date.now() - nominatimLastRequest));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nominatimLastRequest = Date.now();
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json", "User-Agent": "ParkinsonCareAI/1.0 (nearby healthcare search)" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return res.status(502).json({ error: `OpenStreetMap search is temporarily unavailable (${response.status}). Please try again shortly.` });
    const raw = await response.json() as Array<{ place_id: number; lat: string; lon: string; name?: string; display_name: string; type?: string; class?: string; address?: Record<string, string> }>;
    const results = raw.map((place) => {
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      const distanceKm = haversineKm(latitude, longitude, lat, lon);
      const id = Number(place.place_id);
      const result = { id, name: place.name || place.display_name.split(",")[0] || "Unnamed place", category: place.type || category, address: place.display_name, distanceKm, distance: `${distanceKm.toFixed(1)} km`, latitude: lat, longitude: lon, directionsUrl: `https://www.openstreetmap.org/directions?from=${latitude}%2C${longitude}&to=${lat}%2C${lon}`, provider: "OpenStreetMap / Nominatim", integrationStatus: "OpenStreetMap directory" };
      nearbyPlacesById.set(id, result);
      return result;
    }).filter((place) => place.distanceKm <= 20).sort((a, b) => a.distanceKm - b.distanceKm);
    nearbySearchCache.set(cacheKey, { createdAt: Date.now(), results });
    return page(results);
  } catch {
    return res.status(502).json({ error: "OpenStreetMap search could not be reached. Check your connection and try again." });
  }
}
router.get("/nearby/search", async (req, res) => {
  const user = res.locals.user as { id: number };
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const category = req.query.category === "pharmacy" ? "pharmacy" : req.query.category === "hospital" ? "hospital" : null;
  const offset = Math.max(0, Math.min(500, Number(req.query.offset) || 0));
  if (!category) return res.status(400).json({ error: "Category must be hospital or pharmacy." });
  return searchNearby(res, user.id, latitude, longitude, category, offset);
});
router.get("/nearby/hospitals", async (_req, res) => {
  const user = res.locals.user as { id: number };
  const current = locationsByPatient.get(user.id);
  if (!current) return res.json([]);
  const result = await searchNearby(res, user.id, current.latitude, current.longitude, "hospital", 0);
  return result;
});
router.get("/nearby/pharmacies", async (_req, res) => {
  const user = res.locals.user as { id: number };
  const current = locationsByPatient.get(user.id);
  if (!current) return res.json([]);
  return searchNearby(res, user.id, current.latitude, current.longitude, "pharmacy", 0);
});
router.get("/nearby/ambulances", (_req, res) => res.json(ambulances));
router.get("/appointments", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientAppointments(user.id));
});
router.post("/appointments", (req, res) => {
  const user = res.locals.user as { id: number };
  const appointments = patientAppointments(user.id);
  const input = CreateAppointmentBody.parse(req.body);
  const place = nearbyPlacesById.get(input.placeId);
  const appointment = { ...input, id: Math.max(...appointments.map((item) => Number(item.id) || 0), 0) + 1, hospitalName: place?.name ?? "Selected healthcare provider", status: "Requested", createdAt: now() };
  appointments.unshift(appointment);
  return res.status(201).json(appointment);
});
router.get("/medicine/search", (_req, res) => res.json([]));
router.get("/medicine/orders", (req, res) => {
  const user = res.locals.user as { id: number };
  return res.json(patientOrders(user.id));
});
router.post("/medicine/orders", (req, res) => {
  const user = res.locals.user as { id: number };
  const orders = patientOrders(user.id);
  const input = CreateMedicineOrderBody.parse(req.body);
  const order = { ...input, id: Math.max(...orders.map((item) => Number(item.id) || 0), 0) + 1, status: "Requested", createdAt: now(), integrationStatus: "Medicine order request · integration required" };
  orders.unshift(order);
  return res.status(201).json(order);
});
router.get("/reports/adherence", (req, res) => {
  const user = res.locals.user as { id: number };
  const doseRows = patientDoses(user.id);
  const pointsFor = (keyFor: (date: Date) => string) => {
    const buckets = new Map<string, { total: number; completed: number; taken: number }>();
    for (const dose of doseRows) {
      const bucket = keyFor(new Date(`${dose.date}T12:00:00Z`));
      if (!buckets.has(bucket)) buckets.set(bucket, { total: 0, completed: 0, taken: 0 });
      const values = buckets.get(bucket)!;
      values.total += 1;
      if (dose.status === "taken" || dose.status === "missed") {
        values.completed += 1;
        if (dose.status === "taken") values.taken += 1;
      }
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => ({ label, value: values.completed ? Math.round((values.taken / values.completed) * 100) : 0 }));
  };
  const byMedicine = patientMedicines(user.id).map((medicine) => {
    const rows = doseRows.filter((dose) => dose.medicineId === medicine.id && (dose.status === "taken" || dose.status === "missed"));
    return { label: medicine.name, value: rows.length ? Math.round((rows.filter((dose) => dose.status === "taken").length / rows.length) * 100) : 0 };
  });
  return res.json({
    daily: pointsFor((date) => date.toISOString().slice(0, 10)),
    weekly: pointsFor((date) => {
      const week = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
      return `Week of ${week.toISOString().slice(0, 10)}`;
    }),
    monthly: pointsFor((date) => date.toISOString().slice(0, 7)),
    byMedicine,
  });
});
router.get("/patients/me", (_req, res) => {
  const user = res.locals.user as { id: number; fullName: string; email: string };
  const current = patientProfile(user.id);
  return res.json({ ...current, fullName: current.fullName === "Patient" ? user.fullName : current.fullName, email: current.email || user.email });
});
router.put("/patients/me", (req, res) => {
  const user = res.locals.user as { id: number; fullName: string; email: string };
  const updated = Object.assign(patientProfile(user.id), UpdatePatientProfileBody.parse(req.body), { id: user.id, email: user.email });
  return res.json(updated);
});

export default router;
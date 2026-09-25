import { Router, type IRouter } from "express";
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

const doses: Dose[] = [
  { id: 1, medicineId: 1, medicineName: "Levodopa", dosage: "100 mg", scheduledTime: "08:00 AM", date: today, actualTakenTime: "07:56 AM", status: "taken", instructions: "Before food" },
  { id: 2, medicineId: 2, medicineName: "Carbidopa", dosage: "25 mg", scheduledTime: "08:00 PM", date: today, actualTakenTime: null, status: "pending", instructions: "With water" },
  { id: 3, medicineId: 1, medicineName: "Levodopa", dosage: "100 mg", scheduledTime: "08:00 AM", date: "2026-09-24", actualTakenTime: null, status: "missed", instructions: "Before food" },
  { id: 4, medicineId: 2, medicineName: "Carbidopa", dosage: "25 mg", scheduledTime: "08:00 PM", date: "2026-09-24", actualTakenTime: "07:59 PM", status: "taken", instructions: "With water" },
];

const notifications = [
  { id: 1, title: "Evening dose coming up", message: "Carbidopa 25 mg is scheduled for 08:00 PM.", type: "medicine", createdAt: now(), read: false },
  { id: 2, title: "Weekly check-in", message: "Your adherence is 84% this week. Keep going.", type: "insight", createdAt: now(), read: false },
  { id: 3, title: "Demo mode is active", message: "External alerts and appointments stay inside this demo until a provider is connected.", type: "system", createdAt: now(), read: true },
];

const activity = [
  { id: 1, title: "Dose recorded", detail: "Levodopa 100 mg marked taken", timestamp: "Today, 07:56 AM", tone: "success" },
  { id: 2, title: "Reminder scheduled", detail: "Carbidopa 25 mg at 08:00 PM", timestamp: "Today, 07:40 AM", tone: "info" },
  { id: 3, title: "Adherence insight", detail: "Weekly adherence improved by 6%", timestamp: "Yesterday", tone: "warning" },
];

const chatHistory: Array<{ id: number; role: "user" | "assistant"; message: string; createdAt: string }> = [
  { id: 1, role: "assistant" as const, message: "Hello, I’m your Parkinson Care assistant. I can help you review today’s schedule and activity. I can’t diagnose, prescribe, or change your medicines.", createdAt: now() },
];

let caregiver = { name: "Maya Thompson", phone: "+1 555 014 2255", email: "maya@example.test", relationship: "Daughter" };
let location = { latitude: 12.9716, longitude: 77.5946, address: "Demo location · Bengaluru", updatedAt: now() };
let profile = { id: 1, fullName: "Asha Rao", age: 68, email: "asha@example.test", phone: "+1 555 010 1212", address: "Demo address, Bengaluru", doctorName: "Dr. Kavita Menon", clinic: "City Neurology Centre", doctorPhone: "+1 555 010 1313", doctorEmail: "doctor@example.test", department: "Movement Disorders" };
const emergencies: Array<Record<string, unknown>> = [];
const appointments: Array<Record<string, unknown>> = [
  { id: 1, placeId: 1, hospitalName: "City Neurology Centre", doctorOrDepartment: "Movement Disorders", date: "2026-10-02", time: "10:30 AM", reason: "Routine follow-up", status: "Requested", createdAt: now() },
];
const orders: Array<Record<string, unknown>> = [];
const places = [
  { id: 1, name: "City Neurology Centre", category: "Hospital", distance: "1.8 km", address: "14 Residency Road, Bengaluru", phone: "+91 80 5555 0111", status: "Open today", services: ["Neurology", "Emergency care", "Pharmacy"], integrationStatus: "Demo directory" },
  { id: 2, name: "Green Cross Hospital", category: "Hospital", distance: "3.4 km", address: "88 Richmond Road, Bengaluru", phone: "+91 80 5555 0222", status: "Open 24 hours", services: ["Emergency care", "Imaging"], integrationStatus: "Demo directory" },
];
const pharmacies = [
  { id: 3, name: "WellSpring Pharmacy", category: "Pharmacy", distance: "0.9 km", address: "3 Church Street, Bengaluru", phone: "+91 80 5555 0333", status: "Open until 10 PM", services: ["Prescription pickup"], integrationStatus: "Inventory integration required" },
  { id: 4, name: "CarePoint Pharmacy", category: "Pharmacy", distance: "2.2 km", address: "29 MG Road, Bengaluru", phone: "+91 80 5555 0444", status: "Open today", services: ["Home delivery"], integrationStatus: "Inventory integration required" },
];
const ambulances = [
  { id: 5, name: "Emergency services directory", category: "Emergency service", distance: "Call local service", address: "Use your local emergency number", phone: "112", status: "Dispatch integration required", services: ["Emergency call", "Directions"], integrationStatus: "Integration required" },
];

function stats() {
  const todayDoses = doses.filter((dose) => dose.date === today);
  const taken = doses.filter((dose) => dose.status === "taken").length;
  const missed = doses.filter((dose) => dose.status === "missed").length;
  const completed = taken + missed;
  const adherence = completed ? Math.round((taken / completed) * 100) : 100;
  return { todayDoses: todayDoses.length, takenDoses: todayDoses.filter((d) => d.status === "taken").length, missedDoses: todayDoses.filter((d) => d.status === "missed").length, pendingDoses: todayDoses.filter((d) => d.status === "pending" || d.status === "due").length, adherence, unreadNotifications: notifications.filter((n) => !n.read).length, riskLevel: adherence >= 80 ? "LOW" : adherence >= 60 ? "MEDIUM" : "HIGH" };
}

function risk() {
  const s = stats();
  const probability = s.riskLevel === "LOW" ? 18 : s.riskLevel === "MEDIUM" ? 46 : 78;
  return { adherence: s.adherence, riskLevel: s.riskLevel, probability, totalDoses: doses.length, takenDoses: doses.filter((d) => d.status === "taken").length, missedDoses: doses.filter((d) => d.status === "missed").length, pendingDoses: doses.filter((d) => d.status === "pending" || d.status === "due").length, explanation: s.riskLevel === "LOW" ? "Your recent medication routine is consistent." : "Your medication adherence is decreasing. Stronger reminders may be helpful.", recommendation: "Keep your schedule visible, use voice reminders, and contact your doctor for medical questions." };
}

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => {
  const s = stats();
  res.json({ patientName: profile.fullName, greeting: "Good morning", stats: s, nextDose: doses.find((d) => d.date === today && (d.status === "pending" || d.status === "due")) ?? null, recentActivity: activity, adherence: [{ label: "Mon", value: 88 }, { label: "Tue", value: 76 }, { label: "Wed", value: 92 }, { label: "Thu", value: 84 }, { label: "Fri", value: s.adherence }, { label: "Sat", value: 90 }, { label: "Sun", value: 86 }] });
});
router.get("/medicines", (_req, res) => res.json(medicines));
router.post("/medicines", (req, res) => {
  const input = CreateMedicineBody.parse(req.body);
  const medicine: Medicine = { id: Math.max(...medicines.map((m) => m.id), 0) + 1, startDate: input.startDate ?? today, endDate: input.endDate ?? null, active: true, ...input };
  medicines.push(medicine);
  res.status(201).json(medicine);
});
router.put("/medicines/:id", (req, res) => {
  const input = UpdateMedicineBody.parse(req.body);
  const medicine = medicines.find((m) => m.id === Number(req.params.id));
  if (!medicine) return res.status(404).json({ error: "Medicine not found" });
  Object.assign(medicine, input);
  return res.json(medicine);
});
router.delete("/medicines/:id", (req, res) => {
  const index = medicines.findIndex((m) => m.id === Number(req.params.id));
  if (index < 0) return res.status(404).json({ error: "Medicine not found" });
  medicines.splice(index, 1);
  return res.sendStatus(204);
});
router.get("/dose-status", (_req, res) => res.json(doses));
router.post("/dose-status", (req, res) => {
  const input = UpdateDoseStatusBody.parse(req.body);
  const dose = doses.find((d) => d.id === input.doseId);
  if (!dose) return res.status(404).json({ error: "Dose not found" });
  dose.status = input.status as Dose["status"];
  dose.actualTakenTime = input.status === "taken" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return res.json(dose);
});
router.get("/notifications", (_req, res) => res.json(notifications));
router.put("/notifications/:id/read", (req, res) => {
  const notification = notifications.find((n) => n.id === Number(req.params.id));
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  notification.read = true;
  return res.json(notification);
});
router.get("/chat/history", (_req, res) => res.json(chatHistory));
router.post("/chat", (req, res) => {
  const input = SendChatMessageBody.parse(req.body);
  const user = { id: chatHistory.length + 1, role: "user" as const, message: input.message, createdAt: now() };
  const text = input.message.toLowerCase();
  let message = "I can help you review your Parkinson Care schedule. I can’t diagnose, prescribe, or change medication. For medical decisions, please speak with your doctor.";
  if (text.includes("today") || text.includes("medicine")) message = `You have ${stats().todayDoses} medicines scheduled today. Your next dose is ${doses.find((d) => d.status === "pending")?.medicineName ?? "none pending"}.`;
  if (text.includes("miss")) message = `You have ${stats().missedDoses} missed doses today and ${risk().missedDoses} in the current demo history.`;
  if (text.includes("adherence")) message = `Your current informational adherence estimate is ${risk().adherence}%, which is ${risk().riskLevel.toLowerCase()} risk.`;
  const assistant = { id: chatHistory.length + 2, role: "assistant" as const, message, createdAt: now() };
  chatHistory.push(user, assistant);
  return res.json(assistant);
});
router.get("/ai-risk", (_req, res) => res.json(risk()));
router.get("/caregiver", (_req, res) => res.json(caregiver));
router.put("/caregiver", (req, res) => { caregiver = UpdateCaregiverBody.parse(req.body); return res.json(caregiver); });
router.get("/emergency/history", (_req, res) => res.json(emergencies));
router.post("/emergency/sos", (req, res) => {
  const input = req.body && Object.keys(req.body).length ? ActivateEmergencyBody.parse(req.body) : null;
  const event = { id: emergencies.length + 1, status: "Activated", createdAt: now(), patientName: profile.fullName, latitude: input?.latitude ?? location.latitude, longitude: input?.longitude ?? location.longitude, notificationStatus: "Demo notification created", resolutionStatus: "Open" };
  emergencies.unshift(event);
  notifications.unshift({ id: notifications.length + 1, title: "Emergency SOS activated", message: "Demo notification created for your caregiver. No SMS or dispatch service is connected.", type: "emergency", createdAt: now(), read: false });
  return res.status(201).json(event);
});
router.post("/emergency/:id/cancel", (req, res) => {
  const event = emergencies.find((item) => item.id === Number(req.params.id));
  if (!event) return res.status(404).json({ error: "Emergency event not found" });
  event.status = "Cancelled";
  event.resolutionStatus = "Cancelled";
  return res.json(event);
});
router.get("/location/current", (_req, res) => res.json(location));
router.post("/location/update", (req, res) => { const input = UpdateLocationBody.parse(req.body); location = { ...input, address: "Current browser location", updatedAt: now() }; return res.json(location); });
router.get("/nearby/hospitals", (_req, res) => res.json(places));
router.get("/nearby/pharmacies", (_req, res) => res.json(pharmacies));
router.get("/nearby/ambulances", (_req, res) => res.json(ambulances));
router.get("/appointments", (_req, res) => res.json(appointments));
router.post("/appointments", (req, res) => { const input = CreateAppointmentBody.parse(req.body); const place = places.find((item) => item.id === input.placeId); const appointment = { ...input, id: appointments.length + 1, hospitalName: place?.name ?? "Selected hospital", status: "Requested", createdAt: now() }; appointments.unshift(appointment); return res.status(201).json(appointment); });
router.get("/medicine/search", (req, res) => { const query = String(req.query.query ?? "").toLowerCase(); const results = pharmacies.map((pharmacy) => ({ id: pharmacy.id, medicine: query || "Levodopa", pharmacy: pharmacy.name, distance: pharmacy.distance, availability: "Provider data unavailable", price: null, integrationStatus: "Integration required" })); return res.json(results); });
router.get("/medicine/orders", (_req, res) => res.json(orders));
router.post("/medicine/orders", (req, res) => { const input = CreateMedicineOrderBody.parse(req.body); const order = { ...input, id: orders.length + 1, status: "Requested", createdAt: now(), integrationStatus: "Medicine order request · integration required" }; orders.unshift(order); return res.status(201).json(order); });
router.get("/reports/adherence", (_req, res) => res.json({ daily: [{ label: "Mon", value: 88 }, { label: "Tue", value: 76 }, { label: "Wed", value: 92 }, { label: "Thu", value: 84 }, { label: "Fri", value: stats().adherence }], weekly: [{ label: "Week 1", value: 78 }, { label: "Week 2", value: 84 }, { label: "Week 3", value: 81 }, { label: "This week", value: stats().adherence }], monthly: [{ label: "Jun", value: 74 }, { label: "Jul", value: 79 }, { label: "Aug", value: 83 }, { label: "Sep", value: stats().adherence }], byMedicine: medicines.map((medicine) => ({ label: medicine.name, value: medicine.id === 1 ? 92 : 78 })) }));
router.get("/patients/me", (_req, res) => res.json(profile));
router.put("/patients/me", (req, res) => { profile = { ...profile, ...UpdatePatientProfileBody.parse(req.body) }; return res.json(profile); });

export default router;
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, parkinsonSessions, parkinsonUsers } from "@workspace/db";
import { setProfileIdentity } from "./parkinson";

type User = {
  id: number;
  fullName: string;
  email: string;
  role: "patient" | "caregiver";
  passwordHash: string | null;
  passwordSalt: string | null;
};

export type SessionUser = Pick<User, "id" | "fullName" | "email" | "role">;

const demoPassword = process.env.DEMO_PASSWORD ?? "demo12345";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password: string, user: User) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function initializeAuthDatabase() {
  // Earlier demo accounts used explicit IDs. Keep the serial sequence ahead of
  // existing rows before creating any future accounts without an explicit ID.
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('parkinson_users', 'id'),
      COALESCE(MAX(id), 1),
      COALESCE(MAX(id), 0) > 0
    )
    FROM parkinson_users
  `);

  const { salt, hash } = hashPassword(demoPassword, "parkinson-care-demo-salt");
  const [demoUser] = await db
    .insert(parkinsonUsers)
    .values({
      fullName: "Demo Patient",
      email: "demo@parkinsoncare.ai",
      role: "patient",
      passwordHash: hash,
      passwordSalt: salt,
    })
    .onConflictDoUpdate({
      target: parkinsonUsers.email,
      set: {
        fullName: "Demo Patient",
        role: "patient",
        passwordHash: hash,
        passwordSalt: salt,
      },
    })
    .returning({ id: parkinsonUsers.id });

  setProfileIdentity(demoUser.id, "Demo Patient", "demo@parkinsoncare.ai");
}

const databaseReady = initializeAuthDatabase();

function readCookieToken(req: Request) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("pcai_session="));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice("pcai_session=".length));
  } catch {
    return null;
  }
}

export async function getSessionUser(req: Request): Promise<SessionUser | undefined> {
  const token = readCookieToken(req);
  if (!token) return undefined;
  const rows = await db
    .select({
      id: parkinsonUsers.id,
      fullName: parkinsonUsers.fullName,
      email: parkinsonUsers.email,
      role: parkinsonUsers.role,
    })
    .from(parkinsonSessions)
    .innerJoin(parkinsonUsers, eq(parkinsonSessions.userId, parkinsonUsers.id))
    .where(and(
      eq(parkinsonSessions.tokenHash, hashSessionToken(token)),
      gt(parkinsonSessions.expiresAt, new Date()),
    ))
    .limit(1);
  const row = rows[0];
  if (!row || (row.role !== "patient" && row.role !== "caregiver")) return undefined;
  return { ...row, role: row.role };
}

async function setSession(res: Response, user: SessionUser) {
  const token = randomBytes(32).toString("hex");
  await db.insert(parkinsonSessions).values({
    tokenHash: hashSessionToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `pcai_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`,
  );
}

async function clearSession(req: Request, res: Response) {
  const token = readCookieToken(req);
  if (token) {
    await db.delete(parkinsonSessions).where(eq(parkinsonSessions.tokenHash, hashSessionToken(token)));
  }
  res.setHeader("Set-Cookie", "pcai_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  void databaseReady
    .then(() => getSessionUser(req))
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      res.locals.user = user;
      next();
    })
    .catch(next);
}

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  await databaseReady;
  const { fullName, email, password, role } = req.body as Record<string, unknown>;
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const accountRole = role === "caregiver" ? "caregiver" : "patient";
  const name = String(fullName ?? "").trim();
  const pass = String(password ?? "");
  if (name.length < 2 || !normalizedEmail.includes("@") || pass.length < 8) {
    return res.status(400).json({ error: "Enter a name, a valid email, and a password with at least 8 characters." });
  }

  const existing = await db.select({ id: parkinsonUsers.id }).from(parkinsonUsers).where(eq(parkinsonUsers.email, normalizedEmail)).limit(1);
  if (existing.length) return res.status(409).json({ error: "An account with this email already exists." });

  const { salt, hash } = hashPassword(pass);
  try {
    const [storedUser] = await db
      .insert(parkinsonUsers)
      .values({ fullName: name, email: normalizedEmail, role: accountRole, passwordHash: hash, passwordSalt: salt })
      .returning({
        id: parkinsonUsers.id,
        fullName: parkinsonUsers.fullName,
        email: parkinsonUsers.email,
        role: parkinsonUsers.role,
      });
    if (storedUser.role !== "patient" && storedUser.role !== "caregiver") {
      return res.status(500).json({ error: "Unable to create an account with this role." });
    }
    const user: SessionUser = { ...storedUser, role: storedUser.role };
    if (user.role === "patient") setProfileIdentity(user.id, user.fullName, user.email);
    await setSession(res, user);
    return res.status(201).json(user);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    throw error;
  }
});

router.post("/login", async (req, res) => {
  await databaseReady;
  const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const rows = await db.select().from(parkinsonUsers).where(eq(parkinsonUsers.email, normalizedEmail)).limit(1);
  const user = rows[0] as User | undefined;
  if (!user || !verifyPassword(password, user) || (user.role !== "patient" && user.role !== "caregiver")) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  const sessionUser: SessionUser = { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
  if (user.role === "patient") setProfileIdentity(user.id, user.fullName, user.email);
  await setSession(res, sessionUser);
  return res.json(sessionUser);
});

router.post("/logout", async (req, res) => {
  await clearSession(req, res);
  return res.status(204).send();
});

router.get("/me", async (req, res) => {
  await databaseReady;
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  return res.json(user);
});

export default router;

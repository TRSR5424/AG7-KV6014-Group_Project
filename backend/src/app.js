require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const PDFDocument = require("pdfkit");
const { createDatabase } = require("./db");
const { bcrypt, hashToken, createToken, issueJwt, requireAuth, requireRoles } = require("./auth");
const { entrySchema, activateSchema, loginSchema, reviewSchema, inviteSchema } = require("./validation");

const URGENT_RATING = 8;
const MAX_BODY_BYTES = "32kb";

function now() {
  return new Date().toISOString();
}

function audit(db, actorId, action, entityType, entityId) {
  db.prepare(
    "INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), actorId || null, action, entityType, entityId, now());
}

function makeApp(db = createDatabase()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: MAX_BODY_BYTES }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/auth/activate", (req, res) => {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path?.[0];
      const messages = {
        token: "Your invite token is missing or invalid",
        email: "Email address not valid",
        password: "Password must be at least 10 characters",
        consentGiven: "You must accept the consent notice to continue"
      };
      return res.status(400).json({ error: messages[field] || "Invalid activation details" });
    }
    const { token, email, password } = parsed.data;
    const invite = db.prepare(
      "SELECT i.* FROM invite_tokens i JOIN appointments a ON a.id = i.appointment_id WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND a.patient_id IS NULL"
    ).get(hashToken(token), now());
    if (!invite || invite.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: "Invite is invalid, expired, or already used" });
    }
    const userId = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync(password, 12);
    const activate = db.transaction(() => {
      db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'patient', ?)")
        .run(userId, email, passwordHash, now());
      db.prepare("UPDATE appointments SET patient_id = ? WHERE id = ? AND patient_id IS NULL")
        .run(userId, invite.appointment_id);
      db.prepare("UPDATE invite_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(now(), invite.id);
      audit(db, userId, "patient_activated", "appointment", invite.appointment_id);
    });
    try {
      activate();
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "Account already exists" });
      throw error;
    }
    const user = { id: userId, email, role: "patient" };
    return res.status(201).json({ user, token: issueJwt(user) });
  });

  app.post("/api/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid email or password" });
    const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(parsed.data.email);
    if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    return res.json({ user: { id: user.id, email: user.email, role: user.role }, token: issueJwt(user) });
  });

  app.use("/api", requireAuth);

  function getAppointment(id, user) {
    const appointment = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
    if (!appointment) return null;
    if (user.role === "patient" && appointment.patient_id !== user.sub) return null;
    if (user.role === "gp" && appointment.gp_id !== user.sub) return null;
    return appointment;
  }

  app.post("/api/invites", requireRoles("gp"), (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid invite details" });
    const { email, scheduledAt } = parsed.data;
    const appointmentId = crypto.randomUUID();
    const token = createToken();
    const expiresAt = new Date(Date.now() + Number(process.env.INVITE_EXPIRES_HOURS || 72) * 3600000).toISOString();
    const create = db.transaction(() => {
      db.prepare("INSERT INTO appointments (id, gp_id, scheduled_at, status, created_at) VALUES (?, ?, ?, 'open', ?)")
        .run(appointmentId, req.user.sub, scheduledAt, now());
      db.prepare("INSERT INTO invite_tokens (id, token_hash, appointment_id, email, expires_at) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), hashToken(token), appointmentId, email, expiresAt);
      audit(db, req.user.sub, "invite_created", "appointment", appointmentId);
    });
    create();
    return res.status(201).json({ appointmentId, inviteToken: token, expiresAt });
  });

  app.get("/api/appointments", (req, res) => {
    let rows;
    if (req.user.role === "patient") {
      rows = db.prepare("SELECT id, scheduled_at, status, previous_appointment_id FROM appointments WHERE patient_id = ? ORDER BY scheduled_at").all(req.user.sub);
    } else if (req.user.role === "gp") {
      rows = db.prepare(
        "SELECT a.id, a.scheduled_at, a.status, a.patient_id, u.email AS patient_email, a.previous_appointment_id FROM appointments a LEFT JOIN users u ON u.id = a.patient_id WHERE a.gp_id = ? ORDER BY a.scheduled_at"
      ).all(req.user.sub);
    } else {
      rows = db.prepare(
        "SELECT id, scheduled_at, status, patient_id, gp_id, previous_appointment_id FROM appointments ORDER BY scheduled_at"
      ).all();
    }
    return res.json({ appointments: rows });
  });

  app.get("/api/appointments/:id", (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    const response = { id: appointment.id, scheduledAt: appointment.scheduled_at, status: appointment.status, previousAppointmentId: appointment.previous_appointment_id };
    if (req.user.role !== "patient") {
      response.patientId = appointment.patient_id;
      response.gpId = appointment.gp_id;
      response.review = db.prepare("SELECT priority, flagged, private_notes AS privateNotes, updated_at AS updatedAt FROM clinician_reviews WHERE appointment_id = ?").get(appointment.id) || null;
    }
    return res.json(response);
  });

  app.get("/api/appointments/:id/entries", (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    const entries = db.prepare(
      "SELECT id, created_at AS createdAt, medications, notes, correction_of AS correctionOf, alert FROM symptom_entries WHERE appointment_id = ? ORDER BY created_at"
    ).all(appointment.id);
    const ratings = db.prepare("SELECT entry_id AS entryId, symptom, rating FROM symptom_ratings WHERE entry_id IN (SELECT id FROM symptom_entries WHERE appointment_id = ?)").all(appointment.id);
    const byEntry = new Map(entries.map((entry) => [entry.id, { ...entry, alert: Boolean(entry.alert), ratings: {} }]));
    ratings.forEach((rating) => byEntry.get(rating.entryId).ratings[rating.symptom] = rating.rating);
    return res.json({ entries: [...byEntry.values()] });
  });

  app.post("/api/appointments/:id/entries", requireRoles("patient"), (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (appointment.status !== "open") return res.status(409).json({ error: "Closed or cancelled appointments do not accept new entries" });
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid symptom entry" });
    const { ratings, medications, notes, correctionOf } = parsed.data;
    if (correctionOf) {
      const original = db.prepare("SELECT id FROM symptom_entries WHERE id = ? AND appointment_id = ?").get(correctionOf, appointment.id);
      if (!original) return res.status(400).json({ error: "Correction must refer to an entry in this appointment" });
    }
    const entryId = crypto.randomUUID();
    const alert = Object.values(ratings).some((rating) => rating >= URGENT_RATING) ? 1 : 0;
    const insert = db.transaction(() => {
      db.prepare("INSERT INTO symptom_entries (id, appointment_id, patient_id, created_at, medications, notes, correction_of, alert) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(entryId, appointment.id, req.user.sub, now(), medications, notes, correctionOf || null, alert);
      const statement = db.prepare("INSERT INTO symptom_ratings (entry_id, symptom, rating) VALUES (?, ?, ?)");
      Object.entries(ratings).forEach(([symptom, rating]) => statement.run(entryId, symptom, rating));
      audit(db, req.user.sub, "symptom_entry_created", "symptom_entry", entryId);
    });
    insert();
    return res.status(201).json({ id: entryId, alert: Boolean(alert), urgentHelpMessage: alert ? "If you need urgent help, call 999. This app is not an emergency service." : null });
  });

  app.patch("/api/appointments/:id/review", requireRoles("gp", "admin"), (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid clinician review" });
    const current = db.prepare("SELECT * FROM clinician_reviews WHERE appointment_id = ?").get(appointment.id);
    const review = { priority: parsed.data.priority === undefined ? current?.priority ?? null : parsed.data.priority, flagged: parsed.data.flagged === undefined ? current?.flagged ?? 0 : (parsed.data.flagged ? 1 : 0), privateNotes: parsed.data.privateNotes === undefined ? current?.private_notes ?? "" : parsed.data.privateNotes };
    db.prepare(
      "INSERT INTO clinician_reviews (appointment_id, priority, flagged, private_notes, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(appointment_id) DO UPDATE SET priority=excluded.priority, flagged=excluded.flagged, private_notes=excluded.private_notes, updated_by=excluded.updated_by, updated_at=excluded.updated_at"
    ).run(appointment.id, review.priority, review.flagged, review.privateNotes, req.user.sub, now());
    audit(db, req.user.sub, "clinician_review_updated", "appointment", appointment.id);
    return res.json({ priority: review.priority, flagged: Boolean(review.flagged), privateNotes: review.privateNotes });
  });

  app.patch("/api/appointments/:id/close", requireRoles("gp", "admin"), (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (appointment.status !== "open") return res.status(409).json({ error: "Appointment is already closed or cancelled" });
    db.prepare("UPDATE appointments SET status = 'closed' WHERE id = ?").run(appointment.id);
    audit(db, req.user.sub, "appointment_closed", "appointment", appointment.id);
    return res.json({ id: appointment.id, status: "closed" });
  });

  app.get("/api/appointments/:id/summary", requireRoles("gp", "admin"), (req, res) => {
    const appointment = getAppointment(req.params.id, req.user);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    const entries = db.prepare("SELECT id, created_at, notes, medications, alert FROM symptom_entries WHERE appointment_id = ? ORDER BY created_at").all(appointment.id);
    const ratings = db.prepare("SELECT entry_id, symptom, rating FROM symptom_ratings WHERE entry_id IN (SELECT id FROM symptom_entries WHERE appointment_id = ?)").all(appointment.id);
    const doc = new PDFDocument({ margin: 50 });
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="appointment-${appointment.id}-summary.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).text("CarePath symptom summary");
    doc.moveDown().fontSize(10).text(`Appointment: ${appointment.id}`).text(`Scheduled: ${appointment.scheduled_at}`).text(`Status: ${appointment.status}`);
    entries.forEach((entry, index) => {
      doc.moveDown().fontSize(12).text(`Entry ${index + 1} - ${entry.created_at}`);
      doc.fontSize(10).text(`Ratings: ${ratings.filter((rating) => rating.entry_id === entry.id).map((rating) => `${rating.symptom} ${rating.rating}/10`).join(", ") || "none"}`);
      if (entry.medications) doc.text(`Medications: ${entry.medications}`);
      if (entry.notes) doc.text(`Notes: ${entry.notes}`);
      if (entry.alert) doc.text("Urgency alert: rating threshold reached.");
    });
    doc.end();
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    if (res.headersSent) return;
    res.status(500).json({ error: "An unexpected server error occurred" });
  });
  return app;
}

module.exports = { makeApp };

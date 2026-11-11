const crypto = require("node:crypto");
const request = require("supertest");
const { makeApp } = require("../src/app");
const { createDatabase } = require("../src/db");
const { bcrypt, createToken, hashToken, issueJwt } = require("../src/auth");

process.env.JWT_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

describe("CarePath API", () => {
  let db;
  let app;
  let patientId;
  let gpId;
  let appointmentId;

  beforeEach(() => {
    db = createDatabase();
    app = makeApp(db);
    patientId = crypto.randomUUID();
    gpId = crypto.randomUUID();
    appointmentId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(gpId, "gp@example.test", bcrypt.hashSync("gp-password", 4), "gp", timestamp);
    db.prepare("INSERT INTO appointments (id, gp_id, scheduled_at, created_at) VALUES (?, ?, ?, ?)")
      .run(appointmentId, gpId, timestamp, timestamp);
  });

  it("activates a patient invite once and rejects reuse", async () => {
    const invite = createToken();
    db.prepare("INSERT INTO invite_tokens (id, token_hash, appointment_id, email, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), hashToken(invite), appointmentId, "patient@example.test", new Date(Date.now() + 3600000).toISOString());

    const response = await request(app).post("/api/auth/activate").send({
      token: invite,
      email: "patient@example.test",
      password: "patient-password",
      consentGiven: true
    });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("patient");

    const reused = await request(app).post("/api/auth/activate").send({
      token: invite,
      email: "patient@example.test",
      password: "patient-password",
      consentGiven: true
    });
    expect(reused.status).toBe(400);
  });

  it("prevents a patient from reading another patient's appointment", async () => {
    const patient = { id: patientId, email: "patient@example.test", role: "patient" };
    db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(patientId, patient.email, bcrypt.hashSync("patient-password", 4), patient.role, new Date().toISOString());
    const token = issueJwt(patient);
    const response = await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(404);
  });

  it("stores an immutable symptom snapshot and blocks entries after closure", async () => {
    const patient = { id: patientId, email: "patient@example.test", role: "patient" };
    db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(patientId, patient.email, bcrypt.hashSync("patient-password", 4), patient.role, new Date().toISOString());
    db.prepare("UPDATE appointments SET patient_id = ? WHERE id = ?").run(patientId, appointmentId);
    const patientToken = issueJwt(patient);
    const created = await request(app)
      .post(`/api/appointments/${appointmentId}/entries`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ ratings: { pain: 8 }, notes: "Getting worse" });
    expect(created.status).toBe(201);
    expect(created.body.alert).toBe(true);

    const entries = await request(app)
      .get(`/api/appointments/${appointmentId}/entries`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(entries.status).toBe(200);
    expect(entries.body.entries).toHaveLength(1);
    expect(entries.body.entries[0].ratings.pain).toBe(8);

    const gpToken = issueJwt({ id: gpId, email: "gp@example.test", role: "gp" });
    const closed = await request(app)
      .patch(`/api/appointments/${appointmentId}/close`)
      .set("Authorization", `Bearer ${gpToken}`);
    expect(closed.status).toBe(200);
    const rejected = await request(app)
      .post(`/api/appointments/${appointmentId}/entries`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ ratings: { pain: 2 } });
    expect(rejected.status).toBe(409);
  });

  it("does not expose clinician private review data to patients", async () => {
    const patient = { id: patientId, email: "patient@example.test", role: "patient" };
    db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(patientId, patient.email, bcrypt.hashSync("patient-password", 4), patient.role, new Date().toISOString());
    db.prepare("UPDATE appointments SET patient_id = ? WHERE id = ?").run(patientId, appointmentId);
    db.prepare("INSERT INTO clinician_reviews (appointment_id, priority, flagged, private_notes, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(appointmentId, 9, 1, "Sensitive clinician note", gpId, new Date().toISOString());
    const response = await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${issueJwt(patient)}`);
    expect(response.status).toBe(200);
    expect(response.body.review).toBeUndefined();
  });

  it("lets a gp create a patient invite", async () => {
    const gpToken = issueJwt({ id: gpId, email: "gp@example.test", role: "gp" });
    const response = await request(app)
      .post("/api/invites")
      .set("Authorization", `Bearer ${gpToken}`)
      .send({ email: "newpatient@example.test", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    expect(response.status).toBe(201);
    expect(typeof response.body.inviteToken).toBe("string");
    const row = db.prepare("SELECT * FROM invite_tokens WHERE appointment_id = ?").get(response.body.appointmentId);
    expect(row.email).toBe("newpatient@example.test");
  });

  it("blocks patients from creating invites", async () => {
    const patientToken = issueJwt({ id: patientId, email: "patient@example.test", role: "patient" });
    const response = await request(app)
      .post("/api/invites")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ email: "someone@example.test", scheduledAt: new Date().toISOString() });
    expect(response.status).toBe(403);
  });
});

require("dotenv").config();

const crypto = require("node:crypto");
const { createDatabase } = require("../src/db");
const { bcrypt, createToken, hashToken } = require("../src/auth");

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run seed -- <patient-email> <temporary-password>");
  process.exit(1);
}
if (password.length < 10) {
  console.error("The temporary password must be at least 10 characters.");
  process.exit(1);
}

const db = createDatabase();
const gp = db.prepare("SELECT id FROM users WHERE role = 'gp' LIMIT 1").get();
const gpId = gp?.id || crypto.randomUUID();
if (!gp) {
  db.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'gp', ?)")
    .run(gpId, "demo.gp@carepath.local", bcrypt.hashSync("DemoGPPassword123!", 12), new Date().toISOString());
}
const appointmentId = crypto.randomUUID();
db.prepare("INSERT INTO appointments (id, gp_id, scheduled_at, status, created_at) VALUES (?, ?, ?, 'open', ?)")
  .run(appointmentId, gpId, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
const token = createToken();
const expiresAt = new Date(Date.now() + Number(process.env.INVITE_EXPIRES_HOURS || 72) * 3600000).toISOString();
db.prepare("INSERT INTO invite_tokens (id, token_hash, appointment_id, email, expires_at) VALUES (?, ?, ?, ?, ?)")
  .run(crypto.randomUUID(), hashToken(token), appointmentId, email, expiresAt);
console.log(JSON.stringify({ appointmentId, inviteToken: token, gpEmail: "demo.gp@carepath.local", gpPassword: "DemoGPPassword123!" }, null, 2));

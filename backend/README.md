## Run locally

```powershell
cd backend
npm install
$env:JWT_SECRET = "use-a-random-secret-at-least-32-characters"
npm run seed -- patient@example.test "a-long-test-password"
npm start
```

The seed command prints a single-use invite token and creates a demo GP.

## API

`POST /api/auth/activate`, `POST /api/auth/login`, and `GET /health` are public.
All other endpoints require `Authorization: Bearer <token>`.

- `GET /api/appointments`
- `GET /api/appointments/:id`
- `GET /api/appointments/:id/entries`
- `POST /api/appointments/:id/entries`
- `PATCH /api/appointments/:id/review` (GP/admin)
- `PATCH /api/appointments/:id/close` (GP/admin)
- `GET /api/appointments/:id/summary` (GP/admin)

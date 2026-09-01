# NGOFlow

FastAPI authentication backend and split static frontend for NGOFlow.

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies: `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set strong `SECRET_KEY` and bootstrap-admin values.
4. Run: `uvicorn main:app --reload`
5. Open `http://localhost:8000`.

On the first run with an empty `users.json`, the application creates the configured bootstrap administrator. Change the example password before that first run. Users are stored in `users.json`; password hashes and never plaintext passwords are persisted.

## API

- `POST /api/auth/register` — register a donor or NGO staff account
- `POST /api/auth/login` — receive a Bearer JWT
- `GET /api/auth/me` — current authenticated user
- `PATCH /api/profile` — view/update the signed-in user's own profile
- `POST /api/profile/change-password` — change the signed-in user's password
- `GET /api/dashboard/admin|staff|donor` — role-protected dashboard data
- `GET /api/users` — administrator-only list
- `PATCH /api/users/{id}/status` — administrator-only activation/deactivation

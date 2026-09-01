"""NGOFlow FastAPI application with file-backed user authentication."""

from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Literal

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field


ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR / "static"
USERS_FILE = ROOT_DIR / "users.json"
load_dotenv(ROOT_DIR / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "development-only-change-me")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
users_lock = Lock()
email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = FastAPI(title="NGOFlow API")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["donor", "staff"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class StatusRequest(BaseModel):
    status: Literal["active", "inactive", "pending"]


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    bio: str = Field(default="", max_length=500)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


def read_users() -> list[dict]:
    if not USERS_FILE.exists():
        return []
    try:
        data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("users.json contains invalid JSON") from error
    return data if isinstance(data, list) else []


def write_users(users: list[dict]) -> None:
    temporary = USERS_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(users, indent=2) + "\n", encoding="utf-8")
    temporary.replace(USERS_FILE)


def public_user(user: dict) -> dict:
    result = {key: user[key] for key in ("id", "name", "email", "role", "status", "created_at")}
    result["phone"] = user.get("phone", "")
    result["bio"] = user.get("bio", "")
    return result


def find_user_by_email(users: list[dict], email: str) -> dict | None:
    return next((user for user in users if user["email"] == email.lower()), None)


def create_access_token(user: dict) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user["id"], "role": user["role"], "exp": expires_at}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(authorization: str | None = None) -> dict:
    # FastAPI injects this manually below to keep an explicit Bearer-only contract.
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(authorization.removeprefix("Bearer "), SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except InvalidTokenError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from error
    with users_lock:
        user = next((entry for entry in read_users() if entry["id"] == user_id), None)
    if not user or user["status"] != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This account is not active")
    return user


from fastapi import Header  # Kept near the dependency for readability.


def authenticated_user(authorization: str | None = Header(default=None)) -> dict:
    return get_current_user(authorization)


def require_admin(user: dict = Depends(authenticated_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required")
    return user


def require_role(role: Literal["admin", "staff", "donor"]):
    """Dependency factory for routes that belong to exactly one dashboard role."""
    def role_guard(user: dict = Depends(authenticated_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{role_name(role)} access is required")
        return user
    return role_guard


def role_name(role: str) -> str:
    return "NGO staff" if role == "staff" else role.capitalize()


def bootstrap_admin() -> None:
    """Create one administrator for a brand-new local installation."""
    with users_lock:
        users = read_users()
        if users:
            return
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        if not password:
            return
        users.append({
            "id": secrets.token_urlsafe(16),
            "name": os.getenv("BOOTSTRAP_ADMIN_NAME", "NGOFlow Administrator"),
            "email": os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@ngoflow.local").lower(),
            "password_hash": pwd_context.hash(password),
            "role": "admin",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        write_users(users)


@app.on_event("startup")
def startup() -> None:
    bootstrap_admin()


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    email = str(payload.email).lower()
    if not email_pattern.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    with users_lock:
        users = read_users()
        if find_user_by_email(users, email):
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user = {
            "id": secrets.token_urlsafe(16),
            "name": payload.name.strip(),
            "email": email,
            "password_hash": pwd_context.hash(payload.password),
            "role": payload.role,
            "status": "pending" if payload.role == "staff" else "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        users.append(user)
        write_users(users)
    response = {"message": "Account created."
                if user["status"] == "active" else "Account created and awaiting administrator activation.",
                "user": public_user(user)}
    if user["status"] == "active":
        response["access_token"] = create_access_token(user)
        response["token_type"] = "bearer"
    return response


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    with users_lock:
        user = find_user_by_email(read_users(), str(payload.email).lower())
    if not user or not pwd_context.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="This account is awaiting activation or has been deactivated")
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": public_user(user)}


@app.get("/api/auth/me")
def me(user: dict = Depends(authenticated_user)):
    return public_user(user)


@app.patch("/api/profile")
def update_profile(payload: ProfileUpdateRequest, current_user: dict = Depends(authenticated_user)):
    """Update only the signed-in user's profile; role and account status are never client-editable."""
    email = str(payload.email).lower()
    with users_lock:
        users = read_users()
        user = next((entry for entry in users if entry["id"] == current_user["id"]), None)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        existing = find_user_by_email(users, email)
        if existing and existing["id"] != user["id"]:
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user.update({"name": payload.name.strip(), "email": email, "phone": payload.phone.strip(), "bio": payload.bio.strip()})
        write_users(users)
    return public_user(user)


@app.post("/api/profile/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: ChangePasswordRequest, current_user: dict = Depends(authenticated_user)):
    with users_lock:
        users = read_users()
        user = next((entry for entry in users if entry["id"] == current_user["id"]), None)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not pwd_context.verify(payload.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Your current password is incorrect")
        if pwd_context.verify(payload.new_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Choose a new password that differs from the current password")
        user["password_hash"] = pwd_context.hash(payload.new_password)
        write_users(users)


@app.get("/api/dashboard/admin")
def admin_dashboard(_: dict = Depends(require_role("admin"))):
    with users_lock:
        users = [public_user(user) for user in read_users()]
    return {"users": users, "total_users": len(users), "staff_count": sum(user["role"] == "staff" for user in users), "donor_count": sum(user["role"] == "donor" for user in users), "inactive_count": sum(user["status"] == "inactive" for user in users)}


@app.get("/api/dashboard/staff")
def staff_dashboard(user: dict = Depends(require_role("staff"))):
    return {"user": public_user(user), "projects": []}


@app.get("/api/dashboard/donor")
def donor_dashboard(user: dict = Depends(require_role("donor"))):
    return {"user": public_user(user), "giving_history": []}


@app.get("/api/users")
def list_users(_: dict = Depends(require_admin)):
    with users_lock:
        return [public_user(user) for user in read_users()]


@app.patch("/api/users/{user_id}/status")
def change_user_status(user_id: str, payload: StatusRequest, admin: dict = Depends(require_admin)):
    with users_lock:
        users = read_users()
        user = next((entry for entry in users if entry["id"] == user_id), None)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user["id"] == admin["id"] and payload.status != "active":
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        if user["role"] == "admin" and payload.status != "active":
            raise HTTPException(status_code=400, detail="Administrator accounts must remain active")
        user["status"] = payload.status
        write_users(users)
    return public_user(user)


@app.get("/")
def login_page():
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/register")
def register_page():
    return FileResponse(STATIC_DIR / "register.html")


@app.get("/dashboard")
def dashboard_page():
    return FileResponse(STATIC_DIR / "dashboard.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

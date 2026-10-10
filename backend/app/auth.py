"""Login with a username + password. Returns a token the browser sends back on each request."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from .config import SECRET, TOKEN_HOURS
from .db import User, get_db


def hash_password(password: str) -> str:
    salt = os.urandom(8).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def check_password(password: str, stored: str) -> bool:
    salt, digest = stored.split("$")
    test = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return hmac.compare_digest(test, digest)


def make_token(user: User) -> str:
    payload = {"sub": user.username, "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)}
    return jwt.encode(payload, SECRET, algorithm="HS256")


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in.")
    try:
        data = jwt.decode(authorization[7:], SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    user = db.query(User).filter(User.username == data["sub"]).first()
    if not user:
        raise HTTPException(401, "Unknown user.")
    return user


def officer_only(user: User = Depends(current_user)) -> User:
    if user.role != "officer":
        raise HTTPException(403, "Only a depot officer can do this. You have read-only access.")
    return user

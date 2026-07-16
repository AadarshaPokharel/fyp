# backend/app/core/auth.py
import datetime
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
import uuid

from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against hashed password."""
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, UnknownHashError):
        # Gracefully handle malformed/legacy hashes instead of 500s.
        return False

def get_password_hash(password: str) -> str:
    """Hash password with bcrypt."""
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Dependency to get current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        jti: str = payload.get("jti")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    import app.db as db
    if jti and await db.users_collection.database["token_denylist"].find_one({"jti": jti}):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    user = await db.users_collection.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", False):
        raise HTTPException(status_code=403, detail="Account is inactive")
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Dependency to ensure user is admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_policy_maker_or_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to ensure user is policy maker or admin."""
    if current_user.get("role") not in ["admin", "policy_maker"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user

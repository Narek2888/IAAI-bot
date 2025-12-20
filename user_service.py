import sqlite3
from typing import Optional, Tuple

from db import get_connection
from auth import hash_password, verify_password


def create_user(username: str, email: str, password: str) -> Tuple[bool, str]:
    """
    Create a new user account.
    Returns (success, message).
    """

    if not all([username, email, password]):
        return False, "All fields are required"

    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO users (username, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (username.strip(), email.strip(), hash_password(password))
            )
        return True, "User created successfully"

    except sqlite3.IntegrityError:
        return False, "Username or email already exists"

    except Exception:
        return False, "Unable to create user at this time"


def authenticate_user(username: str, password: str) -> Optional[int]:
    """
    Authenticate a user.
    Returns user_id on success, None otherwise.
    """

    if not username or not password:
        return None

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, password_hash
                FROM users
                WHERE username = ?
                """,
                (username.strip(),)
            )
            row = cur.fetchone()

        if not row:
            # Prevent user enumeration timing attacks
            verify_password(password, hash_password("dummy-password"))
            return None

        if verify_password(password, row["password_hash"]):
            return row["id"]

        return None

    except Exception:
        return None

def get_user_email(user_id):
    with get_connection() as conn:  # use `with`!
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if row:
            return row["email"]
        return None


def delete_user(user_id: int) -> bool:
    """Delete user and all associated data. Returns True if deleted."""
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
            return cur.rowcount > 0
    except Exception as e:
        print("Error deleting user:", e)
        return False
    
def user_exists(user_id):
    """Check if a user exists in the database."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        return cur.fetchone() is not None
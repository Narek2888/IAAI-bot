import bcrypt
from typing import Union

# Adjust cost factor if needed (12–14 is a good range)
BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using bcrypt.
    """
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string")

    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(password_bytes, salt)

    return hashed.decode("utf-8")


def verify_password(password: str, hashed: Union[str, bytes]) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.
    Returns False instead of raising on invalid input.
    """
    try:
        if not password or not hashed:
            return False

        password_bytes = password.encode("utf-8")
        hashed_bytes = hashed.encode("utf-8") if isinstance(hashed, str) else hashed

        return bcrypt.checkpw(password_bytes, hashed_bytes)

    except (ValueError, TypeError, bcrypt.error):
        return False

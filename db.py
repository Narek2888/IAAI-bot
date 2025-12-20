import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.getenv("DB_PATH", "users.db")


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_connection() as conn:
        cur = conn.cursor()

        # -----------------------------
        # USERS TABLE
        # -----------------------------
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # -----------------------------
        # FILTER CONFIGS TABLE
        # -----------------------------
        cur.execute("""
            CREATE TABLE IF NOT EXISTS filter_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                config_name TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        """)

        # -----------------------------
        # INDEXES (performance)
        # -----------------------------
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_username
            ON users(username)
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_email
            ON users(email)
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_filter_configs_user_id
            ON filter_configs(user_id)
        """)

import json
import sqlite3
from typing import List, Tuple, Optional

from db import get_connection


def _serialize_payload(payload: dict) -> str:
    try:
        return json.dumps(payload)
    except (TypeError, ValueError):
        raise ValueError("Invalid payload format")


def save_filter_config(user_id: int, name: str, payload: dict) -> bool:
    if not user_id or not name or not payload:
        return False

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO filter_configs (user_id, config_name, payload)
                VALUES (?, ?, ?)
                """,
                (user_id, name.strip(), _serialize_payload(payload))
            )
        return True

    except Exception:
        return False


def update_filter_config(
    config_id: int,
    user_id: int,
    new_name: str,
    payload: dict
) -> bool:
    if not all([config_id, user_id, new_name, payload]):
        return False

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE filter_configs
                SET config_name = ?, payload = ?
                WHERE id = ? AND user_id = ?
                """,
                (new_name.strip(), _serialize_payload(payload), config_id, user_id)
            )
            return cur.rowcount > 0

    except Exception:
        return False


def delete_filter_config(config_id: int, user_id: int) -> bool:
    if not config_id or not user_id:
        return False

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                DELETE FROM filter_configs
                WHERE id = ? AND user_id = ?
                """,
                (config_id, user_id)
            )
            return cur.rowcount > 0

    except Exception:
        return False


def load_user_configs(user_id: int) -> List[Tuple[int, str, str]]:
    if not user_id:
        return []

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, config_name, payload
                FROM filter_configs
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,)
            )
            return cur.fetchall()

    except Exception:
        return []

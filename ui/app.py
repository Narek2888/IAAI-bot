import streamlit as st
import json
import os
import sys

# Ensure parent folder is in Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from db import init_db
from user_service import create_user, authenticate_user, delete_user
from filters_service import save_filter_config, load_user_configs, update_filter_config, delete_filter_config
from main import IAAIBot

# -----------------------------
# Initial setup
# -----------------------------
st.set_page_config(page_title="IAAI Stock Checker", layout="wide")
init_db()

st.title("🚗 IAAI Stock Checker")

# -----------------------------
# Session state
# -----------------------------
st.session_state.setdefault("user_id", None)
st.session_state.setdefault("active_payload", None)
st.session_state.setdefault("bot", None)

# -----------------------------
# Authentication sidebar
# -----------------------------
st.sidebar.header("👤 Account")

if st.session_state.user_id is None:
    auth_mode = st.sidebar.radio("Mode", ["Sign In", "Sign Up"])
    username = st.sidebar.text_input("Username")
    password = st.sidebar.text_input("Password", type="password")

    if auth_mode == "Sign Up":
        email = st.sidebar.text_input("Email")
        if st.sidebar.button("Create Account"):
            ok, msg = create_user(username, email, password)
            if ok:
                user_id = authenticate_user(username, password)
                if user_id:
                    st.session_state.user_id = user_id
                    st.session_state.bot = IAAIBot(user_id=user_id)
                    st.sidebar.success(f"{msg} — Logged in automatically")
                    st.rerun()
                else:
                    st.sidebar.error("Account created, but failed to log in automatically")
            else:
                st.sidebar.error(msg)
    else:
        if st.sidebar.button("Sign In"):
            user_id = authenticate_user(username, password)
            if user_id:
                st.session_state.user_id = user_id
                st.session_state.bot = IAAIBot(user_id=user_id)
                st.sidebar.success("Logged in")
                st.rerun()
            else:
                st.sidebar.error("Invalid credentials")

else:
    st.sidebar.success("Logged in")
    if st.sidebar.button("🚪 Logout"):
        st.session_state.user_id = None
        st.session_state.active_payload = None
        st.session_state.bot = None
        st.rerun()

    # Delete user
    confirm_delete = st.sidebar.checkbox("Yes, I want to delete my account permanently")
    if st.sidebar.button("Delete Account") and confirm_delete:
        if delete_user(st.session_state.user_id):
            st.session_state.user_id = None
            st.session_state.active_payload = None
            st.session_state.bot = None
            st.sidebar.success("Account deleted successfully.")
            st.rerun()
        else:
            st.sidebar.error("Failed to delete account.")

# -----------------------------
# Filters sidebar
# -----------------------------
st.sidebar.header("🔍 Filters")
filters_disabled = st.session_state.user_id is None

filters = {
    "year_from": st.sidebar.number_input("From Year", 1900, 2030, 2015, disabled=filters_disabled),
    "year_to": st.sidebar.number_input("To Year", 1900, 2030, 2024, disabled=filters_disabled),
    "auction_type": st.sidebar.selectbox("Auction Type", ["Buy Now"], disabled=filters_disabled),
    "min_bid": st.sidebar.number_input("Min Bid ($)", 0, 100000, 0, disabled=filters_disabled),
    "max_bid": st.sidebar.number_input("Max Bid ($)", 0, 100000, 50000, disabled=filters_disabled),
    "odo_max": st.sidebar.number_input("Max Mileage", 0, 500000, 200000, disabled=filters_disabled),
    "inventory_type": st.sidebar.selectbox("Inventory Type", ["Automobiles", "Motorcycles"], disabled=filters_disabled),
}

if filters_disabled:
    st.sidebar.info("Sign in to enable filters")

# -----------------------------
# Build payload
# -----------------------------
def build_payload(filters):
    return {
        "Searches": [
            {"LongRanges": [{"From": filters["year_from"], "To": filters["year_to"], "Name": "Year"}]},
            {"Facets": [{"Group": "AuctionType", "Value": filters["auction_type"], "ForAnalytics": False}]},
            {"LongRanges": [{"From": filters["min_bid"], "To": filters["max_bid"], "Name": "MinimumBidAmount"}]},
            {"LongRanges": [{"From": 0, "To": filters["odo_max"], "Name": "ODOValue"}]},
            {"Facets": [{"Group": "InventoryTypes", "Value": filters["inventory_type"], "ForAnalytics": False}]},
        ],
        "PageSize": 100,
        "CurrentPage": 1,
        "Sort": [{"SortField": "TenantSortOrder", "IsDescending": False}],
        "ShowRecommendations": False,
    }

# Apply filters
if not filters_disabled and st.sidebar.button("✔️ Apply Filters"):
    st.session_state.active_payload = build_payload(filters)
    st.session_state.bot.PAYLOAD = st.session_state.active_payload
    st.sidebar.success("Filters applied")

# -----------------------------
# Run bot
# -----------------------------
if st.session_state.user_id and st.session_state.bot:
    mode = st.radio("Mode", ["Run Once", "Continuous Monitoring"])

    bot = st.session_state.bot

    if mode == "Run Once":
        if st.button("Run Now"):
            if not st.session_state.active_payload:
                st.error("Apply filters first")
            else:
                st.info("Running check...")
                st.code(bot.run_once())
    else:
        col1, col2 = st.columns(2)
        with col1:
            if st.button("Start Monitoring"):
                st.success(bot.start_continuous())
        with col2:
            if st.button("Stop Monitoring"):
                st.warning(bot.stop_continuous())

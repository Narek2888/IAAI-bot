import streamlit as st
import pandas as pd
import sys
import os

# Add parent folder to path for importing main.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from main import IAAIBot

st.set_page_config(page_title="IAAI Stock Checker", layout="wide")
st.title("🚗 IAAI Stock Checker")

# ----------------------------------------------------------------------
# Session State Initialization
# ----------------------------------------------------------------------
if "active_payload" not in st.session_state:
    st.session_state.active_payload = None

if "bot" not in st.session_state:
    st.session_state.bot = IAAIBot(payload=None)

bot = st.session_state.bot


# ----------------------------------------------------------------------
# Sidebar filters
# ----------------------------------------------------------------------
st.sidebar.header("Filters")
st.sidebar.subheader("Year Range")

year_from = st.sidebar.number_input("From Year", min_value=1900, max_value=2030, value=2020, step=1)
year_to   = st.sidebar.number_input("To Year",   min_value=1900, max_value=2030, value=2026, step=1)

if year_to < year_from:
    st.sidebar.error("❌ 'To Year' must be greater than or equal to 'From Year'")

auction_type = st.sidebar.selectbox("Auction Type", ["Buy Now", "Standard", "Online Only"])
max_bid      = st.sidebar.number_input("Maximum Bid ($)", min_value=0, max_value=100000, value=1500)
odo_max      = st.sidebar.number_input("Maximum Mileage (ODO)", min_value=0, max_value=500000, value=50000)
inventory_type = st.sidebar.selectbox("Inventory Type", ["Automobiles", "Trucks", "Motorcycles"])

apply_filters = st.sidebar.button("✔️ Apply Filters")


# ----------------------------------------------------------------------
# Payload Builder
# ----------------------------------------------------------------------
def build_payload():
    return {
        "Searches": [
            {"Facets": None, "FullSearch": None,
             "LongRanges": [{"From": year_from, "Name": "Year", "To": year_to}]},

            {"Facets": [{"Group": "AuctionType", "Value": auction_type, "ForAnalytics": False}],
             "FullSearch": None, "LongRanges": None},

            {"Facets": None, "FullSearch": None,
             "LongRanges": [{"From": 0, "Name": "MinimumBidAmount", "To": max_bid}]},

            {"Facets": None, "FullSearch": None,
             "LongRanges": [{"From": 0, "Name": "ODOValue", "To": odo_max}]},

            {"Facets": [{"Group": "InventoryTypes", "Value": inventory_type, "ForAnalytics": False}],
             "FullSearch": None, "LongRanges": None},
        ],
        "PageSize": 100,
        "CurrentPage": 1,
        "Sort": [{"IsGeoSort": False, "SortField": "TenantSortOrder", "IsDescending": False}],
        "ShowRecommendations": False,
    }


# ----------------------------------------------------------------------
# Apply Filters Button Logic
# ----------------------------------------------------------------------
if apply_filters:
    st.session_state.active_payload = build_payload()
    bot.PAYLOAD = st.session_state.active_payload
    st.sidebar.success("Filters applied successfully!")


# ----------------------------------------------------------------------
# UI — Mode Selection
# ----------------------------------------------------------------------
mode = st.radio("Select Mode", ["Run Once", "Continuous Monitoring"])

results_placeholder = st.empty()


def display_results(data):
    if not data:
        results_placeholder.warning("No listings found.")
        return

    df = pd.DataFrame(data)
    df['image'] = df['image'].apply(lambda x: x)
    results_placeholder.write(df.to_html(escape=False), unsafe_allow_html=True)


# ----------------------------------------------------------------------
# RUN ONCE MODE
# ----------------------------------------------------------------------
if mode == "Run Once":
    if st.button("Run Check Now"):
        if st.session_state.active_payload is None:
            st.error("❗ Please apply filters first")
        else:
            bot.PAYLOAD = st.session_state.active_payload
            st.info("Running IAAI check...")
            result = bot.run_once()
            st.success("Check Complete!")
            st.code(result)


# ----------------------------------------------------------------------
# CONTINUOUS MONITORING MODE
# ----------------------------------------------------------------------
else:
    col1, col2 = st.columns(2)

    with col1:
        if st.button("Start Continuous Monitoring"):
            if st.session_state.active_payload is None:
                st.error("❗ Please apply filters first")
            else:
                bot.PAYLOAD = st.session_state.active_payload

                # Prevent duplicate threads
                if bot.thread and bot.thread.is_alive():
                    st.warning("Monitoring is already running.")
                else:
                    msg = bot.start_continuous()
                    st.success(msg)

    with col2:
        if st.button("Stop Continuous Monitoring"):
            msg = bot.stop_continuous()
            st.warning(msg)

    st.info("Continuous monitoring runs in the background on the server.")
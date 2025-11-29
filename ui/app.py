import streamlit as st
import pandas as pd
import sys
import os

# Add parent folder to path for importing main.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import IAAIBot

st.set_page_config(page_title="IAAI Tesla Stock Checker", layout="wide")
st.title("🚗 IAAI Tesla Stock Checker")

# Sidebar filters
st.sidebar.header("Filters")

# Year Range
year_range = st.sidebar.slider("Year Range", 2000, 2026, (2020, 2026))

# Auction Type
auction_type = st.sidebar.selectbox("Auction Type", ["Buy Now", "Standard", "Online Only"])

# Maximum Bid Amount
max_bid = st.sidebar.number_input("Maximum Bid Amount ($)", min_value=0, max_value=100000, value=1500)

# Maximum Mileage (ODO)
odo_max = st.sidebar.number_input("Maximum Mileage (ODO)", min_value=0, max_value=500000, value=50000)

# Inventory Type
inventory_type = st.sidebar.selectbox("Inventory Type", ["Automobiles", "Trucks", "Motorcycles"])

# Initialize bot
bot = IAAIBot()

# Mode selection
mode = st.radio("Select mode:", ["Run Once", "Continuous Monitoring"])

# Placeholder for results table
results_placeholder = st.empty()

# Function to build PAYLOAD dynamically
def build_payload():
    payload = {
        "Searches": [
            {"Facets": None, "FullSearch": None,
             "LongRanges": [{"From": year_range[0], "Name": "Year", "To": year_range[1]}]},
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
    return payload

# Build the payload dynamically from the filters
payload = build_payload()

# Inject into bot
bot = IAAIBot(payload)

# Function to display results in table
def display_results(data):
    if not data:
        results_placeholder.warning("No listings found.")
        return

    # Convert list of dicts to DataFrame for display
    df = pd.DataFrame(data)
    # Render images as HTML
    df['image'] = df['image'].apply(lambda x: x)
    results_placeholder.write(df.to_html(escape=False), unsafe_allow_html=True)

# Run Once mode
if mode == "Run Once":
    if st.button("Run Check Now"):
        st.info("Running IAAI check...")
        bot.PAYLOAD = build_payload()  # Inject current filters
        result = bot.run_once()
        st.success("Check Complete!")
        st.code(result)

# Continuous Monitoring mode
else:
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Start Continuous Monitoring"):
            bot.PAYLOAD = build_payload()  # Inject filters
            message = bot.start_continuous()
            st.success(message)
    with col2:
        if st.button("Stop Continuous Monitoring"):
            message = bot.stop_continuous()
            st.warning(message)

    st.info("Continuous monitoring runs in the background. Check console/logs for updates.")

bot.PAYLOAD = build_payload()  # update filters
bot.start_continuous()
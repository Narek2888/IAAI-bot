import os
import requests
import time
from dotenv import load_dotenv
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from bs4 import BeautifulSoup
from configs import mail_sender as EMAIL_SENDER
from configs import mail_receiver as EMAIL_RECEIVER
from request_data import BASE_URL, API_URL, HEADERS, PAYLOAD

# Load environment variables from .env file
load_dotenv()

# SendGrid API key from environment variable
sendgrid_key = os.getenv("SENDGRID_API_KEY")

# Time between each poll to the IAAI API
POLL_INTERVAL_SECONDS = 600  # 10 minutes

# -------------------------
# EMAIL SENDER
# -------------------------

def send_email(subject, body):
    email_message = Mail(
        from_email=EMAIL_SENDER,
        to_emails= EMAIL_SENDER,
        subject=subject,
        html_content=body
    )

    api_key = sendgrid_key
    if not api_key:
        raise ValueError("SENDGRID_API_KEY is not set!")

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(email_message)
        print("Email sent! Status:", response.status_code)
    except Exception as e:
        print("Email failed:", e)
        if hasattr(e, "body"):
            print(e.body)


# -------------------------
# IAAI CHECK + DATA PARSING
# -------------------------

def scrap_car_info(html):
    """
    Extracts Stock ID (from 'name' attribute) as key and Absolute URL as value 
    from <a> tags nested within <h4> tags.
    Returns a dictionary: {stock_id: absolute_url}.
    """
    soup = BeautifulSoup(html, "html.parser")
    # Change the return type from a list of dictionaries to a single dictionary
    vehicle_data = []

    # Find all <a> tags that are inside an <h4> with class 'heading-7 rtl-disabled'
    vehicle_links = soup.select("div.table-cell.table-cell-horizontal-center span.data-list__value--action a")
    stock_spans = soup.find_all(
        "span",
        class_="data-list__value",
        title=lambda x: x and "Stock" in x
    )
    

    for data, span in zip(vehicle_links, stock_spans):
        # Extract the attributes:
        name = data.get('name')
        stock_id = span.get_text(strip=True)
        price = data.get_text(strip=True)
        vehicle_data.append({
        "vehicle_link": f"{BASE_URL}/VehicleDetail/{name}~US",
        "stock_id": stock_id,
        "image": f"<img src = https://vis.iaai.com/resizer?imageKeys={name}~SID~I1&amp;width=400&amp;height=300>",
        "price": price
        })

    return vehicle_data


def check_iaai():
    """Send POST request, return list of stock numbers."""
    try:
        response = requests.post(API_URL, json=PAYLOAD, headers=HEADERS, timeout=20)
        html = response.text

        print("Received HTML:", len(html), "bytes")

        stocks = scrap_car_info(html)

        return stocks

    except Exception as e:
        print("Error calling API:", e)
        return []


# ------------------------
# MAIN LOOP
# ------------------------

def start_bot():
    print("IAAI Stock Checker started... polling every", POLL_INTERVAL_SECONDS, "seconds.")

    # Store full items indexed by stock_id
    known_stocks = {}

    while True:
        current_stocks = check_iaai()

        if not current_stocks:
            print("No vehicle listings found in response!")
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        print(f"Found {len(current_stocks)} total listings.")

        new_listings = []
        price_changes = []

        for item in current_stocks:
            stock_id = item["stock_id"]
            price = item["price"]

            # NEW STOCK
            if stock_id not in known_stocks:
                new_listings.append(item)
                known_stocks[stock_id] = item       # <-- store full dict
                continue

            # PRICE CHANGE
            old_price = known_stocks[stock_id]["price"]

            if price < old_price:
                price_changes.append({
                    **item,
                    "old_price": old_price
                })

            # Always update stored full item
            known_stocks[stock_id] = item           # <-- store full dict

        # SEND EMAIL: NEW LISTINGS
        if new_listings:
            message = ["<h2>🚗 New Listings Found</h2><br>"]
            for item in new_listings:
                message.append(
                    f"<b>Stock ID:</b> {item['stock_id']}<br>"
                    f"<b>Price:</b> {item['price']}<br>"
                    f"<b>Link:</b> <a href='{item['vehicle_link']}'>{item['vehicle_link']}</a><br>"
                    f"{item['image']}<br><br>"
                )
            send_email(
                subject=f"🚗 New IAAI Tesla Listings ({len(new_listings)})",
                body="".join(message)
            )

        # SEND EMAIL: PRICE CHANGES
        if price_changes:
            message = ["<h2>💰 Price Change Detected</h2><br>"]
            for item in price_changes:
                message.append(
                    f"<b>Stock ID:</b> {item['stock_id']}<br>"
                    f"<b>Old Price:</b> {item['old_price']}<br>"
                    f"<b>New Price:</b> {item['price']}<br>"
                    f"<b>Link:</b> <a href='{item['vehicle_link']}'>{item['vehicle_link']}</a><br>"
                    f"{item['image']}<br><br>"
                )
            send_email(
                subject=f"💰 Price Changed ({len(price_changes)})",
                body="".join(message)
            )

        print(f"Sleeping for {POLL_INTERVAL_SECONDS} seconds...\n")
        time.sleep(POLL_INTERVAL_SECONDS)



if __name__ == "__main__":
    start_bot()
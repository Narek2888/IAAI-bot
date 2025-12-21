import os
import time
import threading
import requests
from bs4 import BeautifulSoup
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from dotenv import load_dotenv
from configs import mail_sender as EMAIL_SENDER
from user_service import get_user_email, user_exists
from request_data import BASE_URL, API_URL, HEADERS

load_dotenv()
SENDGRID_KEY = os.getenv("SENDGRID_API_KEY")
POLL_INTERVAL_SECONDS = 600  # 10 minutes


def send_email(user_id: int, subject: str, body: str):
    """Send email via SendGrid"""
    if not SENDGRID_KEY:
        raise ValueError("SENDGRID_API_KEY is not set!")

    receiver_email = get_user_email(user_id)
    if not receiver_email:
        return "Email not sent: user email not found"

    message = Mail(
        from_email=EMAIL_SENDER,
        to_emails=receiver_email,
        subject=subject,
        html_content=body
    )

    try:
        sg = SendGridAPIClient(SENDGRID_KEY)
        response = sg.send(message)
        return f"Email sent to {receiver_email} (Status {response.status_code})"
    except Exception as e:
        return f"Email failed: {e}"


def scrap_car_info(html):
    """Parse HTML to extract vehicle info"""
    soup = BeautifulSoup(html, "html.parser")
    vehicle_links = soup.select(
        "div.table-cell.table-cell-horizontal-center span.data-list__value--action a"
    )
    stock_spans = soup.find_all("span", class_="data-list__value", title=lambda x: x and "Stock" in x)

    vehicle_data = []
    for data, span in zip(vehicle_links, stock_spans):
        name = data.get('name')
        stock_id = span.get_text(strip=True)
        price = span.get_text(strip=True)
        vehicle_data.append({
            "vehicle_link": f"{BASE_URL}/VehicleDetail/{name}~US",
            "stock_id": stock_id,
            "image": f"<img src=https://vis.iaai.com/resizer?imageKeys={name}~SID~I1&width=400&height=300>",
            "price": price
        })
    return vehicle_data


def check_iaai(payload):
    """Fetch current listings from IAAI"""
    try:
        response = requests.post(API_URL, json=payload, headers=HEADERS, timeout=20)
        html = response.text
        stocks = scrap_car_info(html)
        return stocks
    except Exception:
        return []


class IAAIBot:
    """Bot instance for a specific user"""

    def __init__(self, user_id: int, payload=None):
        if user_id is None:
            raise ValueError("user_id must be provided")
        self.user_id = user_id
        self.known_stocks = {}
        self.continuous_mode = False
        self.thread = None
        self.PAYLOAD = payload

    def process_new_and_price_changes(self, current_stocks):
        new_listings = []
        price_changes = []

        for item in current_stocks:
            stock_id = item["stock_id"]
            price = item["price"]

            if stock_id not in self.known_stocks:
                new_listings.append(item)
            else:
                old_price = self.known_stocks[stock_id]["price"]
                if price < old_price:
                    price_changes.append({**item, "old_price": old_price})

            self.known_stocks[stock_id] = item

        return new_listings, price_changes

    def run_once(self):
        """Run one-time check"""
        if not self.PAYLOAD:
            return "No payload set. Apply filters first."

        current_stocks = check_iaai(self.PAYLOAD)
        if not current_stocks:
            return "No listings found."

        new_listings, price_changes = self.process_new_and_price_changes(current_stocks)

        results = []

        if new_listings:
            body = "".join([
                f"<b>Stock ID:</b> {item['stock_id']}<br>"
                f"<b>Price:</b> {item['price']}<br>"
                f"<b>Link:</b> <a href='{item['vehicle_link']}'>{item['vehicle_link']}</a><br>"
                f"{item['image']}<br><br>"
                for item in new_listings
            ])
            results.append(send_email(self.user_id, f"🚗 IAAI New Listings ({len(new_listings)})", body))

        if price_changes:
            body = "".join([
                f"<b>Stock ID:</b> {item['stock_id']}<br>"
                f"<b>Old Price:</b> {item['old_price']}<br>"
                f"<b>New Price:</b> {item['price']}<br>"
                f"<b>Link:</b> <a href='{item['vehicle_link']}'>{item['vehicle_link']}</a><br>"
                f"{item['image']}<br><br>"
                for item in price_changes
            ])
            results.append(send_email(self.user_id, f"💰 Price Changed ({len(price_changes)})", body))

        return "\n".join(results) if results else "No new updates."

    def start_continuous(self):
        """Start continuous monitoring in background"""
        if self.thread and self.thread.is_alive():
            return "Continuous monitoring already running."

        self.continuous_mode = True
        self.thread = threading.Thread(target=self._continuous_loop, daemon=True)
        self.thread.start()
        return "Continuous monitoring started."

    def stop_continuous(self):
        """Stop continuous monitoring"""
        self.continuous_mode = False
        return "Continuous monitoring stopped."

    def _continuous_loop(self):
        """Loop for continuous monitoring"""
        while self.continuous_mode:
            if not user_exists(self.user_id) or not get_user_email(self.user_id):
                self.continuous_mode = False
                break
            result = self.run_once()
            print(result)
            time.sleep(POLL_INTERVAL_SECONDS)

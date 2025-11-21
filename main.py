import requests
import time
from dotenv import load_dotenv
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from bs4 import BeautifulSoup
from configs import mail_sender, mail_receiver

# -------------------------
# CONFIGURATION
# -------------------------
load_dotenv()

sendgrid_key = os.getenv("SENDGRID_API_KEY")

API_URL = f"https://www.iaai.com/Search?c={int(time.time() * 1000)}"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    # Referer is sometimes checked to ensure the request is coming from their own site
    'Referer': 'https://www.iaai.com/advanced-search' 
}

PAYLOAD = {
    "Searches": [
        {
            "Facets": [
                {
                    "Group": "AuctionType",
                    "Value": "Buy Now"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
        },
        {
            "Facets": [
                {
                    "Group": "FuelTypeDesc",
                    "Value": "Electric"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
        },
        {
            "Facets": [
                {
                    "Group": "Make",
                    "Value": "TESLA"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
        },
        {
            "Facets": [
                {
                    "Group": "Model",
                    "Value": "MODEL 3"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
        },
        {
            "Facets": None,
            "FullSearch": None,
            "LongRanges": [
                {
                    "From": 2021,
                    "Name": "Year",
                    "To": 2026
                }
            ]
        },
        {
            "Facets": None,
            "FullSearch": None,
            "LongRanges": [
                {
                    "From": 0,
                    "Name": "MinimumBidAmount",
                    "To": 5500
                }
            ]
        }
    ],
    "ZipCode": "",
    "miles": 0,
    "PageSize": 100,
    "CurrentPage": 1,
    "Sort": [
        {
            "IsGeoSort": False,
            "SortField": "AuctionDateTime",
            "IsDescending": False
        }
    ],
    "ShowRecommendations": False,
    "SaleStatusFilters": [
        {
            "SaleStatus": 1,
            "IsSelected": True
        }
    ],
    "BidStatusFilters": [
        {
            "BidStatus": 6,
            "IsSelected": True
        }
    ]
}

POLL_INTERVAL_SECONDS = 300  # 5 minutes

EMAIL_SENDER = mail_sender
EMAIL_RECEIVER = mail_receiver


# -------------------------
# EMAIL SENDER
# -------------------------

def send_email(subject, message):
    message = Mail(
        from_email=EMAIL_SENDER,
        to_emails=EMAIL_RECEIVER,
        subject=subject,
        html_content=message
    )

    try:
        sg = SendGridAPIClient(api_key=os.getenv("SENDGRID_API_KEY"))
        response = sg.send(message)
        print("Email sent! Status:", response.status_code)
    except Exception as e:
        print("Email failed:", e)


# -------------------------
# IAAI CHECK + STOCK PARSING
# -------------------------

def extract_stock_numbers(html):
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
    
    BASE_URL = "https://www.iaai.com"

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

        stocks = extract_stock_numbers(html)

        return stocks

    except Exception as e:
        print("Error calling API:", e)
        return []


# -------------------------
# MAIN LOOP
# -------------------------

def start_bot():
    print("IAAI Stock Checker started... polling every", POLL_INTERVAL_SECONDS, "seconds.")

    # last_seen now stores the stock IDs (keys) of previously seen vehicles
    last_seen_ids = set() 

    while True:
        # 'current_stocks' is a dictionary: {stock_id: absolute_url}
        current_stocks = check_iaai()

        if not current_stocks:
            print("No vehicle listings found in response! (Might be blocked or zero results)")
        else:
            print(f"Found {len(current_stocks)} total listings.")
        
        # Determine new listings by comparing current keys to last_seen_ids
        new_stocks = []

        for item in current_stocks:
            stock_id = item["stock_id"]

            if stock_id not in last_seen_ids:
                new_stocks.append(item)
        
        # Only add new IDs to last_seen_ids once they are processed for the email
        last_seen_ids.update([item["stock_id"] for item in new_stocks])



        if new_stocks:
          message_lines = ["New listings found:\n"]

          for item in new_stocks:
              message_lines.append(
                  f"Stock ID: {item['stock_id']}\n"
                  f"Price: {item['price']}\n"
                  f"Link: {item['vehicle_link']}\n"
                  f"Image: {item['image']}\n"
              )

          email_message = "\n".join(message_lines)

          send_email(
              subject=f"🚗 New IAAI Tesla Model 3 Listings ({len(new_stocks)})",
              message=email_message
          )
        else:
            print("No new listings found since last check.")

        print(f"\nSleeping for {POLL_INTERVAL_SECONDS} seconds...")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    start_bot()

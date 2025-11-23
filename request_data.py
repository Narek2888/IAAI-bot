import time

BASE_URL = "https://www.iaai.com"

API_URL = f"{BASE_URL}/Search?c={int(time.time() * 1000)}"

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
            "Facets": None,
            "FullSearch": None,
            "LongRanges": [
                {
                    "From": 2020,
                    "Name": "Year",
                    "To": 2026
                }
            ]
        },
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
            "Facets": None,
            "FullSearch": None,
            "LongRanges": [
                {
                    "From": 0,
                    "Name": "MinimumBidAmount",
                    "To": 1500
                }
            ]
        },
        {
            "Facets": None,
            "FullSearch": None,
            "LongRanges": [
                {
                    "From": 0,
                    "Name": "ODOValue",
                    "To": 50000
                }
            ]
        },
        {
            "Facets": [
                {
                    "Group": "InventoryTypes",
                    "Value": "Automobiles"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
        },
        {
            "Facets": [
                {
                    "Group": "InventoryTypes",
                    "Value": "Motorcycles"
                }
            ],
            "FullSearch": None,
            "LongRanges": None
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
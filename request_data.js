// Current timestamp in milliseconds
const BASE_URL = "https://www.iaai.com";
const API_URL = `${BASE_URL}/Search?c=${Date.now()}`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  // Referer is sometimes checked to ensure the request is coming from their own site
  Referer: "https://www.iaai.com/advanced-search",
};

const PAYLOAD = {
  Searches: [
    {
      Facets: null,
      FullSearch: null,
      LongRanges: [
        {
          From: 2020,
          Name: "Year",
          To: 2026,
        },
      ],
    },
    {
      Facets: [
        {
          Group: "AuctionType",
          Value: "Buy Now",
          ForAnalytics: false,
        },
      ],
      FullSearch: null,
      LongRanges: null,
    },
    {
      Facets: null,
      FullSearch: null,
      LongRanges: [
        {
          From: 0,
          Name: "MinimumBidAmount",
          To: 1500,
        },
      ],
    },
    {
      Facets: null,
      FullSearch: null,
      LongRanges: [
        {
          From: 0,
          Name: "ODOValue",
          To: 50000,
        },
      ],
    },
    {
      Facets: [
        {
          Group: "InventoryTypes",
          Value: "Automobiles",
          ForAnalytics: false,
        },
      ],
      FullSearch: null,
      LongRanges: null,
    },
  ],
  ZipCode: "",
  miles: 0,
  PageSize: 100,
  CurrentPage: 1,
  Sort: [
    {
      IsGeoSort: false,
      SortField: "TenantSortOrder",
      IsDescending: false,
    },
  ],
  ShowRecommendations: false,
  SaleStatusFilters: [
    {
      SaleStatus: 1,
      IsSelected: true,
    },
  ],
  BidStatusFilters: [
    {
      BidStatus: 6,
      IsSelected: true,
    },
  ],
};

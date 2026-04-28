import os
from dotenv import load_dotenv
from pathlib import Path


# SODA2 API endpoints, with a limit of 50k records per request
CRASH_API_URL = "https://data.cityofnewyork.us/resource/h9gi-nx95.csv"
VEHICLE_API_URL = "https://data.cityofnewyork.us/resource/bm4k-52h4.csv"
PERSON_API_URL = "https://data.cityofnewyork.us/resource/f55k-p6yu.csv"

# Where to save downloaded data to
DATA_DIR = Path(__file__).parent.resolve() / "data"
CRASH_CSV_PATH = DATA_DIR / "crash_data.csv"
VEHICLE_CSV_PATH = DATA_DIR / "vehicle_data.csv"
PERSON_CSV_PATH = DATA_DIR / "person_data.csv"
HOURLY_WEATHER_CSV_PATH = DATA_DIR / "hourly_weather_data.csv"
DAILY_WEATHER_CSV_PATH = DATA_DIR / "daily_weather_data.csv"

# Where to save DuckDB resources to
DUCKDB_DATABASE_NAME = "NYC_crash_weather_analysis"
DUCKDB_PATH = f"/tmp/{DUCKDB_DATABASE_NAME}.duckdb"

# Obtained from and for use with Open-Meteo API (https://open-meteo.com/)
BOROUGH_COORDINATES = {
    "manhattan": (40.7834, -73.9663),
    "brooklyn": (40.6501, -73.9496),
    "queens": (40.6815, -73.8365),
    "the bronx": (40.8499, -73.8664),
    "staten island": (40.5623, -74.1399),
}

# Load weather variables for querying Open-Meteo API set in .env
load_dotenv()

RAW_HOURLY_WEATHER_VARS = os.getenv("HOURLY_WEATHER_VARS")
HOURLY_WEATHER_VARS = (
    RAW_HOURLY_WEATHER_VARS.split(",") if RAW_HOURLY_WEATHER_VARS else []
)

RAW_DAILY_WEATHER_VARS = os.getenv("DAILY_WEATHER_VARS")
DAILY_WEATHER_VARS = RAW_DAILY_WEATHER_VARS.split(",") if RAW_DAILY_WEATHER_VARS else []

TIMEZONE = os.getenv("TIMEZONE")
TEMPERATURE_UNIT = os.getenv("TEMPERATURE_UNIT")
PRECIPITATION_UNIT = os.getenv("PRECIPITATION_UNIT")
START_DATE = os.getenv("START_DATE")
END_DATE = os.getenv("END_DATE")

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
    "bronx": (40.8499, -73.8664),
    "brooklyn": (40.6501, -73.9496),
    "manhattan": (40.7834, -73.9663),
    "queens": (40.6815, -73.8365),
    "staten island": (40.5623, -74.1399),
}

TIMEZONE = "America/New_York"
TEMPERATURE_UNIT = "fahrenheit"
PRECIPITATION_UNIT = "inch"

# Always keep the order of weather variables in hourly or daily as below. Set a variable to an empty list to specify that no weather variables of a certain frequency are to be fetched.
HOURLY_WEATHER_VARS = []
DAILY_WEATHER_VARS = [
    "sunrise",
    "sunset",
    "temperature_2m_max",
    "temperature_2m_min",
    "rain_sum",
    "snowfall_sum",
    "precipitation_hours",
]

# Either specify start and end dates (formatted as "%Y-%m-%d") here, or set either to None to use the oldest or newest date in the crash dataset
START_DATE = "2012-07-01"
END_DATE = "2026-04-29"

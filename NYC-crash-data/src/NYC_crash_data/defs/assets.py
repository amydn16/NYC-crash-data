import dagster as dg
import pandas as pd
from pathlib import Path
from src.NYC_crash_data.defs.constants import (
    CRASH_API_URL,
    VEHICLE_API_URL,
    PERSON_API_URL,
    CRASH_CSV_PATH,
    VEHICLE_CSV_PATH,
    PERSON_CSV_PATH,
    HOURLY_WEATHER_CSV_PATH,
    DAILY_WEATHER_CSV_PATH,
)
from src.NYC_crash_data.defs.download_utils import (
    create_traffic_asset,
    get_params_for_fetching_weather_data,
    create_weather_asset,
)


@dg.asset
def crashes() -> str:
    return create_traffic_asset(CRASH_API_URL, CRASH_CSV_PATH)


@dg.asset
def vehicles() -> str:
    return create_traffic_asset(VEHICLE_API_URL, VEHICLE_CSV_PATH)


@dg.asset
def persons() -> str:
    return create_traffic_asset(PERSON_API_URL, PERSON_CSV_PATH)


@dg.asset(deps=["crashes"])
def weather() -> list[str]:
    params = get_params_for_fetching_weather_data(CRASH_CSV_PATH)

    if HOURLY_WEATHER_VARS and DAILY_WEATHER_VARS:
        file_path = {"hourly": HOURLY_WEATHER_CSV_PATH, "daily": DAILY_WEATHER_CSV_PATH}
    elif HOURLY_WEATHER_VARS:
        file_path = HOURLY_WEATHER_CSV_PATH
    elif DAILY_WEATHER_VARS:
        file_path = DAILY_WEATHER_CSV_PATH
    else:
        file_path = None

    if file_path is None:
        return ""

    return create_weather_asset(params, file_path)

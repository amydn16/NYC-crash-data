import openmeteo_requests
import pandas as pd
import requests_cache
from pathlib import Path
from openmeteo_requests import Client
from requests_cache import CachedSession
from retry_requests import retry
from src.NYC_crash_data.defs.constants import (
    BOROUGH_COORDINATES,
    HOURLY_WEATHER_VARS,
    DAILY_WEATHER_VARS,
    TIMEZONE,
    TEMPERATURE_UNIT,
    PRECIPITATION_UNIT,
    START_DATE,
    END_DATE,
)

QUERY_LIMIT = 50000
INITIAL_OFFSET = 0


def download_traffic_data(url: str) -> list[pd.DataFrame]:
    dfs = []
    offset = INITIAL_OFFSET
    download = True
    query_url = ""

    try:
        while download:
            query_url = f"{url}?$limit={QUERY_LIMIT}&$offset={offset}"
            df = pd.read_csv(query_url)
            if df.shape[0] == 0:  # No more data to download
                download = False
            else:
                dfs.append(df)
                offset += QUERY_LIMIT
    except Exception as e:
        print(f"Error downloading data from {query_url}: {e}")
    return dfs


def write_traffic_data_to_csv(dfs: list[pd.DataFrame], file_path: Path) -> bool:
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        df = pd.concat(dfs, ignore_index=True)
        df.to_csv(file_path, index=False)
        return True
    except Exception as e:
        print(f"Error writing data to {file_path}: {e}")
        return False


def create_traffic_asset(url: str, file_path: Path) -> str:
    dfs = download_traffic_data(url)
    write_traffic_data_to_csv_success = write_traffic_data_to_csv(dfs, file_path)
    if write_traffic_data_to_csv_success:
        return str(file_path)
    else:
        return ""


def download_weather_data(
    params: dict[str, str | list[str | float]],
) -> dict[str, pd.DataFrame]:
    # Setup the Open-Meteo API client with cache and retry on error
    cache_session = CachedSession(".cache", expire_after=-1)
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    openmeteo = Client(session=retry_session)  # pyright: ignore

    url = "https://archive-api.open-meteo.com/v1/archive"
    responses = openmeteo.weather_api(url, params=params)

    results = {}

    try:
        # Process all locations listed in params
        for response in responses:
            if "hourly" in params:
                # Process hourly data. The order of variables needs to be the same as requested.
                hourly = response.Hourly()
                hourly_temperature_2m = hourly.Variables(0).ValuesAsNumpy()  # pyright: ignore
                hourly_rain = hourly.Variables(1).ValuesAsNumpy()  # pyright: ignore
                hourly_snowfall = hourly.Variables(2).ValuesAsNumpy()  # pyright: ignore
                hourly_wind_speed_10m = hourly.Variables(3).ValuesAsNumpy()  # pyright: ignore

                hourly_data = {
                    "date": pd.date_range(
                        start=pd.to_datetime(
                            hourly.Time() + response.UtcOffsetSeconds(),  # pyright: ignore
                            unit="s",
                            utc=True,
                        ),
                        end=pd.to_datetime(
                            hourly.TimeEnd() + response.UtcOffsetSeconds(),  # pyright: ignore
                            unit="s",
                            utc=True,
                        ),
                        freq=pd.Timedelta(seconds=hourly.Interval()),  # pyright: ignore
                        inclusive="left",
                    )
                }

                hourly_data["temperature_2m"] = hourly_temperature_2m  # pyright: ignore
                hourly_data["rain"] = hourly_rain  # pyright: ignore
                hourly_data["snowfall"] = hourly_snowfall  # pyright: ignore
                hourly_data["wind_speed_10m"] = hourly_wind_speed_10m  # pyright: ignore

                results["hourly_data"] = pd.DataFrame(data=hourly_data)

            # Process daily data. The order of variables needs to be the same as requested.
            daily = response.Daily()
            daily_sunrise = daily.Variables(0).ValuesInt64AsNumpy()  # pyright: ignore
            daily_sunset = daily.Variables(1).ValuesInt64AsNumpy()  # pyright: ignore

            daily_data = {
                "date": pd.date_range(
                    start=pd.to_datetime(
                        daily.Time() + response.UtcOffsetSeconds(),
                        unit="s",
                        utc=True,  # pyright: ignore
                    ),
                    end=pd.to_datetime(
                        daily.TimeEnd() + response.UtcOffsetSeconds(),  # pyright: ignore
                        unit="s",
                        utc=True,
                    ),
                    freq=pd.Timedelta(seconds=daily.Interval()),  # pyright: ignore
                    inclusive="left",
                )
            }

            daily_data["sunrise"] = daily_sunrise  # pyright: ignore
            daily_data["sunset"] = daily_sunset  # pyright: ignore

            results["daily_data"] = pd.DataFrame(data=daily_data)

        return results

    except Exception as e:
        print(f"Error fetching weather data: {e}")
        return results


def get_min_max_dates_from_csv(
    file_path: Path,
) -> tuple[pd.Timestamp, pd.Timestamp] | None:
    try:
        df = pd.read_csv(file_path, usecols=["crash_date"])
        df["crash_date"] = pd.to_datetime(df["crash_date"], errors="coerce")
        df = df.dropna(subset=["crash_date"])

        crash_dates = df["crash_date"].tolist()
        min_date = min(crash_dates)
        max_date = max(crash_dates)
        return min_date, max_date
    except Exception as e:
        print(f"Error reading crash dates from {str(file_path)}: {e}")
        return


def get_boroughs_from_csv(file_path: Path) -> list[str]:
    try:
        df = pd.read_csv(file_path, usecols=["borough"])
        return sorted([str(item) for item in df["borough"].dropna().unique().tolist()])
    except Exception as e:
        print(f"Error reading boroughs from {str(file_path)}: {e}")
        return []


def get_params_for_fetching_weather_data(
    file_path: Path,
) -> dict[str, str | list[str | float]]:
    params = {}
    min_date = ""
    max_date = ""

    try:
        if START_DATE and END_DATE:
            min_date = START_DATE
            max_date = END_DATE
        else:
            min_max_dates = get_min_max_dates_from_csv(file_path)
            if not min_max_dates:
                return params

            if min_max_dates and END_DATE and not START_DATE:
                min_date_ts, _ = min_max_dates
                min_date = min_date_ts.strftime("%Y-%m-%d")
                max_date = END_DATE
            elif min_max_dates and START_DATE and not END_DATE:
                min_date = START_DATE
                _, max_date_ts = min_max_dates
                max_date = max_date_ts.strftime("%Y-%m-%d")
            elif min_max_dates:
                min_date_ts, max_date_ts = min_max_dates
                min_date = min_date_ts.strftime("%Y-%m-%d")
                max_date = max_date_ts.strftime("%Y-%m-%d")

        params["start_date"] = min_date
        params["end_date"] = max_date

        boroughs = get_boroughs_from_csv(file_path)

        params["latitude"] = []
        params["longitude"] = []
        for borough in boroughs:
            if borough in BOROUGH_COORDINATES:
                lat, lon = BOROUGH_COORDINATES[borough]
                params["latitude"].append(lat)
                params["longitude"].append(lon)

        if HOURLY_WEATHER_VARS:
            params["hourly"] = HOURLY_WEATHER_VARS

        if DAILY_WEATHER_VARS:
            params["daily"] = DAILY_WEATHER_VARS

        params["timezone"] = TIMEZONE * len(boroughs)
        params["temperature_unit"] = TEMPERATURE_UNIT
        params["precipitation_unit"] = PRECIPITATION_UNIT

        return params
    except Exception as e:
        print(f"Error getting params for fetching weather data: {e}")
        return params


def create_weather_asset(
    params: dict[str, str | list[str | float]], file_path_dict: dict[str, Path]
) -> list[str]:
    weather_data = download_weather_data(params)
    try:
        if len(weather_data) == 1:
            file_path = list(file_path_dict.values())[0]
            file_path.parent.mkdir(parents=True, exist_ok=True)
            weather_data[list(weather_data)[0]].to_csv(file_path, index=False)
            return [str(file_path)]

        elif len(weather_data) == 2:
            results = []
            for item in ["hourly_data", "daily_data"]:
                file_path_dict[item].parent.mkdir(parents=True, exist_ok=True)
                weather_data[item].to_csv(file_path_dict[item], index=False)
                results.append(str(file_path_dict[item]))
            return results

        return []

    except Exception as e:
        print(f"Error writing weather data to {file_path_dict}: {e}")
        return []

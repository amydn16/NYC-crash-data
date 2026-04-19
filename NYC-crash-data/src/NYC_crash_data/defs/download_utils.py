import openmeteo_requests
import pandas as pd
import requests_cache
from pathlib import Path
from retry_requests import retry
from src.NYC_crash_data.defs.constants import (
    BOROUGH_COORDINATES,
    HOURLY_WEATHER_VARS,
    DAILY_WEATHER_VARS,
    TIMEZONE,
    TEMPERATURE_UNIT,
    PRECIPITATION_UNIT,
)

QUERY_LIMIT = 50000
INITIAL_OFFSET = 0


def download_traffic_data(url: str) -> list[pd.DataFrame]:
    dfs = []
    offset = INITIAL_OFFSET
    download = True
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
    cache_session = requests_cache.CachedSession(".cache", expire_after=-1)
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    openmeteo = openmeteo_requests.Client(session=retry_session)

    url = "https://archive-api.open-meteo.com/v1/archive"
    responses = openmeteo.weather_api(url, params=params)

    results = {}

    try:
        # Process all locations listed in params
        for response in responses:
            if "hourly" in params:
                # Process hourly data. The order of variables needs to be the same as requested.
                hourly = response.Hourly()
                hourly_temperature_2m = hourly.Variables(0).ValuesAsNumpy()
                hourly_rain = hourly.Variables(1).ValuesAsNumpy()
                hourly_snowfall = hourly.Variables(2).ValuesAsNumpy()
                hourly_wind_speed_10m = hourly.Variables(3).ValuesAsNumpy()

                hourly_data = {
                    "date": pd.date_range(
                        start=pd.to_datetime(
                            hourly.Time() + response.UtcOffsetSeconds(),
                            unit="s",
                            utc=True,
                        ),
                        end=pd.to_datetime(
                            hourly.TimeEnd() + response.UtcOffsetSeconds(),
                            unit="s",
                            utc=True,
                        ),
                        freq=pd.Timedelta(seconds=hourly.Interval()),
                        inclusive="left",
                    )
                }

                hourly_data["temperature_2m"] = hourly_temperature_2m
                hourly_data["rain"] = hourly_rain
                hourly_data["snowfall"] = hourly_snowfall
                hourly_data["wind_speed_10m"] = hourly_wind_speed_10m

                results["hourly_data"] = pd.DataFrame(data=hourly_data)

            # Process daily data. The order of variables needs to be the same as requested.
            daily = response.Daily()
            daily_sunrise = daily.Variables(0).ValuesInt64AsNumpy()
            daily_sunset = daily.Variables(1).ValuesInt64AsNumpy()

            daily_data = {
                "date": pd.date_range(
                    start=pd.to_datetime(
                        daily.Time() + response.UtcOffsetSeconds(), unit="s", utc=True
                    ),
                    end=pd.to_datetime(
                        daily.TimeEnd() + response.UtcOffsetSeconds(),
                        unit="s",
                        utc=True,
                    ),
                    freq=pd.Timedelta(seconds=daily.Interval()),
                    inclusive="left",
                )
            }

            daily_data["sunrise"] = daily_sunrise
            daily_data["sunset"] = daily_sunset

            results["daily_data"] = pd.DataFrame(data=daily_data)

        return results

    except Exception as e:
        print(f"Error fetching weather data: {e}")
        return results


def get_min_max_dates_from_csv(
    file_path: Path,
) -> tuple[pd.Timestamp, pd.Timestamp] | None:
    try:
        df = pd.read_csv(file_path, usecols=["crash_date"], parse_dates=["crash_date"])
        min_date = df["crash_date"].min()
        max_date = df["crash_date"].max()
        return min_date, max_date
    except Exception as e:
        print(f"Error reading crash dates from {str(file_path)}: {e}")
        return


def get_boroughs_from_csv(file_path: Path) -> list[str, ...]:
    try:
        df = pd.read_csv(file_path, usecols=["borough"])
        return sorted(list(df["borough"].dropna().unique().astype(str).lower()))
    except Exception as e:
        print(f"Error reading boroughs from {str(file_path)}: {e}")
        return []


def get_params_for_fetching_weather_data(
    file_path: Path,
) -> dict[str, str | list[str | float]]:
    params = {}
    try:
        min_date, max_date = get_min_max_dates_from_csv(file_path)
        boroughs = get_boroughs_from_csv(file_path)

        params["start_date"] = min_date.strftime("%Y-%m-%d")
        params["end_date"] = max_date.strftime("%Y-%m-%d")

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
    params: dict[str, str | list[str | float]], file_path: Path | dict[str, Path]
) -> list[str]:
    weather_data = download_weather_data(params)
    try:
        if len(weather_data) == 1:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            weather_data[f"{list(weather_data)[0]}_data"].to_csv(file_path, index=False)
            return [str(file_path)]

        elif len(weather_data) == 2:
            for item in ["hourly", "daily"]:
                file_path[item].parent.mkdir(parents=True, exist_ok=True)
                weather_data[f"{item}_data"].to_csv(file_path[item], index=False)
            return [str(item) for item in file_path.values()]

    except Exception as e:
        print(
            f"Error writing weather data to {str(file_path) if isinstance(file_path, Path) else file_path}: {e}"
        )
        return []

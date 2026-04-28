import dagster as dg
from dagster_duckdb import DuckDBResource
from NYC_crash_data.defs.constants import (
    CRASH_API_URL,
    VEHICLE_API_URL,
    PERSON_API_URL,
    CRASH_CSV_PATH,
    VEHICLE_CSV_PATH,
    PERSON_CSV_PATH,
    HOURLY_WEATHER_CSV_PATH,
    DAILY_WEATHER_CSV_PATH,
    DUCKDB_DATABASE_NAME,
    HOURLY_WEATHER_VARS,
    DAILY_WEATHER_VARS,
)
from NYC_crash_data.defs.download_utils import (
    create_traffic_asset,
    get_params_for_fetching_weather_data,
    create_weather_asset,
)


# ------------------------------------------
# Functions for creating assets for downloaded raw data
# ------------------------------------------
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
        file_path_dict = {
            "hourly_data": HOURLY_WEATHER_CSV_PATH,
            "daily_data": DAILY_WEATHER_CSV_PATH,
        }
    elif HOURLY_WEATHER_VARS:
        file_path_dict = {"hourly_data": HOURLY_WEATHER_CSV_PATH}
    elif DAILY_WEATHER_VARS:
        file_path_dict = {"daily_data": DAILY_WEATHER_CSV_PATH}
    else:
        file_path_dict = {}

    if not file_path_dict:
        return []

    return create_weather_asset(params, file_path_dict)


# ------------------------------------------
# Functions & helpers for creating assets for ingesting raw data into DuckDB
# ------------------------------------------
def import_csv_to_duckdb(csv_path: str, duckdb: DuckDBResource, table_name: str):
    with duckdb.get_connection() as conn:
        row_count = conn.execute(
            f"""
            create or replace table {table_name} as (
                select * from read_csv('{csv_path}')
            )
            """
        ).fetchone()
        assert row_count is not None
        row_count = row_count[0]


@dg.asset(kinds={"duckdb"}, deps=["crashes"], key=["target", "main", "raw_crashes"])
def raw_crashes(duckdb: DuckDBResource) -> None:
    import_csv_to_duckdb(
        csv_path=str(CRASH_CSV_PATH),
        duckdb=duckdb,
        table_name=f"{DUCKDB_DATABASE_NAME}.main.raw_crashes",
    )


@dg.asset(kinds={"duckdb"}, deps=["vehicles"], key=["target", "main", "raw_vehicles"])
def raw_vehicles(duckdb: DuckDBResource) -> None:
    import_csv_to_duckdb(
        csv_path=str(VEHICLE_CSV_PATH),
        duckdb=duckdb,
        table_name=f"{DUCKDB_DATABASE_NAME}.main.raw_vehicles",
    )


@dg.asset(kinds={"duckdb"}, deps=["persons"], key=["target", "main", "raw_persons"])
def raw_persons(duckdb: DuckDBResource) -> None:
    import_csv_to_duckdb(
        csv_path=str(PERSON_CSV_PATH),
        duckdb=duckdb,
        table_name=f"{DUCKDB_DATABASE_NAME}.main.raw_persons",
    )


@dg.asset(
    kinds={"duckdb"}, deps=["weather"], key=["target", "main", "raw_daily_weather"]
)
def raw_daily_weather(duckdb: DuckDBResource) -> None:
    if DAILY_WEATHER_CSV_PATH.exists():
        import_csv_to_duckdb(
            csv_path=str(DAILY_WEATHER_CSV_PATH),
            duckdb=duckdb,
            table_name=f"{DUCKDB_DATABASE_NAME}.main.raw_daily_weather",
        )


@dg.asset(
    kinds={"duckdb"}, deps=["weather"], key=["target", "main", "raw_hourly_weather"]
)
def raw_hourly_weather(duckdb: DuckDBResource) -> None:
    if HOURLY_WEATHER_CSV_PATH.exists():
        import_csv_to_duckdb(
            csv_path=str(HOURLY_WEATHER_CSV_PATH),
            duckdb=duckdb,
            table_name=f"{DUCKDB_DATABASE_NAME}.main.raw_hourly_weather",
        )

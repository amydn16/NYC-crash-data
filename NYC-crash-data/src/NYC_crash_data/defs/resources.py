import dagster as dg
from dagster_duckdb import DuckDBResource
from NYC_crash_data.defs.constants import DUCKDB_PATH

database_resource = DuckDBResource(database=DUCKDB_PATH)


@dg.definitions
def resources():
    return dg.Definitions(
        resources={
            "duckdb": database_resource,
        }
    )

import os
import sys

# Load env vars from .env file
env_file = '/home/aadarsha/fyp/.env'
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val.strip("'").strip('"')

sys.path.append('/home/aadarsha/fyp/iot-airflow/dags')
import pandas as pd
from tasks.snowflake_gold import fetch_gold_for_training

print("Fetching data from Snowflake...")
gold_data = fetch_gold_for_training()
df = pd.DataFrame(gold_data)
if not df.empty:
    df.columns = [c.lower() for c in df.columns]

    print('=== Vehicle Type Combination vs Collision Rate ===')
    print(df.groupby(['vehiclea', 'vehicleb'])['is_collision_event'].agg(['sum', 'count', 'mean']).rename(columns={'sum': 'collisions', 'count': 'total', 'mean': 'collision_rate'}))

    print('\n=== vehiclea distribution ===')
    print(df['vehiclea'].value_counts())

    print('\n=== vehicleb distribution ===')
    print(df['vehicleb'].value_counts())

    print('\n=== vehiclea unique values per collision label ===')
    print(df.groupby('is_collision_event')['vehiclea'].value_counts())

    print('\n=== vehicleb unique values per collision label ===')
    print(df.groupby('is_collision_event')['vehicleb'].value_counts())
else:
    print("DataFrame is empty.")

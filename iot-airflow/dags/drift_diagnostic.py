"""
Drift diagnostic — runs inside the Airflow Docker container where Snowflake
environment variables are already loaded from ../.env via docker-compose.
"""
import sys
sys.path.insert(0, '/opt/airflow/dags')

import pandas as pd
from tasks.snowflake_gold import fetch_gold_for_training

print("Fetching Gold data from Snowflake...")
rows = fetch_gold_for_training()
df = pd.DataFrame(rows)
df.columns = [c.lower() for c in df.columns]
df['wall_time'] = pd.to_datetime(df['wall_time'])
df_sorted = df.sort_values('wall_time').reset_index(drop=True)

split_idx = int(len(df_sorted) * 0.8)

print(f"\nTotal rows: {len(df_sorted)}")
print(f"Overall collision rate: {df_sorted['is_collision_event'].mean():.2%}")

print("\n=== Train date range ===")
print(f"  From : {df_sorted['wall_time'].iloc[0]}")
print(f"  To   : {df_sorted['wall_time'].iloc[split_idx-1]}")
print(f"  Collision rate: {df_sorted['is_collision_event'].iloc[:split_idx].mean():.2%}")

print("\n=== Test date range ===")
print(f"  From : {df_sorted['wall_time'].iloc[split_idx]}")
print(f"  To   : {df_sorted['wall_time'].iloc[-1]}")
print(f"  Collision rate: {df_sorted['is_collision_event'].iloc[split_idx:].mean():.2%}")

print("\n=== Collision rate by date ===")
daily = df_sorted.groupby(df_sorted['wall_time'].dt.date)['is_collision_event'].agg(['sum','count','mean'])
daily.columns = ['collisions', 'total', 'rate']
print(daily.to_string())

print("\n=== Collision rate by hour of day ===")
hourly = df_sorted.groupby('hour_of_day')['is_collision_event'].agg(['sum','count','mean'])
hourly.columns = ['collisions', 'total', 'rate']
print(hourly.to_string())

print("\n=== Where does the test set start? ===")
print(f"  Test starts at row {split_idx} out of {len(df_sorted)}")
print(f"  Test start timestamp: {df_sorted['wall_time'].iloc[split_idx]}")

print("\n=== Collision rate by week ===")
df_sorted['week'] = df_sorted['wall_time'].dt.to_period('W')
weekly = df_sorted.groupby('week')['is_collision_event'].agg(['sum','count','mean'])
weekly.columns = ['collisions', 'total', 'rate']
print(weekly.to_string())

print("\n=== Top 10 highest-collision sessions (5-min windows) ===")
df_sorted['bucket'] = df_sorted['wall_time'].dt.floor('5min')
session = df_sorted.groupby('bucket')['is_collision_event'].agg(['sum','count','mean'])
session.columns = ['collisions', 'total', 'rate']
print(session[session['collisions'] > 0].sort_values('collisions', ascending=False).head(10).to_string())

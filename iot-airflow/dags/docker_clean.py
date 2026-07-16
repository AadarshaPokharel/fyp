import os
import shutil

ml_dir = '/opt/airflow/ml'
runs_dir = os.path.join(ml_dir, 'runs')

try:
    if os.path.exists(runs_dir):
        shutil.rmtree(runs_dir)
        print(f"Successfully deleted {runs_dir} from within Docker.")
    else:
        print(f"Directory {runs_dir} does not exist.")
except Exception as e:
    print(f"Failed to delete {runs_dir}: {e}")

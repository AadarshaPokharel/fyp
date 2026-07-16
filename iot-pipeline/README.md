# IoT Pipeline

Standalone ingestion and validation scripts for moving IoT data into MongoDB.

## Main Scripts

- `live_pipeline.py` - real-time pipeline runner
- `serial_to_csv.py` - read serial data and persist CSV
- `csv_to_mongo.py` - load CSV data into MongoDB
- `mongo_check.py` - inspect MongoDB records

## Setup

```bash
cd /home/aadarsha/fyp/iot-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Typical Usage

```bash
python live_pipeline.py
```

### Serial port (Arduino)

Default port is `/dev/ttyACM0`. If nothing is plugged in, or your board shows as another device:

```bash
python3 -m serial.tools.list_ports
python3 live_pipeline.py --port /dev/ttyUSB0
# or
export SERIAL_PORT=/dev/ttyUSB0
python3 live_pipeline.py
```

Or run scripts individually:

```bash
python serial_to_csv.py
python csv_to_mongo.py
python mongo_check.py
```

## Notes

- Ensure MongoDB connection settings are configured in script/config locations.
- TLS certificate file is included for secure MongoDB Atlas connections.
- This folder feeds data that is later used by Airflow ETL/training and backend dashboards.

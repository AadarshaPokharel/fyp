FROM apache/airflow:2.9.1-python3.11

USER root

# Fix OpenSSL TLS compatibility for MongoDB Atlas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Fix TLS 1.0/1.1 being disabled — Atlas requires TLS 1.2+
RUN sed -i 's/MinProtocol = TLSv1.2/MinProtocol = TLSv1/' /etc/ssl/openssl.cnf 2>/dev/null || true
RUN sed -i 's/DEFAULT@SECLEVEL=2/DEFAULT@SECLEVEL=1/' /etc/ssl/openssl.cnf 2>/dev/null || true

USER airflow

# Single source of truth for dependencies — see requirements.txt.
# (Previously this list was duplicated here AND in requirements.txt only
#  had imbalanced-learn, with matplotlib/seaborn installed unpinned at
#  runtime by ml_training.py — all consolidated now for reproducibility.)
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
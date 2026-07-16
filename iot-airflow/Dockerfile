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

RUN pip install --no-cache-dir \
    "pymongo[srv]==4.7.2" \
    "dnspython>=2.3.0" \
    scikit-learn==1.4.2 \
    pandas==2.2.2 \
    numpy==1.26.4 \
    snowflake-connector-python==3.9.1 \
    pyserial==3.5 \
    certifi
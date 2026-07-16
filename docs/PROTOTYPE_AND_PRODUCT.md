# Prototype purpose, deployment, hardware, and product roadmap

This document explains **why** the system exists, **where** it applies, how the **edge hardware prototype** fits the software stack, and how the solution could be **refined into a product**—without embedding firmware source code.

---

## Why this is used

- **Safety and awareness**: Ultrasonic sensing at two “nodes” (e.g., two sides of a junction or two lanes) measures distance and motion so the system can estimate **approach** and **relative risk** before a collision happens.
- **Data-driven decisions**: Raw readings and derived features feed **dashboards** and **ML models** so operators see trends, not only momentary beeps.
- **Governance**: Role-based web access, audit logs, and optional CSV workflows support **policy makers** and **admins** in regulated or institutional settings.
- **Continuous improvement**: Pipelines can **retrain** models as new labeled data arrives, so accuracy can improve over time instead of staying fixed.

---

## Where it can be used

| Context | How it helps |
|--------|----------------|
| **Campus / institutional roads** | Low-speed monitoring, alerts, and historical reporting for safety committees. |
| **Parking exits and blind corners** | Warn drivers when two paths show closing traffic at once. |
| **Smart city pilots** | Proof-of-concept for IoT + analytics before large-scale deployment. |
| **Research and FYP demos** | End-to-end story: sensors → data → ML → UI. |
| **Industrial / warehouse lanes** | Adaptable to slow vehicles if layout and thresholds are tuned (with validation). |

Deployment is **not** limited to one Arduino: the same architecture accepts data from gateways, edge PCs, or other microcontrollers if they emit compatible CSV-style telemetry.

---

## Edge firmware logic (conceptual)

The prototype firmware (not shown here as code) typically:

1. **Samples** two HC-SR04 channels on a fixed interval (e.g., a few hundred ms) to balance responsiveness and noise.
2. **Smooths** consecutive distance readings to reduce ultrasonic glitches and zero-dropouts.
3. **Detects “vehicle present”** when distance drops below a configurable threshold (proximity to the sensor’s lane).
4. **Computes** distance difference between sides, **speed** from distance change over time, **approaching** flags from speed sign, **average speed**, and **acceleration** from speed change over time.
5. **Assigns a rule-based risk level** (e.g., safe / medium / high) from combinations of both sides occupied, gap between sides, and speed—used for **local alerts** and as **labels or hints** for analytics.
6. **Drives outputs**: red/green LEDs and buzzers per node—e.g., high risk warns both sides; medium may warn the opposite side only; safe clears alarms.
7. **Streams a CSV line** over serial for logging, databases, or your `iot-pipeline` → MongoDB → backend path.

That logic aligns with features used upstream in **Snowflake Silver/Gold** and **Random Forest** training (distances, speeds, approaching flags, accelerations, risk level).

---

## Hardware components and why they make a successful prototype

| Component | Role in success |
|-----------|------------------|
| **2× HC-SR04 ultrasonic sensors** | Non-contact distance on two independent “nodes”; cheap, easy to demo; enough for **closing speed** and **both-sides occupied** logic. |
| **2× red + 2× green LEDs** | Immediate **local feedback** without opening a laptop—stakeholders see danger vs clear at a glance (good for demos and validation). |
| **2× buzzers** | Audible alert for drivers or evaluators; complements lights for noisy environments. |
| **Breadboard + jumper wires** | Fast iteration and re-wiring during lab tests without PCB fabrication. |
| **USB cable** | Powers the board and carries **serial CSV** to a PC for ingestion into your stack. |

**Why this counts as a successful prototype**

- **Closed loop**: Sense → decide → alert **on device**, while the **same stream** can feed the cloud/backend for dashboards and ML.
- **Repeatable demos**: LEDs/buzzers prove behavior even if the network is down.
- **Traceable data**: Serial CSV matches the column expectations your pipeline and models were built around.
- **Low cost / low risk** before investing in enclosures, solar, LTE, or certified automotive hardware.

---

## How to refine this as a product in the future

1. **Hardware**
   - Enclosure, cable strain relief, weatherproofing for outdoor pilots.
   - Redundant sensing (camera or radar) for validation; fusion with ultrasonics.
   - Industrial power (12–24 V) and surge protection for roadside use.

2. **Firmware**
   - Configurable thresholds via BLE/USB; OTA updates; watchdog and fault logging.
   - Timestamp sync (NTP or GPS) if multiple nodes must correlate events.

3. **Data and ML**
   - Larger, diverse datasets; per-site calibration; A/B testing of models.
   - Drift monitoring and automatic rollback if accuracy drops.

4. **Software product**
   - Multi-tenant SaaS, SSO, SLAs, billing.
   - Mobile apps for field staff; SMS/email escalation; map views.

5. **Operations**
   - 24/7 monitoring, incident runbooks, GDPR/data retention policies.

6. **Compliance**
   - For any public-road deployment, follow local traffic and privacy regulations; this stack is a **research/prototype** foundation, not a certified safety system by itself.

---

## Related repository docs

- Root `README.md` — how to run backend, frontend, Airflow, pipeline.
- `iot-airflow/README.md` — ETL, training, retrain rules.
- `backend/README.md` — APIs and prediction behavior.

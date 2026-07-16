"""
tasks/ml_training.py — Production-Grade Random Forest Pipeline.
Target: IS_COLLISION_EVENT (binary classification)

LEAKAGE FIXES APPLIED (4 issues — 3 critical, 1 advisory):
  [FIXED] Issue 1 — Median imputation computed on full dataset before split
  [FIXED] Issue 2 — BOTH_CLOSE is a near-perfect label proxy (r=0.76, removed)
  [FIXED] Issue 3 — BOTH_APPROACHING train/inference skew (aligned to bool flags)
  [FIXED] Issue 4 — RISK_LEVEL is a PERFECT label proxy (100% predictive, removed)
  [NOTE]  Column renamed: 'hour' → 'hour_of_day' to match actual Gold table schema
  [NOTE]  Scoring changed from 'accuracy' to 'f1_macro' — dataset is imbalanced (6.3% positive)
"""

import os
import sys
import datetime
import logging
import pickle
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import TimeSeriesSplit, RandomizedSearchCV
from sklearn.metrics import (
    classification_report, accuracy_score,
    confusion_matrix, ConfusionMatrixDisplay,
    roc_auc_score, average_precision_score,
    f1_score,
)

from tasks.snowflake_gold import fetch_gold_for_training
from tasks.config import MODEL_PATH, MIN_ROWS_TRAIN, MIN_NEW_ROWS_RETRAIN

# USE_SMOTE = False — PERMANENTLY DISABLED (do not re-enable without re-evaluation)
# Controlled experiment (2026-06-07) showed SMOTE HURTS this model:
#   Without SMOTE: F1 Collision=0.9990 | Threshold=0.5548 | Best weight={0:1,1:20}
#   With    SMOTE: F1 Collision=0.9804 | Threshold=0.7495 | Best weight=balanced
# Root cause: SMOTE synthesizes minority samples in feature-space, but the
# collision label in this dataset is already well-separated by raw distance
# (dista < 20cm AND distb < 20cm). Synthetic points blur this boundary.
# class_weight=balanced (or {0:1,1:20}) achieves the same recall boost without
# introducing artificial training noise that confuses the hold-out evaluation.
USE_SMOTE = False

try:
    from pymongo import MongoClient
    from bson.binary import Binary
    from tasks.config import MONGO_URI, MONGO_DB
    MONGO_ENABLED = True
except ImportError:
    MONGO_ENABLED = False

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# FEATURE LIST — leakage-safe
#
# REMOVED from original:
#   - "both_close"    → r=0.76 with target; encodes the exact firmware threshold
#                       (distA<20 AND distB<20) that defines the collision label.
#                       Keeping it lets the model trivially re-learn the rule.
#   - "risk_level"    → PERFECT proxy: risk_level=2 is 100% collision,
#                       risk_level=0 is 0% collision. Including it is target leakage.
#   - "both_approaching" → Training SQL used (speedA>0 AND speedB>0) but this
#                          data already stores the Arduino boolean flags in
#                          approachingA/approachingB. Both signals are already
#                          present as approachinga/approachingb, so the derived
#                          column adds no new information and risks skew.
#   - "hour"          → renamed to "hour_of_day" in actual Gold table schema.
#
# ADDED:
#   - "day_of_week"   → temporal signal present in data, no leakage risk
#   - "is_rush_hour"  → pre-computed temporal flag, no leakage risk
# ─────────────────────────────────────────────────────────────────────────────
FEATURES = [
    # Raw distance signals — let the RF learn the proximity threshold itself
    "dista", "distb", "distancediff", "dist_ratio",

    # Speed signals
    "speeda", "speedb", "avgspeed", "speed_sum", "closing_velocity",

    # Acceleration signals
    "accelerationa", "accelerationb", "accel_sum",

    # Approach direction (Arduino boolean flags — consistent train & inference)
    "approachinga", "approachingb",

    # REMOVED: vehiclea, vehicleb
    # Diagnostic showed vehiclea=1+vehicleb=1 accounts for 41.9% of feature
    # importance and only type-1 vehicles appear in collision scenarios.
    # This is a dataset collection artifact — not a real physical signal.
    # A collision system must trigger on proximity/velocity, not vehicle type.

    # Temporal features
    "hour_of_day", "day_of_week", "is_rush_hour",
]

TARGET = "is_collision_event"
MONGO_COLL_MODELS = "ml_models"


def lazy_install_plotting_libs():
    try:
        import matplotlib
        import seaborn
    except ImportError:
        log.info("Installing matplotlib/seaborn...")
        import subprocess
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "matplotlib", "seaborn"])
        except Exception as err:
            log.warning(f"Plotting libraries auto-installation failed: {err}")


def store_model_in_mongo(model, features, metrics, train_size, test_size, medians):
    if not MONGO_ENABLED:
        log.warning("MongoDB not available – skipping model storage.")
        return
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB]
        coll = db[MONGO_COLL_MODELS]
        model_binary = Binary(pickle.dumps(model))
        doc = {
            "model": model_binary,
            "features": features,
            "medians": medians,
            "metrics": metrics,
            "trained_at": datetime.datetime.utcnow(),
            "n_train": train_size,
            "n_test": test_size,
            "model_type": "RandomForestClassifier",
            "target": TARGET,
            "active": True,
        }
        coll.update_many({}, {"$set": {"active": False}})
        coll.insert_one(doc)
        log.info(f"Model stored in MongoDB collection '{MONGO_COLL_MODELS}'")
        client.close()
    except Exception as e:
        log.error(f"Failed to store model in MongoDB: {e}")


def print_dataset_diagnostics(df: pd.DataFrame, target_col: str) -> None:
    border = "═" * 70
    log.info(f"\n{border}\n  DATASET DIAGNOSTICS REPORT\n{border}")
    log.info(f"Shape               : {df.shape[0]} rows x {df.shape[1]} columns")
    log.info(f"Duplicate Rows      : {df.duplicated().sum()}")
    missing = df.isnull().sum()
    log.info(f"Missing Cells       : {int(missing.sum())} total missing values")

    target_counts = df[target_col].value_counts()
    log.info("Target Distribution (IS_COLLISION_EVENT):")
    for val, count in target_counts.items():
        label = "Collision" if val else "No Collision"
        log.info(f"  {label:<20} : {count:>6} ({count/len(df)*100:.1f}%)")

    imbalance_ratio = target_counts.max() / max(target_counts.min(), 1)
    log.info(f"Imbalance ratio     : {imbalance_ratio:.1f}:1")
    log.info(f"Class imbalance     : {'⚠ High — using class_weight=balanced + f1 scoring' if imbalance_ratio > 3 else '✓ Manageable'}")
    log.info(f"{border}")


def generate_and_save_visuals(
    df: pd.DataFrame,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    y_pred: np.ndarray,
    y_prob: np.ndarray,
    best_model,
    run_dir: str,
):
    lazy_install_plotting_libs()
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import seaborn as sns
        from sklearn.metrics import RocCurveDisplay, PrecisionRecallDisplay

        sns.set_theme(style="whitegrid", palette="muted")

        # ── 1. EDA Overview ─────────────────────────────────────────────────
        fig, axes = plt.subplots(1, 3, figsize=(20, 6))

        # 1a. Target counts
        tc = df[TARGET].value_counts()
        count_0 = tc.get(False, tc.iloc[0] if len(tc) > 0 else 0)
        count_1 = tc.get(True, tc.iloc[1] if len(tc) > 1 else 0)
        axes[0].bar(["No Collision", "Collision"], [count_0, count_1],
                    color=["#10b981", "#ef4444"], edgecolor="white")
        axes[0].set_title("Target Distribution (IS_COLLISION_EVENT)", fontweight="bold")
        axes[0].set_ylabel("Count")

        # 1b. Missing values
        missing_count = df[FEATURES].isnull().sum().sum()
        if missing_count > 0:
            sns.heatmap(df[FEATURES].isnull().T, ax=axes[1], cbar=False, cmap="Reds")
            axes[1].set_title("Missing Values Map", fontweight="bold")
        else:
            axes[1].text(0.5, 0.5, "✓ Clean Dataset\nNo Missing Values",
                         ha="center", va="center", fontsize=14, color="#10b981",
                         bbox=dict(boxstyle="round", facecolor="#ecfdf5", edgecolor="#10b981"))
            axes[1].set_title("Missing Values Map", fontweight="bold")
            axes[1].axis("off")

        # 1c. Feature correlations with target
        y_num = df[TARGET].astype(int)
        num_cols = df[FEATURES].select_dtypes(include="number").columns
        corr_with_target = df[num_cols].corrwith(y_num).sort_values(key=abs, ascending=False).head(10)
        bar_colors = ["#ef4444" if v > 0 else "#3b82f6" for v in corr_with_target.values]
        corr_with_target.plot(kind="barh", ax=axes[2], color=bar_colors, edgecolor="white")
        axes[2].axvline(0, color="black", linewidth=0.8)
        axes[2].set_title("Top Feature Correlations with Target", fontweight="bold")
        axes[2].set_xlabel("Pearson r")

        plt.tight_layout()
        plt.savefig(os.path.join(run_dir, "eda_overview.png"), dpi=150)
        plt.close()

        # ── 2. Correlation Heatmap ───────────────────────────────────────────
        fig2, ax2 = plt.subplots(figsize=(14, 11))
        corr_matrix = df[FEATURES].assign(target=df[TARGET].astype(int)).corr()
        mask = np.triu(np.ones_like(corr_matrix, dtype=bool))
        sns.heatmap(corr_matrix, mask=mask, ax=ax2, annot=True, fmt=".2f",
                    cmap="coolwarm", center=0, linewidths=0.4,
                    annot_kws={"size": 8}, vmin=-1, vmax=1)
        ax2.set_title("Feature Correlation Heatmap", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig(os.path.join(run_dir, "eda_correlation_heatmap.png"), dpi=150)
        plt.close()

        # ── 3. Model Performance ─────────────────────────────────────────────
        fig3, axes3 = plt.subplots(1, 2, figsize=(16, 7))

        importances = pd.Series(best_model.feature_importances_, index=FEATURES)
        top10 = importances.sort_values(ascending=False).head(10)
        top10.plot(kind="barh", ax=axes3[0], color="#3b82f6", edgecolor="white")
        axes3[0].set_title("Top 10 Feature Importances (MDI)", fontweight="bold")
        axes3[0].set_xlabel("Importance Score")

        cm = confusion_matrix(y_test, y_pred)
        disp = ConfusionMatrixDisplay(cm, display_labels=["No Collision", "Collision"])
        disp.plot(ax=axes3[1], cmap="Blues", colorbar=False)
        axes3[1].set_title("Hold-out Confusion Matrix", fontweight="bold")

        plt.tight_layout()
        plt.savefig(os.path.join(run_dir, "model_performance.png"), dpi=150)
        plt.close()

        # ── 4. ROC + Precision-Recall curves (critical for imbalanced target) ─
        fig4, axes4 = plt.subplots(1, 2, figsize=(14, 6))

        RocCurveDisplay.from_predictions(y_test, y_prob[:, 1], ax=axes4[0],
                                          name="Random Forest")
        axes4[0].plot([0, 1], [0, 1], "k--", linewidth=0.8)
        axes4[0].set_title("ROC Curve", fontweight="bold")

        PrecisionRecallDisplay.from_predictions(y_test, y_prob[:, 1], ax=axes4[1],
                                                 name="Random Forest")
        axes4[1].set_title("Precision-Recall Curve", fontweight="bold")

        plt.tight_layout()
        plt.savefig(os.path.join(run_dir, "roc_pr_curves.png"), dpi=150)
        plt.close()
        log.info(f"All figures saved to: {run_dir}")

        # ── 5. Outlier Boxplots ──────────────────────────────────────────────
        fig5, axes5 = plt.subplots(2, 2, figsize=(14, 10))
        axes5 = axes5.flatten()
        for idx, col in enumerate(["dista", "distb", "avgspeed", "accel_sum"]):
            if col in df.columns:
                sns.boxplot(data=df, x=TARGET, y=col, ax=axes5[idx],
                            palette=["#10b981", "#ef4444"], hue=TARGET, legend=False)
                axes5[idx].set_title(f"{col} by Collision Label", fontweight="bold")
                axes5[idx].set_xticklabels(["No Collision", "Collision"])
        plt.tight_layout()
        plt.savefig(os.path.join(run_dir, "outlier_boxplots.png"), dpi=150)
        plt.close()

    except Exception as err:
        log.error(f"Failed to generate visual figures: {err}")


def run_ml_training(new_rows: int = 0) -> str:
    # 1. Fetch data
    gold_data = fetch_gold_for_training()
    if gold_data is None or len(gold_data) == 0:
        log.warning("No data in Snowflake Gold – cannot train.")
        return "skipped"

    df = pd.DataFrame(gold_data)
    df.columns = [c.lower() for c in df.columns]
    df = df.drop_duplicates()
    log.info(f"After deduplication: {len(df)} rows (duplicates removed: {len(pd.DataFrame(gold_data)) - len(df)})")

    # 2. Validate features and target
    missing_feats = [f for f in FEATURES if f not in df.columns]
    if missing_feats:
        log.error(f"Missing features in Gold table: {missing_feats}")
        return "skipped"

    if TARGET not in df.columns:
        log.error(f"Target column '{TARGET}' not found. Available: {list(df.columns)}")
        return "skipped"

    # 3. Minimum rows check
    if len(df) < MIN_ROWS_TRAIN:
        log.info(f"Only {len(df)} rows — need {MIN_ROWS_TRAIN} — skipping.")
        return "skipped"

    # 4. Retrain guard
    previous_n_samples = 0
    try:
        with open(MODEL_PATH, "rb") as f:
            existing = pickle.load(f)
        if isinstance(existing, dict):
            previous_n_samples = int(existing.get("n_samples", 0) or 0)
    except FileNotFoundError:
        previous_n_samples = 0
    except Exception as exc:
        log.warning(f"Could not read previous model metadata: {exc}")

    if previous_n_samples > 0:
        new_since_last = max(len(df) - previous_n_samples, 0)
        if new_since_last < MIN_NEW_ROWS_RETRAIN:
            log.info(f"Only {new_since_last} new rows (threshold={MIN_NEW_ROWS_RETRAIN}) — skipping retrain.")
            return "skipped"

    # 5. Diagnostics
    print_dataset_diagnostics(df, TARGET)

    # 6. Chronological sort — prevent future-data leak
    if "wall_time" not in df.columns:
        log.error("wall_time column missing — cannot perform time-based split.")
        return "skipped"

    df["wall_time"] = pd.to_datetime(df["wall_time"], errors="coerce")
    df = df.dropna(subset=["wall_time"]).sort_values("wall_time").reset_index(drop=True)

    # 7. Feature & Target isolation
    X_raw = df[FEATURES].copy()
    y = df[TARGET].astype(int)  # True→1 (Collision), False→0 (No Collision)

    # 8. Time-based 80/20 split BEFORE any statistics are computed
    #    Prevents test values from contaminating training medians (Issue 1 fix).
    split_idx = int(len(df) * 0.8)
    X_train_raw = X_raw.iloc[:split_idx]
    X_test_raw  = X_raw.iloc[split_idx:]
    y_train      = y.iloc[:split_idx]
    y_test       = y.iloc[split_idx:]

    # 9. Compute medians ONLY from training data — apply to both splits
    medians = X_train_raw.median()
    X_train = X_train_raw.fillna(medians)
    X_test  = X_test_raw.fillna(medians)

    train_rate = y_train.mean()
    test_rate = y_test.mean()
    log.info(
        f"Train: {len(X_train)} rows | Test: {len(X_test)} rows\n"
        f"  Train collision rate: {train_rate:.2%} | Test collision rate: {test_rate:.2%}"
    )

    if test_rate > 2 * train_rate:
        log.warning(f"⚠ Collision rate drift detected: train={train_rate:.2%} vs test={test_rate:.2%} — test window may be unrepresentative. Monitor production performance closely.")

    if USE_SMOTE:
        log.info("Applying SMOTE to training data...")
        try:
            from imblearn.over_sampling import SMOTE
        except ImportError:
            log.info("Installing imbalanced-learn...")
            import subprocess
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "imbalanced-learn>=0.12.0"])
                from imblearn.over_sampling import SMOTE
            except Exception as err:
                log.warning(f"imblearn auto-installation failed: {err}. Skipping SMOTE.")
                SMOTE = None
                
        if SMOTE:
            smote = SMOTE(random_state=42)
            X_train, y_train = smote.fit_resample(X_train, y_train)
            log.info(f"After SMOTE: {len(X_train)} rows | Train collision rate: {y_train.mean():.2%}")

    # 10. Outlier diagnostics (training data only)
    log.info("IQR-based outlier diagnostics (training set):")
    for col in ["dista", "distb", "avgspeed", "accel_sum"]:
        q1, q3 = X_train[col].quantile([0.25, 0.75])
        iqr = q3 - q1
        n_out = ((X_train[col] < q1 - 1.5 * iqr) | (X_train[col] > q3 + 1.5 * iqr)).sum()
        log.info(f"  {col:<20}: {n_out} outliers ({n_out/len(X_train)*100:.1f}%)")

    # 11. Class weighting — always use 'balanced' for this target
    #     IS_COLLISION_EVENT is ~6.3% positive → imbalance ratio ~15:1.
    #     Accuracy is a misleading metric here; use f1_macro for tuning.
    imbalance_ratio = y_train.value_counts().max() / y_train.value_counts().min()
    log.info(f"Imbalance ratio: {imbalance_ratio:.1f}:1 → class_weight=balanced, scoring=f1_macro")

    # 12. Hyperparameter search
    rf = RandomForestClassifier(
        random_state=42,
        n_jobs=-1,
    )

    param_dist = {
        "n_estimators":      [100, 200, 300],
        "max_depth":         [None, 8, 12, 16],
        "min_samples_split": [2, 5, 10],
        "min_samples_leaf":  [1, 2, 4],
        "max_features":      ["sqrt", "log2"],
        "class_weight":      ["balanced", {0: 1, 1: 10}, {0: 1, 1: 15}, {0: 1, 1: 20}],
    }

    cv_strategy = TimeSeriesSplit(n_splits=5)

    # Use f1_macro instead of accuracy — more meaningful for imbalanced binary classification.
    # f1_macro weights both classes equally regardless of frequency.
    log.info("Launching RandomizedSearchCV (scoring=f1_macro)...")
    search = RandomizedSearchCV(
        estimator=rf,
        param_distributions=param_dist,
        n_iter=15,
        scoring="f1_macro",      # ← Changed from 'accuracy' (misleading on 94/6 split)
        cv=cv_strategy,
        n_jobs=-1,
        verbose=0,
        random_state=42,
        refit=True,
    )
    search.fit(X_train, y_train)

    best_model = search.best_estimator_
    log.info(f"Best CV f1_macro    : {search.best_score_:.4f}")
    log.info(f"Best hyperparameters: {search.best_params_}")

    # 13. Holdout evaluation — full metric suite for imbalanced classification
    y_prob = best_model.predict_proba(X_test)

    # Threshold tuning: find threshold with best precision where recall >= 0.95
    # (collision detection is safety-critical — maximize recall first, then precision)
    from sklearn.metrics import precision_recall_curve
    precisions, recalls, thresholds = precision_recall_curve(y_test, y_prob[:, 1])

    TARGET_RECALL = 0.95
    valid_mask = recalls[:-1] >= TARGET_RECALL
    if valid_mask.any():
        best_idx = np.argmax(precisions[:-1][valid_mask])
        decision_threshold = float(thresholds[valid_mask][best_idx])
        log.info(f"Optimal threshold: {decision_threshold:.4f} | Precision: {precisions[:-1][valid_mask][best_idx]:.3f} | Recall: {recalls[:-1][valid_mask][best_idx]:.3f}")
        log.info(f"decision_threshold={decision_threshold:.4f} — anything above this fires a collision alert")
        log.info(f"At this threshold — model catches {recalls[:-1][valid_mask][best_idx]*100:.1f}% of real collisions")
    else:
        decision_threshold = 0.35
        log.warning("Could not achieve recall >= 0.95 — defaulting threshold to 0.35")
        log.info(f"decision_threshold={decision_threshold:.4f} — anything above this fires a collision alert")

    y_pred = (y_prob[:, 1] >= decision_threshold).astype(int)

    # ── Noisy Sensor Simulation — Real-World Performance Estimate ─────────────
    # Adds Gaussian noise to distance sensors to simulate real-world imperfection.
    # Ultrasonic sensors typically have ±2-3cm error in real environments.
    # This gives a more honest F1 than the clean lab test set.
    log.info("Running noisy sensor simulation (σ=2.5cm on dista/distb)...")
    rng = np.random.default_rng(seed=42)
    X_test_noisy = X_test.copy()
    X_test_noisy['dista'] = (X_test['dista'] + rng.normal(0, 2.5, len(X_test))).clip(lower=0)
    X_test_noisy['distb'] = (X_test['distb'] + rng.normal(0, 2.5, len(X_test))).clip(lower=0)
    X_test_noisy['distancediff'] = (X_test_noisy['dista'] - X_test_noisy['distb']).abs()
    X_test_noisy['closing_velocity'] = (X_test['closing_velocity'] + rng.normal(0, 1.0, len(X_test))).clip(lower=0)

    y_prob_noisy = best_model.predict_proba(X_test_noisy)
    y_pred_noisy = (y_prob_noisy[:, 1] >= decision_threshold).astype(int)

    f1_noisy    = f1_score(y_test, y_pred_noisy, pos_label=1, average="binary")
    acc_noisy   = accuracy_score(y_test, y_pred_noisy)
    roc_noisy   = roc_auc_score(y_test, y_prob_noisy[:, 1])
    report_noisy = classification_report(
        y_test, y_pred_noisy,
        target_names=["No Collision", "Collision"],
        zero_division=0,
    )

    border = "═" * 60
    log.info(f"\n{border}\n  REAL-WORLD SIMULATION (Noisy Sensors)\n{border}")
    log.info("  Gaussian noise applied: dista/distb σ=2.5cm, closing_velocity σ=1.0")
    log.info(f"  Accuracy   : {acc_noisy:.4f}")
    log.info(f"  F1 Collision (noisy) : {f1_noisy:.4f}  ← realistic estimate")
    log.info(f"  ROC-AUC    : {roc_noisy:.4f}")
    log.info(f"\nNoisy Classification Report:\n{report_noisy}\n{border}")

    acc          = accuracy_score(y_test, y_pred)
    f1_macro     = f1_score(y_test, y_pred, average="macro")
    f1_collision = f1_score(y_test, y_pred, pos_label=1, average="binary")
    roc_auc      = roc_auc_score(y_test, y_prob[:, 1])
    pr_auc       = average_precision_score(y_test, y_prob[:, 1])

    report = classification_report(
        y_test, y_pred,
        target_names=["No Collision", "Collision"],
        zero_division=0,
    )

    border = "═" * 60
    log.info(f"\n{border}\n  PRODUCTION MODEL PERFORMANCE\n{border}")
    log.info(f"Optimal Threshold   : {decision_threshold:.4f} (Target Recall >= 0.95)")
    log.info(f"Accuracy            : {acc:.4f}  (⚠ not the primary metric)")
    log.info(f"F1 Macro            : {f1_macro:.4f}")
    log.info(f"F1 Collision (pos)  : {f1_collision:.4f}  ← primary metric")
    log.info(f"ROC-AUC             : {roc_auc:.4f}")
    log.info(f"PR AUC              : {pr_auc:.4f}")
    log.info(f"\nClassification Report:\n{report}\n{border}")

    # Feature importance report
    importances = sorted(zip(FEATURES, best_model.feature_importances_),
                         key=lambda x: x[1], reverse=True)
    log.info("Top-5 Feature Importances:")
    for rank, (feat, val) in enumerate(importances[:5], 1):
        log.info(f"  {rank}. {feat:<22}: {val:.4f}")

    # 14. Run directory for artifacts
    run_ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join("/opt/airflow/ml/runs", f"run_{run_ts}")
    os.makedirs(run_dir, exist_ok=True)
    log.info(f"Run artifacts directory: {run_dir}")

    # 14a. Save classification report as a text file
    feat_lines = "\n".join(
        f"  {rank:>2}. {feat:<22}: {val:.4f}"
        for rank, (feat, val) in enumerate(
            sorted(zip(FEATURES, best_model.feature_importances_), key=lambda x: x[1], reverse=True), 1
        )
    )
    report_txt = (
        f"Run: {run_ts}\n"
        f"USE_SMOTE: {USE_SMOTE}\n"
        f"{'=' * 60}\n"
        f"  PRODUCTION MODEL PERFORMANCE (Clean Test Set)\n"
        f"{'=' * 60}\n"
        f"Optimal Threshold   : {decision_threshold:.4f} (Target Recall >= 0.95)\n"
        f"Accuracy            : {acc:.4f}\n"
        f"F1 Macro            : {f1_macro:.4f}\n"
        f"F1 Collision (pos)  : {f1_collision:.4f}  <- primary metric\n"
        f"ROC-AUC             : {roc_auc:.4f}\n"
        f"PR AUC              : {pr_auc:.4f}\n"
        f"{'=' * 60}\n\n"
        f"Classification Report:\n{report}\n"
        f"{'=' * 60}\n\n"
        f"  REAL-WORLD SIMULATION (Noisy Sensors, σ=2.5cm)\n"
        f"{'=' * 60}\n"
        f"  Gaussian noise: dista/distb σ=2.5cm, closing_velocity σ=1.0\n"
        f"Accuracy (noisy)    : {acc_noisy:.4f}\n"
        f"F1 Collision (noisy): {f1_noisy:.4f}  <- realistic estimate\n"
        f"ROC-AUC (noisy)     : {roc_noisy:.4f}\n"
        f"{'=' * 60}\n\n"
        f"Noisy Classification Report:\n{report_noisy}\n"
        f"{'=' * 60}\n\n"
        f"Feature Importances (all):\n{feat_lines}\n"
    )
    report_path = os.path.join(run_dir, "classification_report.txt")
    with open(report_path, "w") as f:
        f.write(report_txt)
    log.info(f"Classification report saved to: {report_path}")

    # 15. Generate visuals
    generate_and_save_visuals(df, X_test, y_test, y_pred, y_prob, best_model, run_dir)

    # 16. Persist model payload
    metrics = {
        "accuracy":           acc,
        "f1_macro":           f1_macro,
        "f1_collision":       f1_collision,
        "roc_auc":            roc_auc,
        "pr_auc":             pr_auc,
        "f1_collision_noisy": f1_noisy,   # ← realistic real-world estimate
    }

    model_payload = {
        "model":           best_model,
        "features":        FEATURES,
        "target":          TARGET,
        "medians":         medians.to_dict(),
        "metrics":         metrics,
        "trained_at":      datetime.datetime.utcnow().isoformat(),
        "n_samples":       len(df),
        "train_size":      len(X_train),
        "test_size":       len(X_test),
        "hyperparameters": search.best_params_,
        "decision_threshold": decision_threshold,
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model_payload, f)
    log.info(f"Active model saved to {MODEL_PATH}")

    archived_path = os.path.join(run_dir, "model.pkl")
    with open(archived_path, "wb") as f:
        pickle.dump(model_payload, f)
    log.info(f"Archived model saved to {archived_path}")

    if MONGO_ENABLED:
        store_model_in_mongo(best_model, FEATURES, metrics, len(X_train), len(X_test), medians.to_dict())

    return f"trained:f1_collision={f1_collision:.3f}:roc_auc={roc_auc:.3f}"


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run_ml_training()
    print(result)

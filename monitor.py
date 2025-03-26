import os
import time
import sys

def format_duration(seconds):
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    elif seconds < 86400:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes}m"
    else:
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        return f"{days}d {hours}h"

# --- Parse arguments ---
FOLDER = sys.argv[1]
TARGET = int(sys.argv[2])

# --- Initialize state ---
start_count = len(os.listdir(FOLDER))
start_time = time.time()
last_count = start_count
last_time = start_time

while True:
    current_count = len(os.listdir(FOLDER))

    if current_count > last_count:
        now = time.time()
        newly_generated = current_count - last_count
        time_spent = now - last_time

        total_generated = current_count - start_count
        total_time = now - start_time

        avg_time_per_item = total_time / total_generated if total_generated else 0
        remaining = TARGET - current_count
        eta = avg_time_per_item * remaining

        print(
            f"{current_count}/{TARGET} items | "
            f"Elapsed: {format_duration(total_time)} | "
            f"ETA: {format_duration(eta)} | "
            f"Avg: {avg_time_per_item:.2f}s/item"
        )

        last_count = current_count
        last_time = now

    if current_count >= TARGET:
        break

    time.sleep(0.2)

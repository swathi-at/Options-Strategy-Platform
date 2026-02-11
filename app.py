# python_engine/app.py

from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os
import time
import math
import threading

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BACKEND_PATH = "backend/"
FRONTEND_PATH = "frontend/"

backend_process = None
frontend_process = None


def start_backend():
    print("🚀 Starting Node backend...")
    return subprocess.Popen(
        ["npm", "start"],
        cwd=BACKEND_PATH
    )


def start_frontend():
    print("🌐 Starting React frontend...")
    return subprocess.Popen(
        ["npm", "start"],
        cwd=FRONTEND_PATH
    )


def launch_services():
    global backend_process, frontend_process

    backend_process = start_backend()
    time.sleep(6)   # give backend time to boot

    frontend_process = start_frontend()


# ---- your existing API (unchanged) ----

@app.route('/calculate-strategy', methods=['POST'])
def calculate():
    try:
        data = request.json
        print(f"🐍 Python received request: {data.get('strategy')}")

        spot = data.get('spot', 0)
        strike = data.get('strike', 0)

        result = {
            "status": "Processed by Python",
            "python_calculation": abs(spot - strike) * 0.5,
            "message": "Hello from Flask!"
        }

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def status():
    return "Flask orchestrator running. Frontend: http://localhost:3000"


if __name__ == '__main__':
    print("🐍 Launching full stack...")

    # run Node + React in background thread
    threading.Thread(target=launch_services, daemon=True).start()

    # start Flask normally
    app.run(port=5001, debug=True)
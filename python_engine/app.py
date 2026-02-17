# python_engine/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import socket
import os

app = Flask(__name__)
CORS(app)  # Allow Node.js to connect

# --- GREEKS & CALCULATION LOGIC ---
@app.route('/calculate-strategy', methods=['POST'])
def calculate():
    try:
        data = request.json
        print(f"🐍 Python received request: {data.get('strategy')}")
        
        # Extract data from the request
        spot = data.get('spot', 0)
        strike = data.get('strike', 0)
        
        # --- YOUR CORE CALCULATION LOGIC ---
        # This is where your Greeks or payoff math goes
        result = {
            "status": "Processed by Python",
            "python_calculation": abs(spot - strike) * 0.5, # Placeholder math
            "message": "Hello from Flask!",
            "port_active": True
        }
        
        return jsonify(result)

    except Exception as e:
        print(f"❌ Calculation Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# --- DYNAMIC PORT DISCOVERY LOGIC ---
def find_free_port(start_port):
    """Checks for a free port starting from start_port."""
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            # If connect_ex returns 0, the port is currently in use
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
            port += 1

if __name__ == '__main__':
    # 1. Find an available port starting at 5001
    free_port = find_free_port(5001)
    
    # 2. Communicate the port to Node.js via a hidden file
    # We save it one level up (../) so the backend can read it easily
    try:
        port_file_path = os.path.join("..", ".flask_port")
        with open(port_file_path, "w") as f:
            f.write(str(free_port))
        print(f"📡 Port {free_port} saved to {port_file_path}")
    except Exception as e:
        print(f"⚠️ Warning: Could not write port file. Node.js may not find Python. Error: {e}")

    print(f"🚀 Flask Engine starting on dynamic port: {free_port}")
    
    # 3. Run the app
    # debug=True allows for auto-reloading during development
    app.run(port=free_port, debug=True)
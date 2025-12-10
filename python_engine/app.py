# python_engine/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app)  # Allow Node.js to connect

@app.route('/calculate-strategy', methods=['POST'])
def calculate():
    try:
        data = request.json
        print(f"🐍 Python received request: {data.get('strategy')}")
        
        # --- YOUR PYTHON LOGIC HERE ---
        # Example: Using Python's math capabilities
        spot = data.get('spot', 0)
        strike = data.get('strike', 0)
        
        # Simple simulation example
        result = {
            "status": "Processed by Python",
            "python_calculation": abs(spot - strike) * 0.5, # Dummy math
            "message": "Hello from Flask!"
        }
        
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run on Port 5001 (Node is usually on 5000)
    app.run(port=5001, debug=True)
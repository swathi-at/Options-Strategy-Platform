# python_engine/app.py
import math
from scipy.stats import norm
from flask import Flask, request, jsonify
from flask_cors import CORS
import socket
import os

app = Flask(__name__)
CORS(app)  # Allow Node.js to connect

def bs_price(S, K, T, r, sigma, opt_type):
    if T <= 0.0001: T = 0.0001
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if opt_type == "CE":
        return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    else:
        return K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    
@app.route('/calculate-strategy', methods=['POST'])
def calculate_strategy():
    try:
        data = request.json
        legs = data.get('legs', [])
        spot = float(data.get('spot', 0))
        days_to_expiry = float(data.get('daysToExpiry', 7)) # Default to 7 days if not provided
        vix = float(data.get('vix', 15)) / 100 # Volatility

        T_years = days_to_expiry / 365.0
        r = 0.10 # Risk-free rate

        # Calculate Standard Deviations (1SD = Spot * Volatility * sqrt(Time))
        one_sd_move = spot * vix * math.sqrt(T_years)
        sd_markers = {
            "minus2": spot - (2 * one_sd_move),
            "minus1": spot - one_sd_move,
            "plus1": spot + one_sd_move,
            "plus2": spot + (2 * one_sd_move)
        }

        # Generate a wider range for the chart (±15%)
        step = spot * 0.005 # 0.5% steps
        strikes = [float(leg.get('strike', spot)) for leg in legs]
        if strikes:
            min_strike = min(strikes)
            max_strike = max(strikes)
        else:
            min_strike = spot * 0.95
            max_strike = spot * 1.05

        # Add 2% padding outside the furthest strikes (Sensibull style zoom)
        padding = spot * 0.02 
        chart_min = min_strike - padding
        chart_max = max_strike + padding

        # Generate 100 smooth data points between the min and max
        step = (chart_max - chart_min) / 100
        price_range = [chart_min + (i * step) for i in range(101)]
        
        payoff_curve = []

        for p in price_range:
            total_expiry_payoff = 0
            total_current_payoff = 0

            for leg in legs:
                strike = float(leg.get('strike', 0))
                qty = float(leg.get('qty', 1))
                action = 1 if leg.get('action') == 'BUY' else -1
                opt_type = leg.get('type', leg.get('optionType'))
                entry_price = float(leg.get('price', 0))

                # 1. On Expiry Payoff (Intrinsic Value)
                if opt_type == 'CE':
                    expiry_val = max(0, p - strike)
                else:
                    expiry_val = max(0, strike - p)
                leg_expiry_payoff = (expiry_val - entry_price) * qty * action
                total_expiry_payoff += leg_expiry_payoff

                # 2. T+0 Current Payoff (Black-Scholes Theoretical Value)
                current_val = bs_price(p, strike, T_years, r, vix, opt_type)
                leg_current_payoff = (current_val - entry_price) * qty * action
                total_current_payoff += leg_current_payoff

            # Mock OI data (Replace with real DB/API data if you have it)
            mock_call_oi = max(0, 1000000 - abs(spot - p) * 500) if p > spot else 100000
            mock_put_oi = max(0, 1000000 - abs(spot - p) * 500) if p < spot else 100000

            payoff_curve.append({
                "spot": round(p, 2),
                "payoff": round(total_expiry_payoff, 2),
                "currentPayoff": round(total_current_payoff, 2),
                "callOI": mock_call_oi,
                "putOI": mock_put_oi
            })

        return jsonify({
            "payoffCurve": payoff_curve,
            "sdMarkers": sd_markers,
            "status": "Success"
        })

    except Exception as e:
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
        print(f"[!] Warning: Could not write port file. Node.js may not find Python. Error: {e}")

    print(f"🚀 Flask Engine starting on dynamic port: {free_port}")
    
    # 3. Run the app
    # debug=True allows for auto-reloading during development
    app.run(port=free_port, debug=True)
import os
import uuid
import math
import base64
import re
import io
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
from werkzeug.utils import secure_filename
import torch
import torch.nn as nn
from torchvision import models, transforms
import easyocr
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
transform = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor()])

try:
    model1 = models.vit_b_16(weights=None)
    model1.heads = nn.Sequential(nn.Linear(model1.heads.head.in_features, 2))
    model1.load_state_dict(torch.load("D:/PROJECTS/CNN_MODEL/vit_best_model1.pth", map_location=device))
    model1.to(device).eval()
    model2 = models.vit_b_16(weights=None)
    model2.heads = nn.Sequential(nn.Linear(model2.heads.head.in_features, 4))
    model2.load_state_dict(torch.load("D:/PROJECTS/CNN_MODEL/vit_best_model.pth", map_location=device))
    model2.to(device).eval()
    model3 = models.vit_b_16(weights=None)
    model3.heads = nn.Linear(model3.heads.head.in_features, 6)
    model3.load_state_dict(torch.load("D:/PROJECTS/roads_const_mobile/vit_best_model_20250711_125228.pth", map_location=device))
    model3.to(device).eval()
except Exception as e:
    print(f"Error loading models: {e}")

thresholds = {"road": 0.5, "total_station": 0.5, "tripod": 0.6, "FDD": 0.016, "auto_level": 0.6, "leveling_staff": 0.016}
reader = easyocr.Reader(['en'])
TOLERANCE_METERS = 50
KML_FILE = "D:/PROJECTS/roads_const_mobile/NSK-II 30A.kml"

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = map(math.radians, [lat1, lat2])
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def extract_gps_from_text(text):
    lat_match = re.search(r'Latitude[:\s]*([0-9]+\.[0-9]+)', text, re.IGNORECASE)
    lon_match = re.search(r'Longitude[:\s]*([0-9]+\.[0-9]+)', text, re.IGNORECASE)
    if lat_match and lon_match:
        return float(lat_match.group(1)), float(lon_match.group(1))
    return None, None

def load_kml_coordinates(kml_file):
    coords = []
    try:
        if not os.path.exists(kml_file):
            print(f"Error: KML file not found at {kml_file}")
            return []
        
        tree = ET.parse(str(kml_file))
        root = tree.getroot()
        ns = {'kml': 'http://www.opengis.net/kml/2.2'}
        
        for node in root.findall('.//kml:coordinates', ns):
            if node.text: # Ensure text content exists
                for line in node.text.strip().split():
                    parts = line.strip().split(',')
                    if len(parts) >= 2:
                        try:
                            lon, lat = float(parts[0]), float(parts[1])
                            coords.append((lat, lon))
                        except ValueError:
                            print(f"Warning: Could not parse coordinate line: {line}")
                            continue
    except ET.ParseError as pe:
        print(f"Error parsing KML file {kml_file}: {pe}")
    except Exception as e:
        print(f"Unexpected error loading KML: {e}")
    return coords

def find_nearest_kml_point(lat, lon, coords):
    if not coords:
        return None, None, (None, None)
    
    min_dist = float('inf')
    nearest_idx = -1
    nearest_coord = (None, None)

    for i, (clat, clon) in enumerate(coords):
        dist = haversine(lat, lon, clat, clon)
        if dist < min_dist:
            min_dist = dist
            nearest_idx = i
            nearest_coord = (clat, clon)
            
    if nearest_idx != -1:
        return nearest_idx, min_dist, nearest_coord
    return None, None, (None, None)


def run_full_analysis(image_path):
    outputs = {}
    preds = []
    img_lat = None
    img_lon = None
    text_from_ocr = []

    try:
        img = Image.open(image_path).convert("RGB")
        input_tensor = transform(img).unsqueeze(0).to(device)
        with torch.no_grad():
            o1 = torch.nn.Sigmoid()(model1(input_tensor)[0])
            o2 = torch.nn.Sigmoid()(model2(input_tensor)[0])
            o3 = torch.nn.Sigmoid()(model3(input_tensor)[0])
        
        if model1 and model2 and model3:
            tripod_val = float((o1[1] + o2[2]) / 2)
            FDD_val = float((o2[0] + o3[0]) / 2)
            leveling_staff_val = float(o2[3] + o3[1])
            outputs = {
                "road": float(o1[0]),
                "total_station": float(o2[1]),
                "tripod": tripod_val,
                "FDD": FDD_val,
                "auto_level": float(o3[2]),
                "leveling_staff": leveling_staff_val
            }
            preds = [k for k, v in outputs.items() if v >= thresholds[k]]

            # --- NEW LOGIC: Remove 'leveling_staff' if 'FDD' is present ---
            if "FDD" in preds and "leveling_staff" in preds:
                preds.remove("leveling_staff")
                print("Removed 'leveling_staff' from predictions because 'FDD' was detected.")
            # --- END NEW LOGIC ---

        else:
            print("Models not loaded, skipping prediction.")

        text_from_ocr = reader.readtext(np.array(img), detail=0)
        img_lat, img_lon = extract_gps_from_text("\n".join(text_from_ocr))

    except Exception as e:
        print(f"Error during full analysis of {image_path}: {e}")
        return {}, [], None, None

    return outputs, preds, img_lat, img_lon

coords = load_kml_coordinates(KML_FILE)
if not coords:
    print(f"Warning: No KML coordinates loaded from {KML_FILE}. GPS validation against KML will not work.")

from flask import render_template

@app.route('/', methods=['GET'])
def index():
    return "Flask Backend Running. Please access the React app from your browser/mobile app."


@app.route('/upload', methods=['POST'])
def upload():
    results = []
    for i in range(1, 4):
        img_file = request.files.get(f'image{i}')
        chainage = request.form.get(f'chainage_km_{i}')
        
        client_lat_str = request.form.get(f'lat{i}')
        client_lon_str = request.form.get(f'lon{i}')
        
        client_lat = float(client_lat_str) if client_lat_str else None
        client_lon = float(client_lon_str) if client_lon_str else None

        if img_file:
            filename = f"{uuid.uuid4().hex[:8]}_{secure_filename(img_file.filename)}"
            path = os.path.join(UPLOAD_FOLDER, filename)
            try:
                img_file.save(path)
                outputs, preds, ocr_lat, ocr_lon = run_full_analysis(path)

                final_lat = client_lat if client_lat is not None else ocr_lat
                final_lon = client_lon if client_lon is not None else ocr_lon

                gps_valid = False
                distance = None
                if final_lat is not None and final_lon is not None:
                    _, distance, _ = find_nearest_kml_point(final_lat, final_lon, coords)
                    if distance is not None:
                        gps_valid = distance <= TOLERANCE_METERS
                
                results.append({
                    'filename': filename,
                    'chainage_km': chainage,
                    'labels': preds,
                    'confidences': outputs,
                    'lat': final_lat,
                    'lon': final_lon,
                    'gps_valid': gps_valid,
                    'distance_to_route': round(distance, 2) if distance is not None else None
                })
                print(f"Processed {filename}: {preds}, Client GPS: ({client_lat}, {client_lon}), OCR GPS: ({ocr_lat}, {ocr_lon}), Final GPS: ({final_lat}, {final_lon}), GPS valid: {gps_valid}, Distance: {distance}")
            except Exception as e:
                print(f"Error processing upload for {filename}: {e}")
                results.append({
                    'filename': filename,
                    'chainage_km': chainage,
                    'labels': [],
                    'confidences': {},
                    'lat': client_lat,
                    'lon': client_lon,
                    'gps_valid': False,
                    'distance_to_route': None,
                    'error': str(e)
                })
        else:
            print(f"No image file received for image{i}")

    return jsonify({'results': results})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)

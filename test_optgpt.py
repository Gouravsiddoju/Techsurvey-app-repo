import requests
import json

# Define the LLM API URL and model
LLM_API_URL = "https://api.techoptima.ai/api/generate"
LLM_MODEL = "optgpt:7b"

# Define a simple test prompt
test_prompt = "What is the capital of India?"

# Construct the payload
payload = {
    "model": LLM_MODEL,
    "prompt": test_prompt
}

print(f"Making POST request to: {LLM_API_URL}")
print(f"Payload: {json.dumps(payload, indent=2)}")

try:
    # Make the POST request
    response = requests.post(LLM_API_URL, json=payload)

    # Check if the request was successful
    response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)

    # Parse the JSON response
    result_data = response.json()

    print("\n--- API Response (Full JSON) ---")
    print(json.dumps(result_data, indent=2))

    # Attempt to extract the generated text based on common keys
    generated_text = result_data.get('text') or \
                     result_data.get('generated_text') or \
                     result_data.get('response')

    if generated_text:
        print("\n--- Extracted Generated Text ---")
        print(generated_text)
    else:
        print("\nCould not find generated text using 'text', 'generated_text', or 'response' keys.")
        print("Please examine the full JSON response above to find the correct key for the LLM output.")

except requests.exceptions.HTTPError as http_err:
    print(f"HTTP error occurred: {http_err}")
    print(f"Response content: {response.text}")
except requests.exceptions.ConnectionError as conn_err:
    print(f"Connection error occurred: {conn_err}")
except requests.exceptions.Timeout as timeout_err:
    print(f"Timeout error occurred: {timeout_err}")
except requests.exceptions.RequestException as req_err:
    print(f"An error occurred: {req_err}")
except json.JSONDecodeError as json_err:
    print(f"JSON decode error: {json_err}")
    print(f"Raw response content: {response.text}")


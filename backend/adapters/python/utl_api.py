#!/usr/bin/env python3

import json
import sys
import requests

BASE_URL = "https://utlsolarrms.com/api"
DEVICE_ID = "hbeon_mobile"

session = requests.Session()


def login(email, password):
    payload = {
        "email": email,
        "password": password,
        "device_id": DEVICE_ID,
    }

    headers = {
        "Content-Type": "application/json",
        "X-Device-ID": DEVICE_ID,
    }

    response = session.post(
        f"{BASE_URL}/auth/login",
        json=payload,
        headers=headers,
        timeout=30,
    )

    try:
        data = response.json()
    except ValueError:
        return {
            "success": False,
            "error": (
                f"UTL login returned HTTP {response.status_code} "
                "with a non-JSON response."
            ),
        }

    if response.status_code != 200:
        return {
            "success": False,
            "error": data.get(
                "error",
                f"UTL login failed with HTTP {response.status_code}."
            ),
        }

    return data

if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read())

        email = request.get("email")
        password = request.get("password")

        if not email or not password:
            print(json.dumps({
                "success": False,
                "error": "Email and password are required."
            }))
            sys.exit(1)

        result = login(email, password)
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

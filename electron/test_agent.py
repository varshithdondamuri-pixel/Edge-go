import sys
import json

print("Testing Google Antigravity SDK environment...")

try:
    from google.antigravity import Agent, LocalAgentConfig
    print("SUCCESS: google.antigravity imported successfully!")
except Exception as e:
    print(f"FAILED: Import error: {str(e)}")
    sys.exit(1)

try:
    import pyautogui
    print("SUCCESS: pyautogui imported successfully!")
except Exception as e:
    print(f"WARNING: pyautogui import failed: {str(e)} (Screen control actions will run in emulation mode)")

print("All imports tested.")

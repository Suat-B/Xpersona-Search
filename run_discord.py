import subprocess
import os

print("Opening Discord...")
try:
    # Run the batch file to open Discord
    result = subprocess.run(["open_discord.bat"], shell=True, capture_output=True, text=True)
    print("Discord batch file executed successfully!")
    print("Discord should now be opening on your system.")
except Exception as e:
    print(f"Error opening Discord: {e}")
    print("You can also try opening Discord manually from the Start menu or desktop shortcut.")
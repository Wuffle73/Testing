#!/bin/bash
# start.sh
# Sets up a virtual environment and runs the color haptic app

echo "Setting up..."

# Only create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Using existing virtual environment."
fi

# Activate venv
source venv/bin/activate

# Install dependencies if needed (will skip if already installed)
echo "Installing/Checking dependencies..."
pip install pyobjc-framework-Cocoa pyobjc-framework-Quartz

echo "Running app..."
python3 color_haptic.py

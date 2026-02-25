import time
import sys
import math
import signal

try:
    from Quartz import (
        CGEventCreate,
        CGEventGetLocation,
        CGWindowListCreateImage,
        CGRectMake,
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID,
        kCGWindowImageDefault,
        CGDataProviderCopyData,
        CGImageGetDataProvider,
        CGImageGetWidth,
        CGImageGetHeight,
    )
    from AppKit import NSHapticFeedbackManager, NSHapticFeedbackPatternGeneric, NSHapticFeedbackPerformanceTimeNow
except ImportError:
    print("Error: Required modules not found.")
    print("Please install the dependencies:")
    print("pip install pyobjc-framework-Cocoa pyobjc-framework-Quartz")
    sys.exit(1)

def get_mouse_position():
    # CGEventCreate(None) creates a new event with current mouse state
    event = CGEventCreate(None)
    loc = CGEventGetLocation(event)
    return loc.x, loc.y

def get_pixel_color(x, y):
    # Capture a 1x1 image at the mouse position
    region = CGRectMake(x, y, 1, 1)
    
    # kCGWindowListOptionOnScreenOnly includes all visible windows
    image = CGWindowListCreateImage(
        region,
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID,
        kCGWindowImageDefault
    )

    if image is None:
        return None

    width = CGImageGetWidth(image)
    height = CGImageGetHeight(image)
    
    if width == 0 or height == 0:
        return None

    provider = CGImageGetDataProvider(image)
    data = CGDataProviderCopyData(provider)
    
    # Check if we got data
    if not data:
        return None
        
    # Cast to bytes to be safe
    # In PyObjC, CGDataProviderCopyData usually returns a python bytes-like object
    # If not, we might need bytes(data)
    
    try:
        pixel_data = bytes(data)
    except TypeError:
        return None
        
    if len(pixel_data) >= 3:
        # Assuming BGRA or RGBA. 
        # Since we only care about *change*, order doesn't matter much.
        # But usually on macOS it's BGRA.
        b = pixel_data[0]
        g = pixel_data[1]
        r = pixel_data[2]
        return (r, g, b)
        
    return None

def color_distance(c1, c2):
    if c1 is None or c2 is None:
        return 0
    # Euclidean distance in RGB space
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))

def trigger_haptic():
    try:
        manager = NSHapticFeedbackManager.defaultPerformer()
        if manager:
            manager.performFeedbackPattern_performanceTime_(
                NSHapticFeedbackPatternGeneric,
                NSHapticFeedbackPerformanceTimeNow
            )
    except Exception as e:
        print(f"Failed to trigger haptic feedback: {e}")

def signal_handler(sig, frame):
    print("\nExiting...")
    sys.exit(0)

def main():
    signal.signal(signal.SIGINT, signal_handler)
    
    print("Starting Color Haptic Feedback...")
    print("Move your cursor across different colors to feel haptic feedback.")
    print("Note: Screen Recording permission may be required for color sampling.")
    print("Press Ctrl+C to stop.")
    
    last_color = None
    # Sensitivity threshold. 
    # 0 means any change, but noise might trigger it.
    # 15-20 is usually a good balance to ignore subtle gradients or noise.
    threshold = 15 
    
    consecutive_errors = 0
    
    while True:
        try:
            x, y = get_mouse_position()
            current_color = get_pixel_color(x, y)
            
            if current_color is None:
                consecutive_errors += 1
                if consecutive_errors > 60: # 1 second of errors
                    print("Warning: consistently failing to get pixel color.")
                    print("Check Screen Recording permissions in System Settings.")
                    consecutive_errors = 0 # reset to avoid spamming
            else:
                consecutive_errors = 0
                if last_color is not None:
                    dist = color_distance(last_color, current_color)
                    if dist > threshold:
                        # Color changed significantly
                        trigger_haptic()
                        # specific debug print
                        # print(f"Change: {last_color} -> {current_color} (Dist: {dist:.1f})")
                
                last_color = current_color
            
            time.sleep(0.016) # ~60Hz
            
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()

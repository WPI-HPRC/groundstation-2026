from PIL import Image
import os
import sys

# written by chatgpt on 2/2

# ---------------------------
# Helper: resize with aspect ratio
# ---------------------------
def resize_and_center(img, target_size):
    """Resize img to fit inside target_size while keeping aspect ratio,
    and paste it centered on a transparent canvas of target_size."""
    target_width, target_height = target_size
    img_ratio = img.width / img.height
    target_ratio = target_width / target_height

    if img_ratio > target_ratio:
        # Limited by width
        new_width = target_width
        new_height = round(target_width / img_ratio)
    else:
        # Limited by height
        new_height = target_height
        new_width = round(target_height * img_ratio)

    resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Create transparent canvas
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    offset = ((target_width - new_width) // 2, (target_height - new_height) // 2)
    canvas.paste(resized_img, offset)
    return canvas

# ---------------------------
# Main script
# ---------------------------
if len(sys.argv) != 2:
    print("Usage: python generate_tauri_icons.py path/to/source.png")
    sys.exit(1)

source_path = sys.argv[1]
output_dir = "."
os.makedirs(output_dir, exist_ok=True)

img = Image.open(source_path).convert("RGBA")

# Generate 32x32
resize_and_center(img, (32, 32)).save(os.path.join(output_dir, "32x32.png"))
print("Saved icons/32x32.png")

# Generate 128x128
resize_and_center(img, (128, 128)).save(os.path.join(output_dir, "128x128.png"))
print("Saved icons/128x128.png")

# Generate 128x128@2x (256x256)
resize_and_center(img, (256, 256)).save(os.path.join(output_dir, "128x128@2x.png"))
print("Saved icons/128x128@2x.png")

# Generate ICO (Windows)
ico_sizes = [(32, 32), (128, 128), (256, 256)]
img.save(os.path.join(output_dir, "icon.ico"), sizes=ico_sizes)
print("Saved icons/icon.ico")

# print("\nDone! Your Tauri icons are ready in the 'icons/' folder.")

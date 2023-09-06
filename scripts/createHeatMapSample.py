import subprocess
import click
import numpy as np
import cv2
import os
import tempfile
import random
from tqdm import tqdm

@click.command()
@click.option('--output', '-o', default='heatmap_video.mp4', help='Output video filename.')
@click.option('--width', default=1920, help='Video width.')
@click.option('--height', default=1080, help='Video height.')
@click.option('--fps', default=30, help='Frames per second.')
@click.option('--duration', default=10, help='Duration of the video in seconds.')
@click.option('--square_size', default=256, help='Size of the squares in pixels.')
@click.option('--change_interval', default=1, help='Interval (in seconds) to change squares.')

def generate_heatmap_video(output, width, height, fps, duration, square_size, change_interval):
    # Calculate the number of frames
    num_frames = int(fps * duration)
    frames_per_change = int(fps * change_interval)

    # Create a temporary directory for saving frame images
    temp_dir = tempfile.mkdtemp()
    
    # Initialize a list to store the frame filenames
    frame_filenames = []

    for i in tqdm(range(num_frames), desc='Generating Frames'):
        if i % frames_per_change == 0:
            frame = np.zeros((height, width, 3), dtype=np.uint8)

        # Calculate the gray value for the square

        # Calculate the position of the squares in a tiled pattern
        x_step = square_size // 2
        y_step = square_size // 2

        if i % frames_per_change == 0:
            for y in range(0, height, y_step):
                for x in range(0, width, x_step):
                    gray_value = random.randint(0, 255)
                    # Draw a white square with the changing gray value on the frame
                    frame[y:y+square_size, x:x+square_size, :] = [gray_value, gray_value, gray_value]

        # Generate a unique filename for each frame
        frame_filename = os.path.join(temp_dir, f'frame_{i:04d}.png')
        frame_filenames.append(frame_filename)

        # Save the frame as an image
        cv2.imwrite(frame_filename, frame)

    # Use FFmpeg to create the video from the saved frames
    cmd = [
        'ffmpeg',
        '-framerate', str(fps),
        '-i', os.path.join(temp_dir, 'frame_%04d.png'),  # Input frame filenames
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-y',  # Overwrite output file if it exists
        output  # Output video filename
    ]

    subprocess.run(cmd)

    # Clean up the temporary directory with saved frame images
    for frame_filename in frame_filenames:
        os.remove(frame_filename)
    os.rmdir(temp_dir)

if __name__ == '__main__':
    generate_heatmap_video()

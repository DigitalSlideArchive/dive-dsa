# SAM2 Support in DIVE-DSA

DIVE-DSA now includes support for [SAM2](https://github.com/facebookresearch/segment-anything), enabling advanced mask tracking using vision-language models. This feature can be configured and used by admins and annotators through the standard DIVE interface.

---

## 🔧 Enabling SAM2 Support

SAM2 support is managed through the **DIVE Admin → Config** interface. 

### Model Download and Configuration

Within the configuration interface, admins can enable SAM2 support and download the required model checkpoints directly into the Celery worker container.

- **Default Models**: The default setup downloads **SAM2-Tiny**, **SAM2-Base**, **SAM2-Small**, and **SAM2-Large**.
- **Custom Models**: You may add custom SAM2 models by specifying their configuration and checkpoint URLs.
- **Task Queue**: By default, the SAM2 tasks are dispatched to the **celery** queue. You may configure an alternate queue (e.g., for GPU acceleration) as detailed in the [GPU Accelerated Container](#gpu-accelerated-container) section below.

### Global Mask Tracking Toggle

Also in the configuration, there is a global toggle:

- **Enable SAM2 Mask Tracking**: When activated, this enables a new tracking interface button for all users.

---

## SAM2 Annotation Interface

Once SAM2 is enabled, annotators will see a **`mdi-radar`** button in the annotation interface to initiate SAM2 mask tracking.

### Requirements

To run SAM2 tracking:

- A **track must be selected**
- All **outstanding annotations must be saved**

### Tracking Workflow

When initiated, SAM2 uses the selected track's **bounding box or mask** on the current frame as the seed input. It then generates masks for a range of future frames using the selected model and queue.

---

## SAM2 Settings

Annotators can adjust the following settings when running SAM2 tracking:

### **Model**
Choose from the available (downloaded) SAM2 models.

### **Queue**
Select the Celery queue to use:
- **celery** (default)
- **dive_gpu** (for GPU acceleration, if available)

---

### Advanced Settings

#### **Batch Size**
Sets how many frames to process at a time. Useful to avoid GPU memory limits.
- Options: `10`, `100`, `300`, `500`, `1000`

#### **Notification Percent**
Sets the interval (in %) at which client-side progress updates are sent.
- E.g., `5%` → a notification every 5% completion
- The UI will show the current frame and mask to preview progress

---

## ⚡ GPU Accelerated Container

For faster tracking and model inference, DIVE provides GPU support via a specialized Dockerfile.  This file uses a celery queue called 'dive_gpu'.  That is why in the mask configuration you can set this as the queue.

### Dockerfile Location
```bash
./docker/girder_worker_gpu.Dockerfile

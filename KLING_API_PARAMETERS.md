# Kling AI API - Complete Parameter Reference

Based on official documentation from Kling AI.

## Available Models

```
model_name (optional, defaults to "kling-v1"):
- kling-v1
- kling-v1-5
- kling-v1-6
- kling-v2-master
- kling-v2-1
- kling-v2-1-master
- kling-v2-5-turbo  ← Currently implemented
```

## Core Parameters

### Required Parameters

| Parameter | Type | Description | Notes |
|-----------|------|-------------|-------|
| `image` | string | Main/start frame | URL or Base64 (no `data:` prefix) |

### Optional Parameters

| Parameter | Type | Default | Description | Notes |
|-----------|------|---------|-------------|-------|
| `model_name` | string | `"kling-v1"` | Model to use | See models list above |
| `image_tail` | string | `null` | End frame for interpolation | **Pro + 10s only** |
| `prompt` | string | `""` | Positive prompt | Max 2500 chars |
| `negative_prompt` | string | `""` | Negative prompt | Max 2500 chars |
| `mode` | string | `"std"` | Generation mode | `"std"` or `"pro"` |
| `duration` | string | `"5"` | Video length in seconds | `"5"` or `"10"` |
| `cfg_scale` | float | `0.5` | Prompt adherence [0-1] | **v1.x ONLY** |
| `callback_url` | string | `null` | Webhook for status updates | Optional |
| `external_task_id` | string | `null` | Custom task ID | Must be unique |

## Image Requirements

### Format Support
- Supported: `.jpg`, `.jpeg`, `.png`
- Max size: 10MB
- Min dimensions: 300px × 300px
- Aspect ratio: 1:2.5 to 2.5:1

### Input Methods

**URL Method:**
```json
{
  "image": "https://example.com/image.jpg"
}
```

**Base64 Method:**
```json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAAAAUA..."
}
```

⚠️ **Important:** When using Base64, do NOT include prefixes like `data:image/png;base64,`

❌ **Wrong:**
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...
```

✅ **Correct:**
```
iVBORw0KGgoAAAANSUhEUgAAAAUA...
```

## Mode Options

### Standard Mode (`std`)
- **Speed:** Faster generation
- **Quality:** Good
- **Duration:** 5s or 10s
- **Frames:** Single image only
- **Cost:** More economical

### Pro Mode (`pro`)
- **Speed:** Slower generation
- **Quality:** Higher
- **Duration:** 5s or 10s
- **Frames:** Single image OR start+end (10s only)
- **Cost:** Higher

## Frame Modes

### Single Image Mode
```json
{
  "image": "https://example.com/image.jpg"
}
```
- ✅ Works with: Standard (5s, 10s), Pro (5s, 10s)
- Use case: Generate video from one reference image

### Start + End Frame Mode
```json
{
  "image": "https://example.com/start.jpg",
  "image_tail": "https://example.com/end.jpg"
}
```
- ✅ **ONLY** works with: **Pro mode + 10 seconds**
- ❌ Does NOT work with: Standard mode, Pro + 5s
- Use case: Frame interpolation between two keyframes

## Model Version Differences

### v1.x Models (kling-v1, kling-v1-5, kling-v1-6)
- ✅ Supports `cfg_scale` parameter
- ✅ Supports motion brushes (dynamic_masks, static_mask)
- ✅ Supports camera control

### v2.x Models (kling-v2-master, kling-v2-1, kling-v2-1-master, kling-v2-5-turbo)
- ❌ Does NOT support `cfg_scale` parameter
- ✅ Higher quality output
- ✅ Faster generation
- ⚠️ Motion brushes and camera control support varies by model

## Advanced Features (Not Currently Implemented)

### Motion Brush
- **Static Brush** (`static_mask`): Define static areas
- **Dynamic Brush** (`dynamic_masks`): Define motion trajectories
- Requires mask images matching input aspect ratio
- Up to 6 dynamic mask groups
- Each with trajectory coordinates (max 77 points for 5s)

### Camera Control
- **Predefined movements:** `simple`, `down_back`, `forward_up`, `right_turn_forward`, `left_turn_forward`
- **Custom movements:** horizontal, vertical, pan, tilt, roll, zoom
- Value range: [-10, 10] for each axis

## Parameter Constraints

### Mutually Exclusive
Cannot use together:
- `image` + `image_tail` + `dynamic_masks`
- `image` + `image_tail` + `static_mask`
- `image` + `image_tail` + `camera_control`

### Requirements
- At least one of `image` or `image_tail` must be provided
- If using `image_tail`, must be Pro mode + 10s duration
- Mask images must match input image aspect ratio

## Response Format

### Success Response
```json
{
  "code": 0,
  "message": "SUCCEED",
  "request_id": "...",
  "data": {
    "task_id": "829611643369439283",
    "task_status": "submitted",
    "created_at": 1765823347996,
    "updated_at": 1765823347996
  }
}
```

### Error Response
```json
{
  "code": 1201,
  "message": "model/mode/duration(kling-v2-5-turbo/std/5) is not supported with image_tail",
  "request_id": "..."
}
```

## Task Status Values

| Status | Description |
|--------|-------------|
| `submitted` | Task received and queued |
| `processing` | Video generation in progress |
| `succeed` | Video generation complete |
| `failed` | Video generation failed |

## Current Implementation

Our implementation uses:
- ✅ `model_name`: `"kling-v2-5-turbo"`
- ✅ `image` / `image_tail`: Based on user selection
- ✅ `prompt`: User-provided
- ✅ `negative_prompt`: Empty string (default)
- ✅ `mode`: User selection (Standard or Pro)
- ✅ `duration`: User selection (5 or 10)
- ❌ `cfg_scale`: NOT sent (v2.x incompatible)
- ❌ Motion brushes: Not implemented
- ❌ Camera control: Not implemented

## References

- Official API Endpoint: `https://api-singapore.klingai.com/v1/videos/image2video`
- Documentation: https://app.klingai.com/global/dev/document-api/apiReference/model/imageToVideo
- Authentication: JWT (access key + secret key) or API key


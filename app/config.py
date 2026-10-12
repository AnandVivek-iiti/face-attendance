from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    insightface_model: str = "buffalo_l"
    insightface_root: str = "~/.insightface"
    device: str = "auto"
    detection_size: int = 1280
    detection_threshold: float = 0.5
    max_concurrent_inferences: int = 1

    high_confidence_threshold: float = 0.55
    review_threshold: float = 0.40
    min_match_margin: float = 0.05

    max_image_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 50_000_000
    max_images_per_request: int = 5
    max_students_per_request: int = 2000
    api_key: str = ""

    image_min_short_side: int = 320
    image_recommended_short_side: int = 600
    image_blur_unusable: float = 15.0
    image_blur_poor: float = 100.0
    image_brightness_unusable_low: float = 0.08
    image_brightness_poor_low: float = 0.20
    image_brightness_poor_high: float = 0.85
    image_brightness_unusable_high: float = 0.96

    face_reject_min_side: int = 20
    face_high_min_side: int = 40
    face_target_side: int = 80
    face_reject_min_sharpness: float = 0.10
    face_high_min_sharpness: float = 0.25
    face_target_sharpness: float = 0.45
    face_reject_brightness_low: float = 0.06
    face_reject_brightness_high: float = 0.96
    face_high_min_frontalness: float = 0.30
    face_high_min_quality: float = 0.50

    reference_min_face_side: int = 96
    reference_min_face_sharpness: float = 0.30
    reference_min_detection_score: float = 0.60
    reference_min_frontalness: float = 0.50
    reference_secondary_face_area_ratio: float = 0.15
    reference_pad_fallback: bool = True

    save_face_crops: bool = False
    face_crop_dir: str = "storage/face-crops"

    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_thresholds(self) -> "Settings":
        if not 0.0 <= self.review_threshold <= self.high_confidence_threshold <= 1.0:
            raise ValueError("require 0 <= REVIEW_THRESHOLD <= HIGH_CONFIDENCE_THRESHOLD <= 1")
        if self.device not in {"auto", "cpu", "cuda"}:
            raise ValueError("DEVICE must be auto, cpu or cuda")
        return self

    @property
    def crop_path(self) -> Path:
        return Path(self.face_crop_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()

from dataclasses import dataclass

IDENTITY = "identity"
QUALITY = "quality"


@dataclass(frozen=True)
class Reason:
    code: str
    gate: str
    message: str

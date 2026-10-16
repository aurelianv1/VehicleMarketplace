from pydantic import BaseModel, ConfigDict


class CarImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    url_medium: str | None = None
    url_thumb: str | None = None
    position: int
    is_main: bool


class CarImageUpdate(BaseModel):
    """Setare poză principală și/sau schimbare poziție în galerie."""

    is_main: bool | None = None
    position: int | None = None

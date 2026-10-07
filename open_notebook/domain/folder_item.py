"""Content that can be organized into one flat collection."""

from open_notebook.domain.base import ObjectModel


class FolderItem(ObjectModel):
    folder_id: str | None = None

    def _prepare_save_data(self) -> dict:
        # Assignment belongs exclusively to the validated folder service. A
        # stale content/profile save must never undo a move or folder deletion.
        data = super()._prepare_save_data()
        data.pop("folder_id", None)
        return data

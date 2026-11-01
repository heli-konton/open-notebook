"""Pure parser turning podcast_creator log lines into a 0-100 progress value.

podcast_creator exposes no progress callback, but its nodes log stable
milestones (see podcast_creator/nodes.py). ``PodcastProgressTracker`` consumes
those messages and reports the new integer percent whenever it changes.

Stages: outline done -> 5, transcript segments 5..35, audio clips 35..95.
100 is never produced here: the caller sets it after the final save.
"""

import re
from typing import Optional

OUTLINE_DONE = 5
TRANSCRIPT_END = 35
AUDIO_END = 95

_OUTLINE_RE = re.compile(r"Generated outline with (\d+) segments")
_TRANSCRIPT_RE = re.compile(r"Generating transcript for segment (\d+)/(\d+)")
_ROUTING_RE = re.compile(r"Routing (\d+) dialogue segments")
_CLIP_RE = re.compile(r"Generated audio clip")


class PodcastProgressTracker:
    """Stateful, I/O-free progress calculator."""

    def __init__(self) -> None:
        self.percent: int = 0
        self._total_clips: Optional[int] = None
        self._clips_done: int = 0

    def feed(self, message: str) -> Optional[int]:
        """Process one log message.

        Returns the new integer percent if it changed (progress never goes
        backwards), otherwise None.
        """
        value = self._compute(message)
        if value is None:
            return None
        value = max(0, min(AUDIO_END, int(value)))
        if value <= self.percent:
            return None
        self.percent = value
        return value

    def _compute(self, message: str) -> Optional[float]:
        if _OUTLINE_RE.search(message):
            return OUTLINE_DONE
        match = _TRANSCRIPT_RE.search(message)
        if match:
            index, total = int(match.group(1)), int(match.group(2))
            if total <= 0:
                return None
            span = TRANSCRIPT_END - OUTLINE_DONE
            return OUTLINE_DONE + span * (index - 1) / total
        match = _ROUTING_RE.search(message)
        if match:
            self._total_clips = int(match.group(1))
            self._clips_done = 0
            return TRANSCRIPT_END
        if _CLIP_RE.search(message):
            self._clips_done += 1
            if not self._total_clips:
                return None
            span = AUDIO_END - TRANSCRIPT_END
            return TRANSCRIPT_END + span * self._clips_done / self._total_clips
        return None

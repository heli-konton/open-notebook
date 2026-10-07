# nova_notes: folders and playback

nova_notes is built on Open Notebook. Existing generation, source import,
notebook editing and archive workflows remain available.

## Organize your library

Notebooks and podcast episodes have separate folder collections. In either
library, choose **New folder**, enter a name, and save. Select a folder to show
its items, or select **All** / **Unfiled**. Counts represent actual loaded items;
notebook archive/search controls still apply independently.

Use an item's **Move to folder** selector to assign it to one folder. Choose
**Unfiled** to remove its assignment. Folders cannot contain other folders.
Select a folder to rename or delete it. Deletion asks for confirmation and
moves its items to Unfiled; it does not delete notebooks, sources or audio.

## Play generated audio

Select Play on an episode with available audio. The shared player stays open
while navigating between dashboard pages. Pause retains the position; Play
resumes it. Rewind moves back 15 seconds without going below zero. The timeline
seeks within the actual audio duration. Stop pauses and resets to the beginning.
Close releases the current audio. Only one episode can play at a time.

Audio uses the authenticated backend endpoint and downloads before playback.
Unavailable audio or playback failures show an error; no sample/synthesized
audio is substituted. Your browser may require a further tap on Play after the
initial download because of its autoplay policy.

## Responsive navigation

Desktop uses a sidebar and folder panel. Mobile uses a single-column library,
folder choices, bottom navigation, a full-navigation menu and large player
controls. The interface respects reduced-motion and safe-area settings. New
installs use graphite/slate dark surfaces with blue highlights; a previously
saved theme preference is honored. All new controls are localized in the
fourteen supported locales.

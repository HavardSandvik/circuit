# Circuit

Interval timer for bodyweight circuits, with beeps, spoken cues and vibration. Single static page, works offline, installable to the home screen.

The default workout is 7 exercises at 40 seconds on, 20 seconds off. **Edit** changes work, rest and get-ready times, the number of rounds, and the exercise list (add, remove, reorder from a pool of 14). Settings are saved in the browser.

## Exercise demos

Each station has an animated figure, drawn live in the browser by `mannequin.js` from a small motion file in `moves/`. Motion files are keyframes of body position, torso lean, and hand and foot targets; elbows and knees are solved each frame. The motion files are intended to move into a separate open library once the format settles.

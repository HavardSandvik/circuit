# Seven Minute Circuit

Interval timer for a 7-station calisthenics circuit: 40 seconds on, 20 seconds off, with beeps, spoken cues and vibration. Single static page, works offline, installable to the home screen.

Stations: jumping jacks, pull-ups, bodyweight squats, mountain climbers, reverse lunges, plank shoulder taps, burpees.

## Exercise demos

Each station has an animated figure, drawn live in the browser by `mannequin.js` from a small motion file in `moves/`. Motion files are keyframes of body position, torso lean, and hand and foot targets; elbows and knees are solved each frame. The motion files are intended to move into a separate open library once the format settles.

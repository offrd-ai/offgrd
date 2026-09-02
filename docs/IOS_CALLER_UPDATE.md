# How to pick up a new OFFGRD build on iOS (do not clear site data)

The caller chip **v353** (top bar, next to Snap N) is the only proof the refresh took.
If it still says **v352** or older, you are on the old build. Do not open a caller on v352.

## There is a service worker

`offgrd-sw.js` caches the gameday shell so airplane mode still boots.
Cache name is `offgrd-gameday-v353`. A pin changes that name. On activate the
worker `skipWaiting`s, `clients.claim`s, and deletes the previous `offgrd-gameday-*`
cache. `offgrd-sw.js` and `sw-kill.json` are never cached (`updateViaCache: "none"`).

Online fetches are network-first. Offline falls back to the pinned cache.

## Home-screen app ≠ Safari tab

iOS gives Add-to-Home-Screen its **own** service worker and cache. Updating a
Safari tab does nothing to the icon on the home screen. Force-quitting the
home-screen app and reopening it is what re-runs `register` + `reg.update()`
in the surface you actually call from.

## Path that does NOT wipe Friday's game

Do this on the **same icon you use Friday night**. Stay on wifi.

1. Open the home-screen OFFGRD / gameday app (not a Safari tab).
2. Swipe it away (force quit).
3. Tap the icon again. Wait until the caller header paints.
4. Read the chip: it must say **v353**.
5. If it still says v352, stay in that app, pull down to refresh once, force-quit, reopen. Do not go to Settings.

## Do not

- Settings → Safari → Clear History and Website Data. That deletes `localStorage` (the caller event ledger).
- Settings → Safari → Advanced → Website Data → delete getoffrd.com. Same wipe.
- Update a Safari tab and assume the home-screen app moved.

Clearing site data is how you lose an un-exported game. The chip exists so you never have to guess, and never have to clear.

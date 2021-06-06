# google-home-notifier-offline
This is a fork of the google-home-notifier-library:
<a href="https://github.com/nabbl/google-home-notifier">google-home-notifier Fork</a>

**important:**<br>
**offline** refers to the announcement text being played from a local folder, but you still need an internet connection for casting to your google device, this i due to the google casting architecture.

**version 1.1.0:**
fix: google tts doesn't support speed anymore. Have to choose value 1 for normal speed or less than 1 for slow.
!Important: a cache folder has to be setup.

**version 1.0.2:**
fix: url to play from localserver on linux host

**version 1.0.1:**
fix: url to play from localserver

**version 1.0.0:**
reading speed is now supported with the function "setSpeechSpeed"

**version 0.0.6:**
**fix:** when casting to multiple devices, restoring devices inital volume level didn't work, thus all the devices remained at the announcement volume level.

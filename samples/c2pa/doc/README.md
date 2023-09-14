# DASH.js Content Authenticity Initiative Player & Plugin

This folder contains the examples of how to integrate C2PA ([Coalition for Content Provenance and Authenticity](https://c2pa.org)) verification capabilities into your DASH player and display **Content Credentials** while streaming the video. This prototype leverages DASH capabilities for streaming in combination with C2PA capabilities for content verification. It also provides a reference UI implementation to surface C2PA information leveraging [Video.js](https://videojs.com/).

## About Content Authenticity Initiative
TBD

## Key Features

This reference implementation showcases:

1. How to integrate C2PA verification capabilities into an existing DASH player via: (1) **native** integration of C2PA capabilities into the DASH player, or (2) via a **plugin-style** implementation on top of an existing standard DASH player. This allows to verify the content provenance of the video during the streaming session;
2. How to surface C2PA information to the end-user via a reference UI implementation, composed of two main elements: (1) a **color-coded timeline** that shows the validation status of the streamed video, and (2) a **C2PA** menu showing detailed information extracted from the C2PA manifest. Note: UI implementation is independent of how C2PA verification is carried out (native vs plugin).

### Supported file formats

* MPEG DASH Fragmented MP4
* Monolithic MP4

## Sample Videos

| Type 										          | Sample 1            | Sample 2 | Sample 3|
|-------------------------------------------------|---------------------|----------|---------|
|w/o C2PA manifest embedded                       | [mpd]() / [mp4]()   |          |         |
|w/ valid C2PA manifest                           | [mpd]() / [mp4]()   |          |         |
|w/ invalid C2PA manifest                         | [mpd]() / [mp4]()   |          |         |
|w/ valid C2PA manifest and tampered fragments    | [mpd]()             |          |         |

## Usage

The video streaming session is logically divided between three entities:

1. A DASH session that is responsible for streaming the video content;
2. A C2PA session that is responsible for verifying the content provenance of the video;
3. A UI session that is responsible for surfacing C2PA information to the end-user.

We show in the following how to instantiate your player to support the above mentioned functionalities. Full examples are available at [c2pa-demo-native](../native-dash/c2pa-demo-native.html) for the native DASH implementation and [c2pa-demo-plugin](../plugin-dash/c2pa-demo-plugin.html) for the plugin-style implementation.

### Common JavaScript and CSS Inclusions

Independently of the c2pa validation implementation, the following JavaScript and CSS files are required to instantiate the player:

First, include the dash.js library:

```html
<!-- dash-js -->
<script src="../../../dist/dash.all.debug.js"></script>
```

In the native implementation case, the dash.js library with c2pa validation can be downloaded [here](). In the plugin-style implementation case, this is the standard dash.js library.

Next, include the video.js library and the c2pa-player library responsible for the UI component of the player:

```html    
<!-- video-js -->
<script src="https://vjs.zencdn.net/8.3.0/video.min.js"></script>
<link href="https://vjs.zencdn.net/8.3.0/video-js.css" rel="stylesheet" />

<!-- c2pa player -->
<link href="../c2pa-player.css" rel="stylesheet" />
<script class="code" src="../c2pa-player.js"></script>
```

### DASH-native Implementation

In the native implementation case, the c2pa validation is integrated into the DASH player. Once the HTML element is loaded, the `init()` function is called to instatiate the player. The full examples is available in the following code snippet:

```javascript
/* c2pa player instance */
var c2paPlayer;
        
function init() {
    var video,
        dashPlayer,
        url = "url-to-video-manifest.mpd";

    video = document.querySelector("#videoPlayer");
    /* Create dashjs player with c2pa verification enabled */
    /* Responsible for streaming video and executing c2pa validation */
    dashPlayer = dashjs.MediaPlayer().create();
    dashPlayer.initialize(video, url, true, NaN, true);

    /* Create videojs player and c2pa player */
    /* Responsible for UI and playback control */
    var videoJsPlayer = videojs('videoPlayer', {fluid: true});
    c2paPlayer = new C2PAPlayer(videoJsPlayer, video);
    c2paPlayer.initialize();

    dashPlayer.on(dashjs.MediaPlayer.events["PLAYBACK_TIME_UPDATED"], playbackUpdate);
}

function playbackUpdate(e) {
    c2paPlayer.playbackUpdate(e.c2pa_status);
}

document.addEventListener('DOMContentLoaded', function () {
    init();
});
```

The `c2paPlayer` instance is the bridge between the DASH player and the UI component. We first retrieve the video element:

```javascript
var video = document.querySelector("#videoPlayer");
```

which can be created separately in the html file as follows:

```html
<video id="videoPlayer" class="video-js" controls="true"></video>
```

Second, we create the DASH player with c2pa validation enabled:

```javascript
var dashPlayer = dashjs.MediaPlayer().create();
dashPlayer.initialize(video, url, true, NaN, true);
```

Next, we create the video.js player and the c2pa player, responsible for the UI component:

```javascript
var videoJsPlayer = videojs('videoPlayer', {fluid: true});
c2paPlayer = new C2PAPlayer(videoJsPlayer, video);
c2paPlayer.initialize();
```

Finally, we register a callback function to be called every time the playback time is updated:

```javascript
dashPlayer.on(dashjs.MediaPlayer.events["PLAYBACK_TIME_UPDATED"], playbackUpdate);
```

This callback contains the C2PA information that are going to be passed to the UI component using the `playbackUpdate` function:

```javascript
function playbackUpdate(e) {
    c2paPlayer.playbackUpdate(e.c2pa_status);
}
```

`e` is the event object trigger by the DASH player, which has been expanded to contain the C2PA information. The `c2pa_status` field contains the C2PA information that are going to be passed to the UI component to be displayed. The `playbackUpdate` function is part of the `c2paPlayer` puiblic API and allows to update the UI with the information contained in `c2pa_status`.

### DASH Plugin Implementation

In the natiplugin-style implementation case, the c2pa validation happens on top of the standard DASH player. Nevertheless, the instantion of the player is similar to the native implementation case, and is available in the following code snippet:

```javascript
import {c2pa_init} from './c2pa-plugin.js';

/* c2pa player instance */
var c2paPlayer;

function init() {
    var video,
        dashPlayer,
        url = "url-to-video-manifest.mpd";

    video = document.querySelector("#videoPlayer");
    /* Create dashjs player */
    /* Responsible for streaming video */
    dashPlayer = dashjs.MediaPlayer().create();

    /* Create videojs player and c2pa player */
    /* Responsible for UI and playback control */
    var videoJsPlayer = videojs('videoPlayer', {fluid: true});
    c2paPlayer = new C2PAPlayer(videoJsPlayer, video);
    c2paPlayer.initialize();

    /* Create c2pa plugin*/
    /* Responsible for executing c2pa validation */
    c2pa_init(dashPlayer, function (e) {
        /* Update c2pa player with current c2pa status update */
        c2paPlayer.playbackUpdate(e.c2pa_status);
    }).then(() => {
        dashPlayer.initialize(video, url, true);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    init();
});
```

We first important the library responsible for the c2pa validation:

```javascript
import {c2pa_init} from './c2pa-plugin.js';
```

Next, we create the DASH player (in this case, a standard DASH player):

```javascript
var dashPlayer = dashjs.MediaPlayer().create();
```

Similarly to the native implementation case, we create the video.js player and the c2pa player, responsible for the UI component:

```javascript
var videoJsPlayer = videojs('videoPlayer', {fluid: true});
c2paPlayer = new C2PAPlayer(videoJsPlayer, video);
c2paPlayer.initialize();
```

Finally, we initialize the c2pa plugin and call the `playbackUpdate` method from the `c2paPlayer` instance to update the UI with the information contained in the `c2pa_status` field:

```javascript
c2pa_init(dashPlayer, function (e) {
    /* Update c2pa player with current c2pa status update */
    c2paPlayer.playbackUpdate(e.c2pa_status);
}).then(() => {
    dashPlayer.initialize(video, url, true);
});
```

`e` is the event object trigger by the c2pa-library, which contains the C2PA information. Please note that native and plugin-style implementations share the same structure of the `c2pa_status` field.

### C2PA UI Player on Top of Video.js

While developers are free to implement their own UI component, we provide a reference implementation based on top of [Video.js](https://videojs.com/). The UI component is available in the [c2pa-player.js](../c2pa-player.js) and [c2pa-player.css](../c2pa-player.css) files.

## License

TBC
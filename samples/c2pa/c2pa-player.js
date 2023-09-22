/**
    * @module c2pa-player
    * @param {object=} videoJsPlayer - videojs reference
    * @param {object=} videoHtml - video html element
    */

var C2PAMenu = function() {
    
    //Items to show in the c2pa menu
    const c2paMenuItems = {
        'SIG_ISSUER': 'Signature Issuer',
        'CLAIM_GENERATOR': 'Claim Generator',
        'VALIDATION_STATUS': 'Current Validation Status',
        'ALERT': 'Alert'
    };

    const c2paMenuValueToKeyMap = {};
    for (const key in c2paMenuItems) {
        c2paMenuValueToKeyMap[c2paMenuItems[key]] = key;
    }
    
    //Delimiter to separate the menu item name from its value
    const c2paMenuDelimiter = ' : ';

    //Alert message to be shown when the c2pa validation has failed
    const c2paAlertPrefix = "The region(s) between ";
    const c2paAlertSuffix = " may have been comprimised";

    //Create an alert message if the c2pa validation has failed
    let c2paAlertMessage = function (compromisedRegions) {
        if (compromisedRegions.length > 0) {
            return c2paAlertPrefix + compromisedRegions.join(', ') + c2paAlertSuffix;
        }
        else {
            return null;
        }
    }

    return {

        c2paMenuItems: function () {
            return c2paMenuItems;
        },

        c2paMenuDelimiter: function () {
            return c2paMenuDelimiter;
        },

        c2paMenuValueToKeyMap: function (itemValue) {
            return c2paMenuValueToKeyMap[itemValue];
        },

        //Functions to access the c2pa menu items from the c2pa manifest
        c2paItem: function (itemName, c2paStatus, compromisedRegions = []) {

            const verificationStatus = c2paStatus.verified;
            let manifest = null;
            try {
                manifest = c2paStatus.details.video.manifest;
            } catch (error) {
                console.error('[C2PA] Manifest does not exist');
            }

            if (manifest != null && manifest['manifestStore'] != null) {
                if (itemName == "SIG_ISSUER") {
                    return manifest['manifestStore']['activeManifest']['signatureInfo']['issuer'];
                }
                if (itemName == "CLAIM_GENERATOR") {
                    return manifest['manifestStore']['activeManifest']['claimGenerator'];
                }
            }
            if (itemName == "VALIDATION_STATUS") {
                switch (verificationStatus) {
                    case true:
                        return "Passed";
                    case false:
                        return "Failed";
                    default:
                        return "Unknown";
                }
            }
            if (itemName == "ALERT") {
                return c2paAlertMessage(compromisedRegions);
            }
    
            return null;
        },
    };
}

var C2PAPlayer = function (videoJsPlayer, videoHtml, isMonolithic = false) {

    //Video.js player instance
    let videoPlayer = videoJsPlayer;
    const videoElement = videoHtml;

    //C2PA menu instance
    let c2paMenuInstance = new C2PAMenu();

    //c2pa menu and control bar elements
    let c2paMenu;
    let c2paControlBar;

    //An overlay to be shown to the user in case the initial manifest validation fails
    //Used to warn the user the content cannot be trusted
    let frictionOverlay;
    let isManifestInvalid = false; //TODO: placeholder, this should be set based on info from the c2pa validation

    //List of segments to be added to the progress bar, showing the c2pa validation status
    let progressSegments = [];

    let seeking = false;
    let playbackStarted = false;
    let lastPlaybackTime = 0.0;

    //A playback update above this threshold is considered a seek
    const minSeekTime = 0.5;

    //Adjust height of c2pa menu with respect to the whole player
    const c2paMenuHeightOffset = 30;

    let initializeC2PAControlBar = function () {

        //The playback progress bar from video-js is extended to support c2pa validation
        const LoadProgressBar = videojs.getComponent("LoadProgressBar");
            
        //The update event is overriden to support c2pa validation
        class C2PALoadProgressBar extends LoadProgressBar {
            update(e) {}
        }

        videojs.registerComponent('C2PALoadProgressBar', C2PALoadProgressBar);
        videoPlayer.controlBar.progressControl.seekBar.addChild('C2PALoadProgressBar');

        //The progress timeline is managed directly, so we set this to transparent
        const c2paTimeline = videoPlayer.controlBar.progressControl.seekBar.getChild("C2PALoadProgressBar");
        c2paTimeline.el().style.width = '100%';
        c2paTimeline.el().style.backgroundColor = 'transparent';

    };

    let initializeC2PAMenu = function () {

        const MenuButton = videojs.getComponent("MenuButton");
        const MenuItem = videojs.getComponent("MenuItem");

        class C2PAMenuButton extends MenuButton {
            createItems() {
                // Must return an array of `MenuItem`s
                // Options passed in `addChild` are available at `this.options_`
                return this.options_.myItems.map((i) => {
                    let item = new MenuItem(this.player_, { label: i.name});
                    item.handleClick = function () {
                        //No click behavior implemented for now
                        return;
                    };
                    return item;
                });
            }
  
            buildCSSClass() {
                return `vjs-chapters-button`; //Add icon to menu
            }
        }

        // Register as a component, so it can be added
        videojs.registerComponent("C2PAMenuButton", C2PAMenuButton);

        //Add items to c2pa menu
        let c2pAItems = [];
        const menuItems = c2paMenuInstance.c2paMenuItems();
        Object.keys(menuItems).forEach(key => {
            const value = menuItems[key];
            c2pAItems.push({ name: value + c2paMenuInstance.c2paMenuDelimiter() + "Not Available" });
        });

        // Use `addChild` to add an instance of the new component, with options
        videoPlayer.controlBar.addChild("C2PAMenuButton", {
            controlText: "Content Credentials",
            title: "Content Credentials",
            myItems: c2pAItems,
        }, 0); //0 indicates that the menu button will be the first item in the control bar
    };

    let initializeFrictionOverlay = function () {
        //Create the friction overlay container
        frictionOverlay = document.createElement("div");
        frictionOverlay.className = "friction-overlay";

        //Create the warnimg message to be shown to the user when initial manifest validation fails
        let warnMessage = document.createElement("p");
        warnMessage.textContent = "The information in this video's Content Credentials is no longer trustworthy and the video's history cannot be confirmed.";

        //Create "Watch Anyway" button
        let watchAnywayBtn = document.createElement("button");
        watchAnywayBtn.textContent = "Watch Anyway";
        watchAnywayBtn.classList.add("friction-button");

        //Append the elements to the friction overlay container
        frictionOverlay.appendChild(warnMessage);
        frictionOverlay.appendChild(watchAnywayBtn);

        //Hide overlay by default
        frictionOverlay.style.display = "none";

        //Append the overlay container to the player's container
        let playerContainer = videoPlayer.el();
        playerContainer.appendChild(frictionOverlay);

        //The user can click the "Watch Anyway" button to continue watching the video
        watchAnywayBtn.addEventListener("click", function () {
            //Close overlay and resume playback
            frictionOverlay.style.display = "none";
            playbackStarted = true;
            videoPlayer.play();
        });
    };

    //Display the friction overlay if the initial manifest validation fails
    let displayFrictionOverlay = function () {
        if (!playbackStarted) {
            videoPlayer.pause();
            frictionOverlay.style.display = "block";
        }
    };

    let handleOnSeeked = function (time) {

        //A seek event is triggered at the beginning of the playbacj, so we ignore it
        if (playbackStarted && time > 0 && progressSegments.length > 0) {
            handleSeekC2PATimeline(time);
        }

        seeking = false;
    };

    let handleOnSeeking = function (time) {

        console.log("[C2PA] Player seeking: ", time);
        seeking = true;

        if (time === 0) {
            console.log("[C2PA] Player resetting");
            progressSegments.forEach(segment => {
                segment.remove();
            });
                  
            progressSegments = [];
            lastPlaybackTime = 0.0;
        }
    };

    //Format time from seconds to mm:ss
    let formatTime = function(seconds) {

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(remainingSeconds).padStart(2, '0');
        
        return `${formattedMinutes}:${formattedSeconds}`;
    };

    //Adjust c2pa menu size with respect to the player size
    let adjustC2PAMenu = function () {

        const menuContent = c2paMenu.el().querySelector(".vjs-menu-button-popup .vjs-menu .vjs-menu-content");

        const playerWidth = videoElement.offsetWidth;
        const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

        menuContent.style.width = `${playerWidth}px`;
        menuContent.style.height = `${playerHeight}px`;
    };

    //Create a new progress segment to be added to the c2pa progress bar
    let createTimelineSegment = function (segmentStartTime, segmentEndTime, verificationStatus) {

        const segment = document.createElement('div');
        segment.className = 'seekbar-play-c2pa';
        //Width is initially set to zero, and increased directly as playback progresses
        segment.style.width = '0%';
        segment.dataset.startTime = segmentStartTime;
        segment.dataset.endTime = segmentEndTime;
        segment.dataset.verificationStatus = verificationStatus;

        if (isManifestInvalid) {
            segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-failed').trim();
        }
        else {
            if (verificationStatus == "true") { //c2pa validation passed
                segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-passed').trim();
            }
            else if (verificationStatus == "false") { //c2pa validation failed
                segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-failed').trim();
            }
            else { //c2pa validation not available or unkwown
                segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-unknown').trim();
            }    
        }

        return segment;
    };

    let handleSeekC2PATimeline = function (seekTime) {
        
        console.log("[C2PA] Handle seek to: ", seekTime);

        //Remove segments that are not active anymore
        progressSegments = progressSegments.filter(segment => {
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);
            let isSegmentActive = seekTime >= segmentEndTime || (seekTime < segmentEndTime && seekTime >= segmentStartTime);
  
            if (!isSegmentActive) {
                segment.remove(); // Remove the segment element from the DOM
            }
  
            return isSegmentActive;
          });

        const lastSegment = progressSegments[progressSegments.length - 1];
        if (lastSegment.dataset.endTime > seekTime) {
            //Adjust end time of last segment if seek time is lower than the previous end time
            lastSegment.dataset.endTime = seekTime;
        }
        else {
            let segment;
            //In the monolithic case, the entire video has already been validated, so when seeking, the validation status
            //is known for the entire video. Therefore, we create a new segment with the same validation status as the last segment
            if (isMonolithic) {
                segment = createTimelineSegment(lastSegment.dataset.endTime, seekTime, lastSegment.dataset.verificationStatus);
            }
            //In the streaming case, if there was a jump ahead in the timeline, we do not know the validation status
            //Therefore, we create an unkwown segment and add it to the timeline
            else {
                segment = createTimelineSegment(lastSegment.dataset.endTime, seekTime, 'unknown');
            }

            c2paControlBar.el().appendChild(segment);
            progressSegments.push(segment);
        }

        updateC2PATimeline(seekTime);
    };

    let handleC2PAValidation = function (verificationStatusBool, currentTime) {

        //Convert verification status to string since this value is saved in the segment dataset
        //If variable is not a boolean, we set the status to unknown
        let verificationStatus = 'unknown';
        if (typeof verificationStatusBool === 'boolean')
            verificationStatus = verificationStatusBool.toString();

        //If no segments have been added to the timeline, or if the validation status has changed with respect to the last segment
        //We add a new segment to the timeline
        if (progressSegments.length === 0 || progressSegments[progressSegments.length - 1].dataset.verificationStatus != verificationStatus) {

            console.log("[C2PA] New validation status: ", verificationStatus);

            //Update the end time of the last segment
            if (progressSegments.length > 0) {
                const lastSegment = progressSegments[progressSegments.length - 1];
                lastSegment.dataset.endTime = currentTime;
            }

            //Add new segment to the timeline
            const segment = createTimelineSegment(currentTime, currentTime, verificationStatus);
            c2paControlBar.el().appendChild(segment);
            progressSegments.push(segment);
        }
    };

    let updateC2PATimeline = function (currentTime) {

        console.log("[C2PA] Updating play bar");

        let numSegments = progressSegments.length;
        const lastSegment = progressSegments[numSegments - 1];
        lastSegment.dataset.endTime = currentTime;

        //Update the color of the progress bar tooltip to match with the that of the last segment
        const progressControl = videoPlayer.el().querySelector('.vjs-progress-control');
        progressControl.style.color = lastSegment.style.backgroundColor;
        const playProgressControl = videoPlayer.el().querySelector('.vjs-play-progress');
        playProgressControl.style.backgroundColor = lastSegment.style.backgroundColor;

        //Update the width of the segments
        progressSegments.forEach(segment => {
            
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);

            let segmentProgressPercentage = 0;
            if (currentTime >= segmentStartTime && currentTime <= segmentEndTime) { //Current time is within the segment extremes
                segmentProgressPercentage = (currentTime / videoPlayer.duration()) * 100;
            } else if (currentTime >= segmentEndTime) {
                segmentProgressPercentage = (segmentEndTime / videoPlayer.duration()) * 100; //Current time is after the segment end time
            }

            console.log("[C2PA] Segment progress percentage: ", segmentProgressPercentage);
            segment.style.width = segmentProgressPercentage + '%';

            //Set the z-index so that segments appear in order of creation
            segment.style.zIndex = numSegments;
            numSegments--;
            console.log("[C2PA] ----");
        });
    };

    //Get time regions that have failed the c2pa validation
    let getCompromisedRegions = function () {

        let compromisedRegions = [];

        if (isMonolithic) {
            //In the monolithic case, the validation status is known for the entire video. If the validation has failed,
            //the whole video is considered compromised
            if (progressSegments.length > 0 && progressSegments[0].dataset.verificationStatus === "false") {
                const startTime = 0.0;
                const endTime = videoPlayer.duration();
                compromisedRegions.push(formatTime(startTime) + "-" + formatTime(endTime));
            }
        }
        else {
            //In the streaming case, we get the compromised regions from the segments that have failed the c2pa validation
            progressSegments.forEach(segment => {
                if (segment.dataset.verificationStatus === "false") {
                    const startTime = parseFloat(segment.dataset.startTime);
                    const endTime = parseFloat(segment.dataset.endTime);
                    compromisedRegions.push(formatTime(startTime) + "-" + formatTime(endTime));
                }
            });
        }

        return compromisedRegions;
    };

    //Update the c2pa menu items with the values from the c2pa manifest
    let updateC2PAMenu = function (c2paStatus) {

        //Get all the items in the c2pa menu
        const c2paItems = c2paMenu.el().querySelectorAll(".vjs-menu-item");
        const compromisedRegions = getCompromisedRegions();

        c2paItems.forEach(c2paItem => {

            //Menu items are organized as key/name + value, separated by a delimiter
            const c2paItemText = c2paItem.innerText;
            const c2paItemName = c2paItemText.split(c2paMenuInstance.c2paMenuDelimiter())[0];

            //Based on the plain name of the menu item, we retrieve the key from the c2paMenuInstance
            //And based on that key, we get the corresponding value from the c2pa manifest
            const c2paItemKey = c2paMenuInstance.c2paMenuValueToKeyMap(c2paItemName)
            const c2paItemValue = c2paMenuInstance.c2paItem(c2paItemKey, c2paStatus, compromisedRegions);
            console.log("[C2PA] Menu item: ", c2paItemName, c2paItemKey, c2paItemValue)

            if (c2paItemValue != null) { //If the value is not null, we update the menu item text and show it
                c2paItem.innerText = c2paItemName + c2paMenuInstance.c2paMenuDelimiter() + c2paItemValue;
                c2paItem.style.display = "block";
            }
            else { //If the value is null, we hide the menu item
                c2paItem.style.display = "none";
            }
        });
    };

    //Hide the c2pa menu
    let hideC2PAMenu = function () {
        c2paMenu.hide();
    };

    //Public API
    return {

        initialize: function () {
            console.log("[C2PA] Initializing C2PAPlayer");

            //Initialize c2pa timeline and menu
            initializeC2PAControlBar();
            initializeC2PAMenu();
            //Initialize friction overlay to be displayed if initial manifest validation fails
            initializeFrictionOverlay();

            //Get c2pa menu and control bar elements from html
            c2paMenu = videoPlayer.controlBar.getChild("C2PAMenuButton");
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild("C2PALoadProgressBar");

            videoPlayer.on('play', function() {
                if (isManifestInvalid && !playbackStarted) {
                    console.log("[C2PA] Manifest invalid, displaying friction overlay");
                    displayFrictionOverlay();
                }
                else {
                    playbackStarted = true;
                }
            });

            videoPlayer.on('seeked', function() {
                handleOnSeeked(videoPlayer.currentTime());
            });

            videoPlayer.on('seeking', function() {
                handleOnSeeking(videoPlayer.currentTime());
            });

            //Resize the c2pa menu
            //TODO: This is a workaround to resize the menu, as the menu is not resized when the player is resized
            setInterval(function() {
                adjustC2PAMenu();
            }, 500);
            adjustC2PAMenu();

            console.log("[C2PA] Initialization complete");
        },

        //Playback update with updates on c2pa manifest and validation
        playbackUpdate: function (c2paStatus) {

            const currentTime = videoPlayer.currentTime();
            
            //We only update the c2pa timeline if the playback is not seeking and the playback time has increased
            if (!seeking && (currentTime >= lastPlaybackTime) && (currentTime - lastPlaybackTime < minSeekTime)) {

                console.log("[C2PA] Validation update: ", lastPlaybackTime, currentTime);

                //Creates new c2pa progress segment to be added to the progress bar
                handleC2PAValidation(c2paStatus.verified, currentTime);
                //Update c2pa progress timeline
                updateC2PATimeline(currentTime);
                //Update c2pa menu based on manifest
                updateC2PAMenu(c2paStatus);
            }

            lastPlaybackTime = currentTime;
        }

    };
};
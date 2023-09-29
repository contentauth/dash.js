/**
 * @module c2pa-player
 * @param {object=} videoJsPlayer - videojs reference
 * @param {object=} videoHtml - video html element
 */

import { C2PAMenu } from './C2PaMenu/C2paMenu.js';
import { initializeC2PAControlBar } from './C2paControlBar/C2paControlBarFunctions.js';
import { displayFrictionOverlay, initializeFrictionOverlay } from './C2paFrictionModal/C2paFrictionModalFunctions.js';
import { adjustC2PAMenu, initializeC2PAMenu } from './C2paMenu/C2paMenuFunctions.js';

export var C2PAPlayer = function (
    videoJsPlayer,
    videoHtml,
    isMonolithic = false
) {
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


    let handleOnSeeked = function (time) {
        //A seek event is triggered at the beginning of the playbacj, so we ignore it
        if (playbackStarted && time > 0 && progressSegments.length > 0) {
            handleSeekC2PATimeline(time);
        }

        seeking = false;
    };

    let handleOnSeeking = function (time) {
        console.log('[C2PA] Player seeking: ', time);
        seeking = true;

        if (time === 0) {
            console.log('[C2PA] Player resetting');
            progressSegments.forEach((segment) => {
                segment.remove();
            });

            progressSegments = [];
            lastPlaybackTime = 0.0;
        }
    };

    //Format time from seconds to mm:ss
    let formatTime = function (seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);

        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(remainingSeconds).padStart(2, '0');

        return `${formattedMinutes}:${formattedSeconds}`;
    };


    //Create a new progress segment to be added to the c2pa progress bar
    let createTimelineSegment = function (
        segmentStartTime,
        segmentEndTime,
        verificationStatus
    ) {
        const segment = document.createElement('div');
        segment.className = 'seekbar-play-c2pa';
        //Width is initially set to zero, and increased directly as playback progresses
        segment.style.width = '0%';
        segment.dataset.startTime = segmentStartTime;
        segment.dataset.endTime = segmentEndTime;
        segment.dataset.verificationStatus = verificationStatus;

        if (isManifestInvalid) {
            segment.style.backgroundColor = getComputedStyle(
                document.documentElement
            )
                .getPropertyValue('--c2pa-failed')
                .trim();
        } else {
            if (verificationStatus == 'true') {
                //c2pa validation passed
                segment.style.backgroundColor = getComputedStyle(
                    document.documentElement
                )
                    .getPropertyValue('--c2pa-passed')
                    .trim();
            } else if (verificationStatus == 'false') {
                //c2pa validation failed
                segment.style.backgroundColor = getComputedStyle(
                    document.documentElement
                )
                    .getPropertyValue('--c2pa-failed')
                    .trim();
            } else {
                //c2pa validation not available or unkwown
                segment.style.backgroundColor = getComputedStyle(
                    document.documentElement
                )
                    .getPropertyValue('--c2pa-unknown')
                    .trim();
            }
        }

        return segment;
    };

    let handleSeekC2PATimeline = function (seekTime) {
        console.log('[C2PA] Handle seek to: ', seekTime);

        //Remove segments that are not active anymore
        progressSegments = progressSegments.filter((segment) => {
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);
            let isSegmentActive =
                seekTime >= segmentEndTime ||
                (seekTime < segmentEndTime && seekTime >= segmentStartTime);

            if (!isSegmentActive) {
                segment.remove(); // Remove the segment element from the DOM
            }

            return isSegmentActive;
        });

        const lastSegment = progressSegments[progressSegments.length - 1];
        if (lastSegment.dataset.endTime > seekTime) {
            //Adjust end time of last segment if seek time is lower than the previous end time
            lastSegment.dataset.endTime = seekTime;
        } else {
            let segment;
            //In the monolithic case, the entire video has already been validated, so when seeking, the validation status
            //is known for the entire video. Therefore, we create a new segment with the same validation status as the last segment
            if (isMonolithic) {
                segment = createTimelineSegment(
                    lastSegment.dataset.endTime,
                    seekTime,
                    lastSegment.dataset.verificationStatus
                );
            }
            //In the streaming case, if there was a jump ahead in the timeline, we do not know the validation status
            //Therefore, we create an unkwown segment and add it to the timeline
            else {
                segment = createTimelineSegment(
                    lastSegment.dataset.endTime,
                    seekTime,
                    'unknown'
                );
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
        if (
            progressSegments.length === 0 ||
            progressSegments[progressSegments.length - 1].dataset
                .verificationStatus != verificationStatus
        ) {
            console.log('[C2PA] New validation status: ', verificationStatus);

            //Update the end time of the last segment
            if (progressSegments.length > 0) {
                const lastSegment =
                    progressSegments[progressSegments.length - 1];
                lastSegment.dataset.endTime = currentTime;
            }

            //Add new segment to the timeline
            const segment = createTimelineSegment(
                currentTime,
                currentTime,
                verificationStatus
            );
            c2paControlBar.el().appendChild(segment);
            progressSegments.push(segment);
        }
    };

    let updateC2PATimeline = function (currentTime) {
        console.log('[C2PA] Updating play bar');

        let numSegments = progressSegments.length;
        const lastSegment = progressSegments[numSegments - 1];
        lastSegment.dataset.endTime = currentTime;

        //Update the color of the progress bar tooltip to match with the that of the last segment
        const progressControl = videoPlayer
            .el()
            .querySelector('.vjs-progress-control');
        progressControl.style.color = lastSegment.style.backgroundColor;
        const playProgressControl = videoPlayer
            .el()
            .querySelector('.vjs-play-progress');
        playProgressControl.style.backgroundColor =
            lastSegment.style.backgroundColor;

        //Update the width of the segments
        progressSegments.forEach((segment) => {
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);

            let segmentProgressPercentage = 0;
            if (
                currentTime >= segmentStartTime &&
                currentTime <= segmentEndTime
            ) {
                //Current time is within the segment extremes
                segmentProgressPercentage =
                    (currentTime / videoPlayer.duration()) * 100;
            } else if (currentTime >= segmentEndTime) {
                segmentProgressPercentage =
                    (segmentEndTime / videoPlayer.duration()) * 100; //Current time is after the segment end time
            }

            console.log(
                '[C2PA] Segment progress percentage: ',
                segmentProgressPercentage
            );
            segment.style.width = segmentProgressPercentage + '%';

            //Set the z-index so that segments appear in order of creation
            segment.style.zIndex = numSegments;
            numSegments--;
            console.log('[C2PA] ----');
        });
    };

    //Get time regions that have failed the c2pa validation
    let getCompromisedRegions = function () {
        let compromisedRegions = [];

        if (isMonolithic) {
            //In the monolithic case, the validation status is known for the entire video. If the validation has failed,
            //the whole video is considered compromised
            if (
                progressSegments.length > 0 &&
                progressSegments[0].dataset.verificationStatus === 'false'
            ) {
                const startTime = 0.0;
                const endTime = videoPlayer.duration();
                compromisedRegions.push(
                    formatTime(startTime) + '-' + formatTime(endTime)
                );
            }
        } else {
            //In the streaming case, we get the compromised regions from the segments that have failed the c2pa validation
            progressSegments.forEach((segment) => {
                if (segment.dataset.verificationStatus === 'false') {
                    const startTime = parseFloat(segment.dataset.startTime);
                    const endTime = parseFloat(segment.dataset.endTime);
                    compromisedRegions.push(
                        formatTime(startTime) + '-' + formatTime(endTime)
                    );
                }
            });
        }

        return compromisedRegions;
    };

    //Update the c2pa menu items with the values from the c2pa manifest
    let updateC2PAMenu = function (c2paStatus) {
        //Get all the items in the c2pa menu
        const c2paItems = c2paMenu.el().querySelectorAll('.vjs-menu-item');
        const compromisedRegions = getCompromisedRegions();

        c2paItems.forEach((c2paItem) => {
            //Menu items are organized as key/name + value, separated by a delimiter
            const c2paItemText = c2paItem.innerText;
            const c2paItemName = c2paItemText.split(
                c2paMenuInstance.c2paMenuDelimiter()
            )[0];

            //Based on the plain name of the menu item, we retrieve the key from the c2paMenuInstance
            //And based on that key, we get the corresponding value from the c2pa manifest
            const c2paItemKey =
                c2paMenuInstance.c2paMenuValueToKeyMap(c2paItemName);
            const c2paItemValue = c2paMenuInstance.c2paItem(
                c2paItemKey,
                c2paStatus,
                compromisedRegions
            );
            console.log(
                '[C2PA] Menu item: ',
                c2paItemName,
                c2paItemKey,
                c2paItemValue
            );

            if (c2paItemValue != null) {
                //If the value is not null, we update the menu item text and show it
                c2paItem.innerText =
                    c2paItemName +
                    c2paMenuInstance.c2paMenuDelimiter() +
                    c2paItemValue;
                c2paItem.style.display = 'block';
            } else {
                //If the value is null, we hide the menu item
                c2paItem.style.display = 'none';
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
            console.log('[C2PA] Initializing C2PAPlayer');

            //Initialize c2pa timeline and menu
            initializeC2PAControlBar(videoPlayer);
            initializeC2PAMenu(c2paMenuInstance, videoPlayer);
            //Initialize friction overlay to be displayed if initial manifest validation fails
            initializeFrictionOverlay(frictionOverlay , videoPlayer , playbackStarted);

            //Get c2pa menu and control bar elements from html
            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar =
                videoPlayer.controlBar.progressControl.seekBar.getChild(
                    'C2PALoadProgressBar'
                );

            videoPlayer.on('play', function () {
                if (isManifestInvalid && !playbackStarted) {
                    console.log(
                        '[C2PA] Manifest invalid, displaying friction overlay'
                    );
                    displayFrictionOverlay(playbackStarted , videoPlayer , frictionOverlay);
                } else {
                    playbackStarted = true;
                }
            });

            videoPlayer.on('seeked', function () {
                handleOnSeeked(videoPlayer.currentTime());
            });

            videoPlayer.on('seeking', function () {
                handleOnSeeking(videoPlayer.currentTime());
            });

            //Resize the c2pa menu
            //TODO: This is a workaround to resize the menu, as the menu is not resized when the player is resized
            setInterval(function () {
                adjustC2PAMenu(c2paMenu , videoElement , c2paMenuHeightOffset);
            }, 500);
            adjustC2PAMenu(c2paMenu , videoElement , c2paMenuHeightOffset);

            console.log('[C2PA] Initialization complete');
        },

        //Playback update with updates on c2pa manifest and validation
        playbackUpdate: function (c2paStatus) {
            const currentTime = videoPlayer.currentTime();

            //We only update the c2pa timeline if the playback is not seeking and the playback time has increased
            if (
                !seeking &&
                currentTime >= lastPlaybackTime &&
                currentTime - lastPlaybackTime < minSeekTime
            ) {
                console.log(
                    '[C2PA] Validation update: ',
                    lastPlaybackTime,
                    currentTime
                );

                //Creates new c2pa progress segment to be added to the progress bar
                handleC2PAValidation(c2paStatus.verified, currentTime);
                //Update c2pa progress timeline
                updateC2PATimeline(currentTime);
                //Update c2pa menu based on manifest
                updateC2PAMenu(c2paStatus);
            }

            lastPlaybackTime = currentTime;
        },
    };
};

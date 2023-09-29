/**
    * @module c2pa-player
    * @param {object=} videoJsPlayer - videojs reference
    * @param {object=} videoHtml - video html element
    */
   
import { formatTime, handleC2PAValidation, handleOnSeeked, handleOnSeeking, updateC2PATimeline } from '.././C2paPlayer/C2paTimeline/TimelineFunctions.js';
import { C2PAMenu } from '../C2paPlayer/C2PaMenu/C2paMenu.js';
import { initializeC2PAControlBar } from './C2PaControlBar/ControlBarFunctions.js';
import { adjustC2PAMenu, initializeC2PAMenu, updateC2PAMenu } from './C2PaMenu/MenuFunctions.js';
import { displayFrictionOverlay, initializeFrictionOverlay } from './C2paFriction/FrictionFunctions.js';

export var C2PAPlayer = function (videoJsPlayer, videoHtml, isMonolithic = false) {

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

    //Get time regions that have failed the c2pa validation
    let getCompromisedRegions = function () {

        let compromisedRegions = [];

        if (isMonolithic) {
        //In the monolithic case, the validation status is known for the entire video. If the validation has failed,
        //the whole video is considered compromised
            if (progressSegments.length > 0 && progressSegments[0].dataset.verificationStatus === 'false') {
                const startTime = 0.0;
                const endTime = videoPlayer.duration();
                compromisedRegions.push(formatTime(startTime) + '-' + formatTime(endTime));
            }
        }
        else {
        //In the streaming case, we get the compromised regions from the segments that have failed the c2pa validation
            progressSegments.forEach(segment => {
                if (segment.dataset.verificationStatus === 'false') {
                    const startTime = parseFloat(segment.dataset.startTime);
                    const endTime = parseFloat(segment.dataset.endTime);
                    compromisedRegions.push(formatTime(startTime) + '-' + formatTime(endTime));
                }
            });
        }

        return compromisedRegions;
    };

   

    //Public API
    return {

        initialize: function () {
            console.log('[C2PA] Initializing C2PAPlayer');

            //Initialize c2pa timeline and menu
            initializeC2PAControlBar(videoPlayer);
            initializeC2PAMenu(c2paMenuInstance, videoPlayer);
            //Initialize friction overlay to be displayed if initial manifest validation fails
            initializeFrictionOverlay(frictionOverlay, videoPlayer, playbackStarted);

            //Get c2pa menu and control bar elements from html
            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');

            videoPlayer.on('play', function() {
                if (isManifestInvalid && !playbackStarted) {
                    console.log('[C2PA] Manifest invalid, displaying friction overlay');
                    displayFrictionOverlay(playbackStarted , videoPlayer, frictionOverlay);
                }
                else {
                    playbackStarted = true;
                }
            });

            videoPlayer.on('seeked', function() {
                handleOnSeeked(videoPlayer.currentTime() , playbackStarted , progressSegments , seeking , isMonolithic , isManifestInvalid, c2paControlBar, videoPlayer);
            });

            videoPlayer.on('seeking', function() {
                handleOnSeeking(videoPlayer.currentTime(), seeking , progressSegments, lastPlaybackTime);
            });

            //Resize the c2pa menu
            //TODO: This is a workaround to resize the menu, as the menu is not resized when the player is resized
            setInterval(function() {
                adjustC2PAMenu(videoElement , c2paMenuHeightOffset, c2paMenu);
            }, 500);
            adjustC2PAMenu(videoElement , c2paMenuHeightOffset, c2paMenu);

            console.log('[C2PA] Initialization complete');
        },

        //Playback update with updates on c2pa manifest and validation
        playbackUpdate: function (c2paStatus) {

            const currentTime = videoPlayer.currentTime();
            
            //We only update the c2pa timeline if the playback is not seeking and the playback time has increased
            if (!seeking && (currentTime >= lastPlaybackTime) && (currentTime - lastPlaybackTime < minSeekTime)) {

                console.log('[C2PA] Validation update: ', lastPlaybackTime, currentTime);

                //Creates new c2pa progress segment to be added to the progress bar
                handleC2PAValidation(c2paStatus.verified, currentTime, progressSegments, c2paControlBar);
                //Update c2pa progress timeline
                updateC2PATimeline(currentTime, progressSegments, videoPlayer);
                //Update c2pa menu based on manifest
                updateC2PAMenu(c2paStatus, c2paMenu , c2paMenuInstance, getCompromisedRegions);
            }

            lastPlaybackTime = currentTime;
        }

    };
};
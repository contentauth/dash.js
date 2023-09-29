export let handleOnSeeked = function (time , playbackStarted , progressSegments , seeking ,isMonolithic , isManifestInvalid, c2paControlBar, videoPlayer) {

    console.log('processSegments' , progressSegments)
    //A seek event is triggered at the beginning of the playbacj, so we ignore it
    if (playbackStarted && time > 0 && progressSegments.length > 0) {
        handleSeekC2PATimeline(time, progressSegments , isMonolithic , isManifestInvalid , c2paControlBar , videoPlayer);
    }

    seeking = false;
};

export let handleOnSeeking = function (time , seeking , progressSegments, lastPlaybackTime) {

    console.log('[C2PA] Player seeking: ', time);
    seeking = true;

    if (time === 0) {
        console.log('[C2PA] Player resetting');
        progressSegments.forEach(segment => {
            segment.remove();
        });
              
        progressSegments = [];
        lastPlaybackTime = 0.0;
    }
};

//Format time from seconds to mm:ss
export let formatTime = function(seconds) {

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    
    return `${formattedMinutes}:${formattedSeconds}`;
};



//Create a new progress segment to be added to the c2pa progress bar
export let createTimelineSegment = function (segmentStartTime, segmentEndTime, verificationStatus, isManifestInvalid) {

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
        if (verificationStatus == 'true') { //c2pa validation passed
            segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-passed').trim();
        }
        else if (verificationStatus == 'false') { //c2pa validation failed
            segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-failed').trim();
        }
        else { //c2pa validation not available or unkwown
            segment.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--c2pa-unknown').trim();
        }    
    }

    return segment;
};

export let handleSeekC2PATimeline = function (seekTime , progressSegments , isMonolithic , isManifestInvalid , c2paControlBar , videoPlayer) {
    
    console.log('[C2PA] Handle seek to: ', seekTime);

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
            segment = createTimelineSegment(lastSegment.dataset.endTime, seekTime, lastSegment.dataset.verificationStatus , isManifestInvalid);
        }
        //In the streaming case, if there was a jump ahead in the timeline, we do not know the validation status
        //Therefore, we create an unkwown segment and add it to the timeline
        else {
            segment = createTimelineSegment(lastSegment.dataset.endTime, seekTime, 'unknown');
        }

        c2paControlBar.el().appendChild(segment);
        progressSegments.push(segment);
    }

    updateC2PATimeline(seekTime , progressSegments , videoPlayer);
};

export let handleC2PAValidation = function (verificationStatusBool, currentTime, progressSegments, c2paControlBar) {

    //Convert verification status to string since this value is saved in the segment dataset
    //If variable is not a boolean, we set the status to unknown
    let verificationStatus = 'unknown';
    if (typeof verificationStatusBool === 'boolean')
        verificationStatus = verificationStatusBool.toString();

    //If no segments have been added to the timeline, or if the validation status has changed with respect to the last segment
    //We add a new segment to the timeline
    if (progressSegments.length === 0 || progressSegments[progressSegments.length - 1].dataset.verificationStatus != verificationStatus) {

        console.log('[C2PA] New validation status: ', verificationStatus);

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

export let updateC2PATimeline = function (currentTime , progressSegments, videoPlayer) {

    console.log('[C2PA] Updating play bar');

    console.log('progrss' , progressSegments)
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

        console.log('[C2PA] Segment progress percentage: ', segmentProgressPercentage);
        segment.style.width = segmentProgressPercentage + '%';

        //Set the z-index so that segments appear in order of creation
        segment.style.zIndex = numSegments;
        numSegments--;
        console.log('[C2PA] ----');
    });
};


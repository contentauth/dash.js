import { createC2pa } from 'https://cdn.jsdelivr.net/npm/c2pa@0.18.0-fmp4-alpha.1/+esm'

async function c2pa_init(player, onPlaybackTimeUpdated) {

    const C2paSupportedMediaTypes = ['video'];

    /* Create C2PA instance */
    const c2pa = await createC2pa({
        wasmSrc: 'https://cdn.jsdelivr.net/npm/c2pa@0.18.0-fmp4-alpha.1/dist/assets/wasm/toolkit_bg.wasm',
        workerSrc: 'https://cdn.jsdelivr.net/npm/c2pa@0.18.0-fmp4-alpha.1/dist/c2pa.worker.js',
    });

    /* Extract manifest from video. Since this is a monolithic file,
    we can extract manifest once */
    let manifest = null;
    try {
        manifest = await c2pa.read(player.src);
        console.log('[C2PA] Extracted manifest: ', manifest);
    } catch (err) {
        console.error('[C2PA] Error, manifest could not be extracted:', err);
    }

    /* Create update event based on manifest content, 
    to be passed to c2pa player UI */
    let createUpdateEvent = function() {
        let ret = {
            'verified': true,
            'details': {}
        };

        let detail = {
            'verified': false,
            'manifest': null,
            'error': null,
        }

        if (manifest == null || manifest.manifestStore == null){
            detail['error'] = 'null manifestStore';
        }

        if (manifest['manifestStore']['validationStatus']?.length === 0) {
            detail['verified'] = true;
            detail['manifest'] = manifest;
        } else {
            detail['error'] = 'error code' + manifest.manifestStore.validationStatus[0].code;
        }

        ret['details'][C2paSupportedMediaTypes] = detail;
        ret['verified'] = ret['verified'] && detail['verified'];

        return ret;
    };

    let updateEvent = createUpdateEvent();

    /* Update c2pa UI during timeupdate events */
    player.addEventListener('timeupdate', function(e) {
        e['c2pa_status'] = updateEvent;
        onPlaybackTimeUpdated(e);
    });


}

export { c2pa_init };

import IntervalTree from 'https://cdn.jsdelivr.net/npm/@flatten-js/interval-tree@1.0.20/dist/main.esm.js';

import { createC2pa } from 'https://cdn.jsdelivr.net/npm/c2pa@0.16.0-fmp4-alpha.2/+esm'

async function c2pa_init(player, onPlaybackTimeUpdated) {
    const C2paSupportedMediaTypes = ['video', 'audio'];

    let tree = {};
    let initFragment = {};

    const c2pa = await createC2pa({
        wasmSrc: 'https://cdn.jsdelivr.net/npm/c2pa@0.16.0-fmp4-alpha.2/dist/assets/wasm/toolkit_bg.wasm',
        workerSrc: 'https://cdn.jsdelivr.net/npm/c2pa@0.16.0-fmp4-alpha.2/dist/c2pa.worker.js',
    });

    player.extend("SegmentResponseModifier", function () {
        return {
            modifyResponseAsync: async function (chunk) {
                if (!C2paSupportedMediaTypes.includes(chunk.mediaInfo.type)) {
                    console.log('Unsupported C2PA media type ' + chunk.mediaInfo.type);
                    return Promise.resolve(chunk);
                }

                let tag = chunk.streamId + '-' + chunk.mediaInfo.type + '-' + chunk.representationId;

                if (chunk.segmentType == 'InitializationSegment') {
                    //TODO: mimetype should change based on actual type from chunk
                    initFragment[tag] = new Blob([chunk.bytes], {type: 'video/mp4'});
                    console.log('[C2PA] Got init seg for ' + tag)
                } else if (!(tag in initFragment)) {
                    console.error('initFragment is null for ' + tag);
                } else {
                    var manifest = await c2pa.readFragment(initFragment[tag], chunk.bytes)
                    
                    if (!(tag in tree))
                        tree[tag] = new IntervalTree();

                    tree[tag].insert([chunk.start, chunk.end], {
                        'type': chunk.segmentType, 
                        'manifest': manifest
                    });

                    console.log('[C2PA] Manifest extracted for ' + tag + ': ', manifest);
                }

                return Promise.resolve(chunk);
            }
        };
    });

    player.on(dashjs.MediaPlayer.events['PLAYBACK_TIME_UPDATED'], function (e) {
        let ret = {
            'verified': undefined,
            'details': {}
        };

        let isUndefined = false;
        for (const type of C2paSupportedMediaTypes) {
            let repSwitch = player.getDashMetrics().getCurrentRepresentationSwitch(type);
            if (repSwitch === null)
                continue;
            let representationId = repSwitch.to;
            let tag = e.streamId + '-' + type + '-' + representationId;

            console.log('[C2PA] Searching verification for ' + tag);

            if (!(tag in tree)) {
                console.error("cannot find " + tag);
                continue
            }

            let detail = {
                'verified': false,
                'manifest': null,
                'error': null,
            }

            let segs = tree[tag].search([e.time, e.time + 0.01]);

            if (segs.length > 1) {
                detail['error'] = 'Retrieved unexpected number of segments: ' + segs.length + ' for media type ' + type;
                isUndefined = true;
                continue;
            }
            
            if (segs.length == 0) {
                detail['error'] = 'No segment found for media type ' + type;
                isUndefined = true;
                continue;
            }

            let manifest = segs[0].manifest;

            detail['manifest'] = manifest;

            if (manifest.manifestStore == null)
                detail['error'] = 'null manifestStore';

            if (manifest['manifestStore']['validationStatus']?.length === 0) {
                detail['verified'] = true;
            } else
                detail['error'] = 'error code' + manifest.manifestStore.validationStatus[0].code;

            ret['details'][type] = detail;
            ret['verified'] = ((ret['verified'] === true || ret['verified'] === undefined) ? true : false) && detail['verified'];
        }

        if (isUndefined) {
            ret['verified'] = undefined;
        }

        e['c2pa_status'] = ret;
        onPlaybackTimeUpdated(e);
    });
}

export {c2pa_init};
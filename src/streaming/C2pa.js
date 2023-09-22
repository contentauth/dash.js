import MediaPlayerEvents from './MediaPlayerEvents';

import { createC2pa } from 'c2pa';
import wasmSrc from 'c2pa/dist/assets/wasm/toolkit_bg.wasm?file';
import workerSrc from 'c2pa/dist/c2pa.worker.js?file';

import IntervalTree from '@flatten-js/interval-tree';

function C2paController(_eventBus) {
    const eventBus = _eventBus;

    let instance,
        c2pa,
        tree,
        initFragment,
        C2paSupportedMediaTypes;

    function setup() {
        c2pa = new Promise((resolve, reject) => {
            createC2pa({
                wasmSrc: wasmSrc, 
                workerSrc: workerSrc
            }).then(result => {
                resolve(result);
            }).catch(error => {
                console.error('Failed to init c2pa: ' + error);
                reject(error);
            });
        });

        eventBus.on(MediaPlayerEvents.FRAGMENT_LOADING_COMPLETED, onFragmentReadyForC2pa, instance);

        tree = {};
        initFragment = {};

        C2paSupportedMediaTypes = ['video', 'audio'];
    }

    function onFragmentReadyForC2pa(e) {
        if (!e.sender || !e.response)
            return;

        if (!C2paSupportedMediaTypes.includes(e.request.mediaType)) {
            console.log('Unsupported C2PA media type ' + e.request.mediaType);
            return;
        }

        let tag = e.streamId + '-' + e.request.mediaType + '-' + e.request.representationId;

        // TODO(hawang) change the mimetype the actual one from the response
        // TODO(hawang) use InitCache created for each media type in BufferController instead of saving here
        if (e.request.type == 'InitializationSegment') {
            //TODO: mimetype should change based on actual type from chunk
            initFragment[tag] = new Blob([e.response], {type: 'video/mp4'});
            console.log('[C2PA] Got init seg for ' + tag)
        }
        else if (!(tag in initFragment)) {
            console.error('initFragment is null ' + tag);
        } else {
            c2pa.then(result => {
                result.readFragment(initFragment[tag], e.response)
                    .then(manifest => {
                        if (!(tag in tree))
                            tree[tag] = new IntervalTree();

                        tree[tag].insert([e.request.startTime, e.request.startTime + e.request.duration], {
                            'type': e.request.segmentType, 
                            'manifest': manifest
                        });
                        console.log('[C2PA] Manifest extracted for ' + tag + ': ', manifest);
                    }).catch(error => console.error('Failed to extract C2pa manifest: ' + error));
            });
        }
    }

    function getC2paVerificationStatus(time, streamInfo, dashMetrics) {
        let ret = {
            'verified': undefined,
            'details': {}
        };

        let isUndefined = false;
        for (const type of C2paSupportedMediaTypes) {
            let repSwitch = dashMetrics.getCurrentRepresentationSwitch(type);
            if (repSwitch === null)
                continue;
            let representationId = repSwitch.to;
            let tag = streamInfo.id + '-' + type + '-' + representationId;

            console.log('[C2PA] Searching verification for ' + tag);

            if (!(tag in tree))
                continue

            let detail = {
                'verified': false,
                'manifest': null,
                'error': null,
            }

            let segs = tree[tag].search([time, time + 0.01]);

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

        return ret;
    }

    instance = {
        onFragmentReadyForC2pa,
        getC2paVerificationStatus,
    }

    setup();

    return instance;
}

export { C2paController };
/* eslint-disable quotes */
import { createC2pa } from "c2pa";
import wasmSrc from "c2pa/dist/assets/wasm/toolkit_bg.wasm?file";
import workerSrc from "c2pa/dist/c2pa.worker.js?file";
import MediaPlayerEvents from "./MediaPlayerEvents";

import IntervalTree from "@flatten-js/interval-tree";

function C2paController(_eventBus, _getCurrentTrackFor) {
    const eventBus = _eventBus;
    const getCurrentTrackFor = _getCurrentTrackFor;

    let instance,
        c2pa,
        tree,
        initFragment,
        C2paSupportedMediaTypes,
        currentQuality,
        verificationTime;

    function setup() {
        c2pa = new Promise((resolve, reject) => {
            createC2pa({
                wasmSrc: wasmSrc,
                workerSrc: workerSrc,
            })
                .then((result) => {
                    resolve(result);
                })
                .catch((error) => {
                    console.error("[C2PA] Failed to init c2pa: " + error);
                    reject(error);
                });
        });

        eventBus.on(
            MediaPlayerEvents.FRAGMENT_LOADING_COMPLETED,
            onFragmentReadyForC2pa,
            instance
        );
        eventBus.on(
            MediaPlayerEvents.QUALITY_CHANGE_RENDERED,
            onVideoQualityChanged,
            instance
        );

        tree = {};
        initFragment = {};

        C2paSupportedMediaTypes = ["video", "audio"];

        currentQuality = {};
        for (const type of C2paSupportedMediaTypes) {
            currentQuality[type] = null;
        }

        verificationTime = 0.0;
    }

    function onFragmentReadyForC2pa(e) {
        if (!e.sender || !e.response) return;

        if (!C2paSupportedMediaTypes.includes(e.request.mediaType)) {
            console.log(
                "[C2PA] Unsupported C2PA media type " + e.request.mediaType
            );
            return;
        }

        let tag =
            e.streamId +
            "-" +
            e.request.mediaType +
            "-" +
            e.request.representationId;

        console.log("[C2PA] Processing verification for " + tag, e.request.startTime, e.request.startTime + e.request.duration);

        // TODO(hawang) change the mimetype the actual one from the response
        // TODO(hawang) use InitCache created for each media type in BufferController instead of saving here
        if (e.request.type == "InitializationSegment") {
            //TODO: mimetype should change based on actual type from chunk
            initFragment[tag] = new Blob([e.response], { type: "video/mp4" });
            console.log("[C2PA] Got init seg for " + tag);
        } else if (!(tag in initFragment)) {
            console.error("[C2PA] initFragment is null " + tag);
        } else {
            c2pa.then((result) => {
                result
                    .readFragment(initFragment[tag], e.response)
                    .then((manifest) => {
                        if (!(tag in tree)) tree[tag] = new IntervalTree();

                        const interval = [
                            e.request.startTime,
                            e.request.startTime + e.request.duration,
                        ];
                        const c2paInfo = {
                            type: e.request.mediaType,
                            manifest: manifest,
                            interval: [
                                e.request.startTime,
                                e.request.startTime + e.request.duration,
                            ],
                        };

                        tree[tag].search(interval).forEach((seg) => {
                            if (
                                seg.interval[0] == interval[0] &&
                                seg.interval[1] == interval[1]
                            ) {
                                console.info(
                                    "[C2PA] Segment already exists in tree, removing",
                                    interval
                                );
                                tree[tag].remove(interval, seg);
                            }
                        });

                        tree[tag].insert(interval, c2paInfo);

                        if (currentQuality[e.request.mediaType] === null) {
                            currentQuality[e.request.mediaType] =
                                e.request.representationId;
                        }

                        console.log(
                            "[C2PA] Completed verification for " + tag,
                            e.request.startTime,
                            e.request.startTime + e.request.duration,
                            manifest
                        );
                    })
                    .catch((error) =>
                        console.error(
                            "[C2PA] Failed to extract C2pa manifest: " + error
                        )
                    );
            });
        }
    }

    function onVideoQualityChanged(e) {
        console.log(
            "[C2PA] Video quality changed for type " + e.mediaType,
            getCurrentTrackFor(e.mediaType).bitrateList[e.newQuality].id
        );
        currentQuality[e.mediaType] = getCurrentTrackFor(
            e.mediaType
        ).bitrateList[e.newQuality].id;
    }

    function getC2paVerificationStatus(time, streamInfo) {
        let ret = {
            verified: undefined,
            details: {},
        };

        let isUndefined = false;
        for (const type of C2paSupportedMediaTypes) {
            if (currentQuality[type] === null || verificationTime === null)
                continue;

            let representationId = currentQuality[type];
            let tag = streamInfo.id + "-" + type + "-" + representationId;

            console.log(
                "[C2PA] Searching verification for " +
                    tag +
                    " at time " +
                    verificationTime
            );

            if (!(tag in tree)) {
                console.error("[C2PA] Cannot find " + tag);
                continue;
            }

            let detail = {
                verified: false,
                manifest: null,
                error: null,
            };

            let segs = tree[tag].search([
                verificationTime,
                verificationTime + 0.01,
            ]);

            if (segs.length > 1) {
                const interval = segs[0].interval;
                for (let i = 1; i < segs.length; i++) {
                    if (segs[i].interval == interval) {
                        isUndefined = true;
                        break;
                    }
                }
                if (isUndefined) {
                    console.info(
                        "[C2PA] Retrieved unexpected number of segments: " +
                            segs.length +
                            " for media type " +
                            type
                    );
                    detail["error"] =
                        "Retrieved unexpected number of segments: " +
                        segs.length +
                        " for media type " +
                        type;
                    ret["details"][type] = detail;
                    continue;
                }
            }

            if (segs.length == 0) {
                console.info("[C2PA] No segment found for media type " + type);
                detail["error"] = "No segment found for media type " + type;
                ret["details"][type] = detail;
                isUndefined = true;
                continue;
            }

            let manifest = segs[0].manifest;

            detail["manifest"] = manifest;

            if (manifest.manifestStore == null)
                detail["error"] = "null manifestStore";

            if (manifest["manifestStore"]["validationStatus"]?.length === 0) {
                detail["verified"] = true;
            } else
                detail["error"] =
                    "error code" +
                    manifest.manifestStore.validationStatus[0].code;

            ret["details"][type] = detail;
            ret["verified"] =
                (ret["verified"] === true || ret["verified"] === undefined
                    ? true
                    : false) && detail["verified"];
        }

        if (isUndefined) {
            ret["verified"] = undefined;
        }

        console.log("[C2PA] Verification result: ", ret);
        verificationTime = time;

        return ret;
    }

    instance = {
        onFragmentReadyForC2pa,
        getC2paVerificationStatus,
    };

    setup();

    return instance;
}

export { C2paController };

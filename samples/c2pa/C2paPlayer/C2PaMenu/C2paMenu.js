/**
    * @module c2pa-player
    * @param {object=} videoJsPlayer - videojs reference
    * @param {object=} videoHtml - video html element
    */

export var C2PAMenu = function() {
    
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
    const c2paAlertPrefix = 'The region(s) between ';
    const c2paAlertSuffix = ' may have been comprimised';

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
                if (itemName == 'SIG_ISSUER') {
                    return manifest['manifestStore']['activeManifest']['signatureInfo']['issuer'];
                }
                if (itemName == 'CLAIM_GENERATOR') {
                    return manifest['manifestStore']['activeManifest']['claimGenerator'];
                }
            }
            if (itemName == 'VALIDATION_STATUS') {
                switch (verificationStatus) {
                    case true:
                        return 'Passed';
                    case false:
                        return 'Failed';
                    default:
                        return 'Unknown';
                }
            }
            if (itemName == 'ALERT') {
                return c2paAlertMessage(compromisedRegions);
            }
    
            return null;
        },
    };
}


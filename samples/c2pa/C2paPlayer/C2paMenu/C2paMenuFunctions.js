import { C2PAMenu } from './C2paMenu.js';
let c2paMenuInstance = new C2PAMenu();
export let initializeC2PAMenu = function (videoPlayer, c2paMenu) {
    const MenuButton = videojs.getComponent('MenuButton');
    const MenuItem = videojs.getComponent('MenuItem');

    class C2PAMenuButton extends MenuButton {
        createItems() {
            // Must return an array of `MenuItem`s
            // Options passed in `addChild` are available at `this.options_`
            return this.options_.myItems.map((i) => {
                let item = new MenuItem(this.player_, { label: i.name });
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
    videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);
   
    //Add items to c2pa menu
    let c2pAItems = [];
    const menuItems = c2paMenuInstance.c2paMenuItems();
    Object.keys(menuItems).forEach((key) => {
        const value = menuItems[key];
        c2pAItems.push({
            name:
                value +
                c2paMenuInstance.c2paMenuDelimiter() +
                'Not Available',
        });
    });

    // Use `addChild` to add an instance of the new component, with options
    videoPlayer.controlBar.addChild(
        'C2PAMenuButton',
        {
            controlText: 'Content Credentials',
            title: 'Content Credentials',
            myItems: c2pAItems,
            className: 'c2pa-menu-button'
        },
        0
    ); //0 indicates that the menu button will be the first item in the control bar
};

//Adjust c2pa menu size with respect to the player size
export let adjustC2PAMenu = function (c2paMenu , videoElement , c2paMenuHeightOffset) {
    const menuContent = c2paMenu
        .el()
        .querySelector(
            '.vjs-menu-button-popup .vjs-menu .vjs-menu-content'
        );

    const playerWidth = videoElement.offsetWidth;
    const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

    menuContent.style.width = `${playerWidth}px`;
    menuContent.style.height = `${playerHeight}px`;
};


//Update the c2pa menu items with the values from the c2pa manifest
export let updateC2PAMenu = function (c2paStatus, c2paMenu , isMonolithic , videoPlayer , getCompromisedRegions) {
    //Get all the items in the c2pa menu
    const c2paItems = c2paMenu.el().querySelectorAll('.vjs-menu-item');
    const compromisedRegions = getCompromisedRegions(isMonolithic , videoPlayer);

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
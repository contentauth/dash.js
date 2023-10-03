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
        },
        0
    ); //0 indicates that the menu button will be the first item in the control bar


    var MenuButtonIcon = document
        .querySelector(
            '.vjs-menu-button .vjs-icon-placeholder'
        );
    MenuButtonIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.6133 8V14.6133H8C4.34756 14.6133 1.38667 11.6524 1.38667 8C1.38667 4.34756 4.34756 1.38667 8 1.38667C11.6524 1.38667 14.6133 4.34756 14.6133 8ZM0 8C0 3.58172 3.58172 0 8 0C12.4183 0 16 3.58172 16 8V16H8C3.58172 16 0 12.4183 0 8ZM3.18037 8.31682C3.18037 9.96759 4.28843 11.3583 6.06357 11.3583C7.52213 11.3583 8.50581 10.3972 8.74325 9.1422H7.30731C7.1264 9.71884 6.66283 10.0693 6.06357 10.0693C5.17035 10.0693 4.5824 9.36834 4.5824 8.31682C4.5824 7.2653 5.17035 6.56428 6.06357 6.56428C6.64021 6.56428 7.09248 6.89218 7.28469 7.4349H8.73195C8.47189 6.21378 7.49952 5.27532 6.06357 5.27532C4.28843 5.27532 3.18037 6.66604 3.18037 8.31682ZM10.6718 5.43362H9.31503V11.2H10.7284V8.19244C10.7284 7.62711 10.8867 7.25399 11.158 7.02786C11.3955 6.81303 11.712 6.69996 12.2208 6.69996H12.5827V5.36578H12.2322C11.4859 5.36578 10.9884 5.63714 10.6718 6.05548V5.43362Z" fill="black"/></svg>'
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
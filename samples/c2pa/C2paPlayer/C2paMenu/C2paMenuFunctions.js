export let initializeC2PAMenu = function (c2paMenuInstance, videoPlayer) {
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

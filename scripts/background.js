// Cache user selected audio files until service worker reloads
var previousSetRequest = null;
var enabled = false;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // console.log(changeInfo, tab);
    (async() => {
        // Apply the cache on refresh
        if (tab.status === 'complete' && tab.url.includes("r90.current-rms.com")) {
            await injectFunc(addToCobra);
            await injectFunc(updateDropdown, [updateSetSound.toString()]);
            if (!previousSetRequest || changeInfo.status === 'complete') await setSound();
            if (enabled === null || changeInfo.staus === 'complete')
                enabled = (await chrome.storage.local.get(["enabled"])).enabled ?? false;
            await injectFunc(updateSetSound, [enabled]);
        }
    })();
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    (async() => {
        switch (request.action) {
            // User wants to update success / fail sounds
            case 'set-sound':
                // Assume we want to enable
                previousSetRequest = request; enabled = true;
                await chrome.storage.local.set({ setSound: request, enabled: enabled }, () => console.log("Sound setting cached"));
                await setSound(request);
                await injectFunc(updateSetSound, [enabled]);

                sendResponse({ message: 'Sound set' });
                break;
            // User wants to load previously uploaded success / fail sounds if they
            // still exist
            case 'refresh':
                sendResponse({
                    message: previousSetRequest ? 'Previously uploaded sounds loaded' : 'No previously uploaded sounds',
                    previous: previousSetRequest,
                    enabled: enabled,
                });
                break;
            // User wants to toggle extension functionality
            case 'toggle':
                enabled = !enabled;
                await chrome.storage.local.set({ enabled: enabled });
                await injectFunc(updateSetSound, [enabled]);

                sendResponse({ message: `Extension toggled ${enabled ? 'on': 'off'}` });
                break;
            // Unsupported operation
            default:
                sendResponse({ message: 'Invalid action' });
        }
    })();

    // True indicates async response
    return true;
})

// Sets page success() and fail() sounds to what user has uploaded
async function setSound(request) {
    // No uploaded success / fail sounds
    if (!previousSetRequest) {
        // Try cache
        previousSetRequest = (await chrome.storage.local.get(["setSound"])).setSound;
        if (!previousSetRequest) return false;
        console.log("Reloaded cached sound");
    }

    // No change needed
    if (previousSetRequest == request) return;
    
    // Generate web traffic redirect rules. Ion.sound will automatically try to fetch files
    // that don't exist from r90.current-rms.com. Intercept and redirect to uploaded data streams
    newRules = [
        generateRedirectRule(1, 'sounds/user-success', previousSetRequest.success),
        generateRedirectRule(2, 'sounds/user-fail', previousSetRequest.fail),
    ];
    await updateRules(newRules);

    // Inject code to update ion.sound / cobra to user selected sounds. This needs to be run in MAIN
    // scope to access 'ion' and 'cobra' variables on page
    await injectFunc(addToIon, [previousSetRequest.successVolume, previousSetRequest.failVolume]);

    // Successful update
    return true;
}

// Creates a redirect declarativeNetRequest rule per: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
// from any URL containing 'contains' to 'redirectUrl'. 'id' must be a unique integer from other rules
function generateRedirectRule(id, contains, redirectUrl) {
    return {
        id: id,
        priority: 1,
        action: { type: "redirect", redirect: { "url" : redirectUrl} },
        condition: { urlFilter: `*${contains}*`, resourceTypes: ["xmlhttprequest"]}
    };
}

// Updates dynamic redirect rules to 'newRules', deleting all old rules in the process
async function updateRules(newRules) {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map(rule => rule.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: oldRuleIds,
        addRules: newRules
    });
}

// Returns current tab object
async function getTab() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

// Injects the provided 'func' into MAIN scope of the current tab. Any arguments to the function
// need to be provided as 'args' in list format.
async function injectFunc(func, args = []) {
    chrome.scripting.executeScript({
        target: { tabId: (await getTab()).id },
        func: func,
        args: args,
        world: "MAIN"
    });
}

// Adds 'user-success' and 'user-fail' sounds to ion
function addToIon(successVolume, failVolume) {
    ion.sound.destroy('user-success');
    ion.sound.destroy('user-fail');

    ion.sound({
        sounds: [
            { name: `user-success`, path: "sounds/", volume: successVolume },
            { name: `user-fail`, path: "sounds/", volume: failVolume },
        ],
        path: "sounds/",
        preload: true
    });
}

// Adds 'user-succes' and 'user-fail' sound pair to the cobra sound pair list
// To be ran on page refresh (this should always be present)
function addToCobra() {
    // Naively check one value - failure
    const isInjected = cobra.sound.sound_pairs[cobra.sound.sound_pairs.length - 1].failure == 'user-fail';
    if (isInjected) return;

    cobra.sound.sound_pairs[cobra.sound.sound_pairs.length] = {
        success: 'user-success',
        failure: 'user-fail',
    };
}

// Sets the selected sound pair to 'user-success' and 'user-fail' values.
function updateSetSound(enabled) {
    /* This function gets stringified, so can only use backtick quotes and multi-line comments :') */
    const previous = cobra.sound.selected_sound_pair_index;
    if (cobra.sound.last_set_index === undefined || cobra.sound.selected_sound_pair_index != cobra.sound.sound_pairs.length - 1)
        cobra.sound.last_set_index = cobra.sound.selected_sound_pair_index;
    cobra.sound.selected_sound_pair_index = enabled ? cobra.sound.sound_pairs.length - 1 :
                                                      cobra.sound.last_set_index;
    
    /* No actual change */
    if (previous == cobra.sound.selected_sound_pair_index) return;

    /* Update list elements to not have check mark */
    const previousSelectedIcon = document.querySelector(`#sound_effects_toggle i.icn-cobra-checkmark`);
    const parentAnchor = previousSelectedIcon.parentElement;
    previousSelectedIcon.remove();
    parentAnchor.innerText = parentAnchor.innerText.trim();

    /* Update appropriate elemnt to have checkmark */
    const toAddCheck = enabled ? document.getElementById(`user-list-element`)?.children[0] :
                                 document.getElementById(`sound_effects_toggle`)?.children[0]?.children[1]?.children[cobra.sound.selected_sound_pair_index]?.children[0];
    
    toAddCheck.innerHTML = ` \u00A0 ` + toAddCheck.innerHTML.trim();
    const checkMark = document.createElement(`i`);
    checkMark.setAttribute(`class`, `icn-cobra-checkmark`);
    toAddCheck.prepend(checkMark);
}

// Adds additional option to sound options list
function updateDropdown(updateSetSound) {
    const soundToggle = document.getElementById("sound_effects_toggle");
    if (!soundToggle) return;

    // TODO: This is janky but :shrug:
    const parent = soundToggle.children[0].children[1];
    const baseSchemes = cobra.sound.sound_pairs.length;
    if (parent.children.length == baseSchemes + 2) return;

    // Need to insert 
    let newListElement = document.createElement("li");
    newListElement.setAttribute("id", "user-list-element")
    newListElement.innerHTML = `<a>User Uploaded</a>`
    /* Allows the dropdown menu to have functionality, disabled for now */
    /* newListElement.innerHTML = `<a href="javascript:${updateSetSound};updateSetSound(true);">User Uploaded</a>` */
    parent.append(newListElement)
}
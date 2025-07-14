// Cache user selected audio files until service worker reloads
var previousSetRequest = null;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // console.log(changeInfo, tab);
    (async() => {
        // Apply the cache on refresh
        if (tab.status === 'complete' && tab.url.includes("r90.current-rms.com")) {
            await injectFunc(addToCobra);
            await injectFunc(updateDropdown, [setUserChoice.toString()]);
            if (!previousSetRequest || changeInfo.status === 'complete') await setSound();
        }
    })();
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    (async() => {
        switch (request.action) {
            // User wants to update success / fail sounds
            case 'set-sound':
                previousSetRequest = request;
                await chrome.storage.local.set({ setSound: request }, () => console.log("Sound setting cached"));
                await setSound();
                await injectFunc(setUserChoice);

                sendResponse({ message: 'Sound set' });
                break;
            // User wants to load previously uploaded success / fail sounds if they
            // still exist
            case 'refresh-sounds':
                sendResponse({
                    message: previousSetRequest ? 'Previously uploaded sounds loaded' : 'No previously uploaded sounds',
                    previous: previousSetRequest
                });
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
    // Use rand to force a refresh
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
function setUserChoice() {
    /* This function gets stringified, so can only use backtick quotes and multi-line comments :') */
    cobra.sound.selected_sound_pair_index = cobra.sound.sound_pairs.length - 1;

    /* TODO: Update list elements to not have check mark */
    const previousSelectedIcon = document.querySelector(`#sound_effects_toggle i.icn-cobra-checkmark`);
    const parentAnchor = previousSelectedIcon.parentElement;
    previousSelectedIcon.remove();
    parentAnchor.innerText = parentAnchor.innerText.replace(/&nbsp;/g, ``).replace(/[\n\r]+/g, ``);

    /* Update user elemnt to have checkmark */
    const userLink = document.getElementById(`user-list-element`).children[0];
    if (userLink.children.length == 1) return; /* Already exists */
    
    const checkMark = document.createElement(`i`);
    checkMark.setAttribute(`class`, `icn-cobra-checkmark`);
    userLink.innerHTML = ` \u00A0 User Uploaded`;
    userLink.prepend(checkMark);

    /* This breaks for some reason? */
    const stop = cobra.sound.stop;
    cobra.sound.stop = () => {};
    cobra.sound.success();
    cobra.sound.stop = stop;
}

function updateDropdown(setUserChoice) {
    const soundToggle = document.getElementById("sound_effects_toggle");
    if (!soundToggle) return;

    // TODO: This is janky but :shrug:
    const parent = soundToggle.children[0].children[1];
    const baseSchemes = cobra.sound.sound_pairs.length;
    if (parent.children.length == baseSchemes + 2) return;

    // Need to insert 
    let newListElement = document.createElement("li");
    newListElement.setAttribute("id", "user-list-element")
    newListElement.innerHTML = `<a href="javascript:${setUserChoice};setUserChoice();">User Uploaded</a>`
    parent.append(newListElement)
}
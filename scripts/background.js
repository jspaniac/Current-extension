// Cache user selected audio files until service worker reloads
var previousRequest = null;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    (async() => {
        // Apply the cache on refresh
        if (changeInfo.status === 'complete' && previousRequest && tab.url.includes("r90.current-rms.com")) {
            await injectFunc(addToCobra);
            await setSound();
        }
    });
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    
    (async() => {
        switch (request.action) {
            // User wants to update success / fail sounds
            case 'set-sound':
                previousRequest = request;
                await setSound();

                sendResponse({ message: 'Sound set' });
                break;
            // User wants to load previously uploaded success / fail sounds if they
            // still exist
            case 'refresh-sounds':
                sendResponse({ message: await setSound() ? 'Sound set' : 'No cached sounds' });
                break;
            // User wants to update cobra to include 'user-success' and 'user-fail' audio pairs
            case 'update-cobra':
                await injectFunc(addToCobra);
                sendResponse({ message: 'Cobra updated to include user options' });
                break;
            // Unsupported operation
            default:
                sendResponse({ message: 'Invalid action' });
        }
    })()

    // True indicates async response
    return true;
})

// Sets page success() and fail() sounds to what user has uploaded
async function setSound() {
    // No uploaded success / fail sounds
    if (!previousRequest) return false;
    
    // Generate web traffic redirect rules. Ion.sound will automatically try to fetch files
    // that don't exist from r90.current-rms.com. Intercept and redirect to uploaded data streams
    newRules = [
        generateRedirectRule(1, 'sounds/user-success', previousRequest.success),
        generateRedirectRule(2, 'sounds/user-fail', previousRequest.fail)
    ];
    await updateRules(newRules);

    // Inject code to update ion.sound / cobra to user selected sounds. This needs to be run in MAIN
    // scope to access 'ion' and 'cobra' variables on page
    await injectFunc(addToIon, [previousRequest.successVolume, previousRequest.failVolume]);
    await injectFunc(setUserChoice);

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
    ion.sound({
        sounds: [
            { name: "user-success", path: "sounds/", volume: successVolume },
            { name: "user-fail", path: "sounds/", volume: failVolume }
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
    if (!isInjected) {
        cobra.sound.sound_pairs[cobra.sound.sound_pairs.length] = {
            success: 'user-success',
            failure: 'user-fail'
        };
        console.log(cobra.sound.sound_pairs);
    }
}

// Sets the selected sound pair to 'user-success' and 'user-fail' values.
function setUserChoice() {
    cobra.sound.selected_sound_pair_index = cobra.sound.sound_pairs.length - 1;
    console.log(cobra.sound);
}
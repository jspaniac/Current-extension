var successData = null;
var failData = null;

var alertElement = null;

// Set event listeners for popup elements
document.addEventListener('DOMContentLoaded', () => {
    // Sets up the success or fail sound file upload and play elements
    function setupSound(success) {
        document.getElementById(success ? "success" : "fail")
            .addEventListener('change', (e) => { setSound(e, success); });
        document.getElementById(success ? "successPlay" : "failPlay")
            .addEventListener('click', () => { playSound(success); });
        const volume = document.getElementById(success ? "successVolume" : "failVolume");
        document.getElementById(success ? "successRange" : "failRange")
            .addEventListener('input', (e) => { volume.textContent =  e.target.value; });
    }
    setupSound(true);
    setupSound(false);

    // Sets up the submit files button
    document.getElementById("submit")
        .addEventListener('click', () => { submitFiles() });

    // Connects alert element
    alertElement = document.getElementById("alertElement");
    // Try loading saved sounds now that alert element is connected
    chrome.runtime.sendMessage({ action: 'refresh-sounds' }, (response) => {
        alertElement.textContent = response.message;
        if (response.previous) {
            // Previous response saved and loaded, update
            successData = response.previous.success;
            setVolume(true, response.previous.successVolume);
            failData = response.previous.fail;
            setVolume(false, response.previous.failVolume);
        }
    });
});

// Plays either the currently selected success or fail sound if loaded
function playSound(success) {
    const data = success ? successData : failData;
    if (data) {
        const audio = new Audio(data);
        audio.volume = getVolume(success);
        audio.play();
    }
}

// Returns the currently selected success or fail volume in range [0.0, 1.0]
function getVolume(success) {
    return document.getElementById(success ? "successRange" : "failRange").value / 100;
}

// Sets the volume sliders with given value between [0.0, 1.0]
function setVolume(success, amount) {
    const slider = document.getElementById(success ? "successRange" : "failRange");
    slider.value = amount * 100;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
}

// Uploads the selected sound file data and stores it to send to background
// service worker
function setSound(e, success) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.addEventListener('load', (e) => {
            const data = e.target.result;
            success ? successData = data : failData = data;
        })
        reader.readAsDataURL(file);
    }
}

// Submits the selected files to the background service worker
function submitFiles() {
    // Alert if missing data
    if (!successData || !failData) {
        alertElement.textContent = "Upload success AND fail file";
        return;
    }

    chrome.runtime.sendMessage({
        action: 'set-sound',
        success: successData,
        successVolume: getVolume(true),
        fail: failData,
        failVolume: getVolume(false),
    }, (response) => { 
        console.log(response);
        alertElement.textContent = response.message;
        if (response.message === 'Sound set') {
            // Play the success sound on good response
            playSound(true);
        }
    });
}
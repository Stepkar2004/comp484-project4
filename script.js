// ==========================================
// Global Variables
// ==========================================
let map; // Google Map instance

// List of all possible locations in the game
// Each location has a name and a bounding box defined by TopLeft and BottomRight coordinates
const locations = [
    {
        name: "Citrus Hall",
        topLeft: { lat: 34.239166, lng: -118.528667 },
        bottomRight: { lat: 34.238891, lng: -118.527498 }
    },
    {
        name: "University Library",
        topLeft: { lat: 34.240443, lng: -118.530051 },
        bottomRight: { lat: 34.239503, lng: -118.528635 }
    },
    {
        name: "Sequoia Hall",
        topLeft: { lat: 34.240816, lng: -118.528528 },
        bottomRight: { lat: 34.240098, lng: -118.527541 }
    },
    {
        name: "Sierra Hall",
        topLeft: { lat: 34.238483, lng: -118.531403 },
        bottomRight: { lat: 34.238093, lng: -118.530041 }
    },
    {
        name: "Eucalyptus Hall",
        topLeft: { lat: 34.238776, lng: -118.528861 },
        bottomRight: { lat: 34.238519, lng: -118.527584 }
    },
    {
        name: "Live Oak Hall",
        topLeft: { lat: 34.238395, lng: -118.528839 },
        bottomRight: { lat: 34.238155, lng: -118.527584 }
    },
    {
        name: "Jacaranda Hall",
        topLeft: { lat: 34.242067, lng: -118.529376 },
        bottomRight: { lat: 34.241055, lng: -118.527788 }
    },
    {
        name: "Bookstein Hall",
        topLeft: { lat: 34.242483, lng: -118.531232 },
        bottomRight: { lat: 34.241428, lng: -118.530030 }
    },
];

// Game State Variables
let currentRound = 0;       // Current round index (0-4)
let score = 0;              // (Unused legacy variable, kept for safety)
let baseScore = 0;          // Number of correct answers
let points = 0;             // Score calculation: 100 points per correct answer
let timer = 60;             // Game countdown timer in seconds
let timerInterval;          // Reference to the setInterval timer
let gameActive = false;     // Flag to check if game is currently running
let canClick = false;       // Lock availability to prevent multiple clicks during feedback
let currentPolygon = null;  // Reference to the currently drawn polygon (green/red box)
let highScore = localStorage.getItem('csunMapHighScore') || 0; // Load high score from local storage
let mapLoaded = false;      // Flag to ensure map API is ready before starting
let gameLocations = [];     // Array to store the 5 specific locations selected for the current game

// ==========================================
// Helper Functions
// ==========================================

// Converts our simplified 2-point objects (TopLeft, BottomRight) 
// into the 4-point polygon path format required by Google Maps API.
function getPolygonPath(loc) {
    if (loc.bounds) return loc.bounds; // Backward compatibility (old format)
    return [
        loc.topLeft,                                      // Top Left
        { lat: loc.topLeft.lat, lng: loc.bottomRight.lng }, // Top Right
        loc.bottomRight,                                   // Bottom Right
        { lat: loc.bottomRight.lat, lng: loc.topLeft.lng }  // Bottom Left
    ];
}

// ==========================================
// Initialization & API Key Handling
// ==========================================
$(document).ready(() => {
    $('#high-score-display').text(highScore);

    const savedKey = localStorage.getItem('csunMapApiKey');
    if (savedKey) {
        loadGoogleMaps(savedKey);
    } else {
        showApiKeyModal();
    }

    // Event Listeners
    $('#submit-api-key').click(saveAndLoadKey);
    $('#start-btn').click(startGame);
    $('#next-btn').click(nextRound);
    $('#reset-key-link').click(resetApiKey);
    $('#end-early-btn').click(() => endGame("Game Abandoned", true));

    // Keyboard Support: Press Enter to go to next round
    $(document).keydown((e) => {
        if (e.which === 13) { // Enter Key
            if ($('#feedback-modal').is(':visible')) {
                nextRound();
            } else if ($('#start-btn').is(':visible') && !$('#api-key-modal').is(':visible')) {
                startGame();
            }
        }
    });
});

function showApiKeyModal() {
    $('#api-key-backdrop').show();
    $('#api-key-modal').show();
}

function saveAndLoadKey() {
    const key = $('#api-key-input').val().trim();
    if (key) {
        localStorage.setItem('csunMapApiKey', key);
        $('#api-key-backdrop').hide();
        $('#api-key-modal').hide();
        loadGoogleMaps(key);
    } else {
        alert("Please enter a valid API Key.");
    }
}

function resetApiKey() {
    if (confirm("This will clear your saved API key and reload the page. Continue?")) {
        localStorage.removeItem('csunMapApiKey');
        location.reload();
    }
}

function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) {
        initMap();
        return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        alert("Failed to load Google Maps. Network error or blocked.");
        localStorage.removeItem('csunMapApiKey');
        location.reload();
    };
    document.body.appendChild(script);

    setTimeout(() => {
        if (!mapLoaded) {
            $('#ui-container').removeClass('hidden');
            console.warn("Map took too long via initMap. Forcing UI.");
        }
    }, 3000);
}

// Initialize the map (Called by Google Maps API callback)
window.initMap = function () {
    $('#ui-container').removeClass('hidden'); // Show sidebar once map is ready
    mapLoaded = true;

    // Center coordinates for CSUN
    const csunCenter = { lat: 34.239184, lng: -118.529279 };

    // JSON style object to hide all labels (POI, Roads, Transit, etc.)
    // This creates a "blind" map where users must rely on building shapes and road layouts.
    const noPoiStyles = [
        {
            featureType: "all",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
        }
    ];

    // Create the map with locked controls (no zoom/pan)
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 17,
        center: csunCenter,
        disableDefaultUI: true, // Hides StreeView, MapType options
        gestureHandling: "none", // Disables touch/scroll interactions
        clickableIcons: false,   // Disables clicking on default map icons
        styles: noPoiStyles
    });

    // Helper: Logs coordinates to console on click (For developers to find bounds)
    map.addListener("click", (e) => {
        console.log(`Clicked Coordinates: { lat: ${e.latLng.lat().toFixed(6)}, lng: ${e.latLng.lng().toFixed(6)} }`);
    });

    // Game Interaction: Double-click to guess location
    map.addListener("dblclick", (e) => {
        if (!gameActive || !canClick) return; // Ignore if game hasn't started or is locked
        handleMapClick(e.latLng);
    });
};

// ==========================================
// Game Logic Functions
// ==========================================

// Resets game state and starts the first round
function startGame() {
    if (!mapLoaded) return;

    // Requirement: Game must have 5 rounds. 
    // We force "Citrus Hall" to always be included (as per instructions) 
    // and then pick 4 other random locations.
    const citrus = locations.find(l => l.name === "Citrus Hall");
    const others = locations.filter(l => l.name !== "Citrus Hall").sort(() => 0.5 - Math.random());
    gameLocations = [citrus, ...others.slice(0, 4)].sort(() => 0.5 - Math.random());

    // Reset scores and timer
    score = 0;
    baseScore = 0;
    points = 0;
    currentRound = 0;
    timer = 60;
    gameActive = true;
    canClick = true;

    // Reset UI
    $('#game-log').empty();
    updateScoreBoard();
    startTimer();
    loadRound();

    // Toggle Buttons
    $('#start-btn').addClass('hidden');
    $('#end-early-btn').removeClass('hidden');
}

// Starts the 60-second countdown
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timer--;
        $('#timer-display').text(timer);
        if (timer <= 0) {
            endGame("Time's Up!");
        }
    }, 1000);
}

// Stops the timer
function stopTimer() {
    clearInterval(timerInterval);
}

// Prepares the UI for the current round
function loadRound() {
    // Clean up previous polygon if it exists
    if (currentPolygon) {
        currentPolygon.setMap(null);
        currentPolygon = null;
    }

    // Check if game is complete
    if (currentRound >= gameLocations.length) {
        endGame();
        return;
    }

    // Update Target Text and unlock interaction
    canClick = true;
    const loc = gameLocations[currentRound];
    $('#target-location').text(loc.name);
    updateScoreBoard();
}

// Handles the user's double-click on the map
function handleMapClick(latLng) {
    canClick = false; // "Lock" the game to prevent submitting multiple guesses for one round
    const target = gameLocations[currentRound];

    // Create a Polygon object from the target bounds
    const targetPoly = new google.maps.Polygon({
        paths: getPolygonPath(target)
    });

    // Check if click coordinate is inside the target polygon
    const isCorrect = google.maps.geometry.poly.containsLocation(latLng, targetPoly);
    showFeedback(isCorrect, target);
}

// Displays visual feedback (polygons) and text modal
function showFeedback(isCorrect, target) {
    const color = isCorrect ? "#00FF00" : "#FF0000"; // Green for correct, Red for wrong

    // Draw the target area on the map
    if (currentPolygon) currentPolygon.setMap(null);
    currentPolygon = new google.maps.Polygon({
        paths: getPolygonPath(target),
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.35,
        map: map
    });

    // Update Feedback Modal
    const msg = isCorrect ? "Correct!" : "Wrong!";
    const cssClass = isCorrect ? "correct" : "wrong";

    $('#feedback-title').text(msg);
    $('#feedback-message').text(isCorrect ? `You found ${target.name}.` : `Oops! That wasn't it.`);
    $('#feedback-modal').removeClass('correct wrong').addClass(cssClass).show();

    // Log result to sidebar
    addLogEntry(`Where is ${target.name}?`, isCorrect ? "Your answer is correct!" : "Sorry wrong location.", cssClass);

    // Update Score
    if (isCorrect) {
        baseScore++;
        points += 100;
    }
    updateScoreBoard();

    // Check if this was the final round
    if (currentRound === gameLocations.length - 1) {
        $('#next-btn').hide(); // Hide button since it's the end
        setTimeout(() => {
            endGame();
        }, 1000); // 1 second delay to see the feedback
    } else {
        $('#next-btn').show(); // Ensure button is visible for other rounds
    }
}

// Adds an entry to the game history log in the sidebar
function addLogEntry(question, result, type) {
    const entryHtml = `
        <div class="log-entry ${type}">
            <strong>${question}</strong><br>
            <span>${result}</span>
        </div>
    `;
    $('#game-log').prepend(entryHtml);
}

// Advances to the next round when "Next Location" is clicked
function nextRound() {
    $('#feedback-modal').hide();
    currentRound++;
    loadRound();
}

function updateScoreBoard() {
    $('#score-display').text(baseScore);
    $('#points-display').text(points);
    $('#round-display').text(currentRound + 1);
}

function endGame(reason = "Game Over!", abandoned = false) {
    gameActive = false;
    canClick = false;
    stopTimer();

    // Final Score Formula: Points (Correct * 100) + Remaining Seconds
    // If abandoned, timer bonus is 0
    const finalScore = points + (abandoned ? 0 : Math.max(0, timer));

    if (finalScore > highScore) {
        highScore = finalScore;
        localStorage.setItem('csunMapHighScore', highScore);
        $('#high-score-display').text(highScore);
    }

    $('#target-location').text(reason);
    const bonusText = abandoned ? "No Bonus (Quit Early)" : `${timer}s Bonus`;
    addLogEntry("Final Result", `Score: ${finalScore} (${baseScore} Correct + ${bonusText})`, "neutral");

    $('#feedback-modal').hide(); // Hide feedback UI so it doesn't block
    alert(`${reason}\nFinal Score: ${finalScore}\nCorrect: ${baseScore}/5\nPoints: ${points}\nTime Bonus: ${abandoned ? 0 : timer}s`);

    $('#start-btn').removeClass('hidden').text("Play Again");
    $('#end-early-btn').addClass('hidden');
}

const { ipcRenderer } = require('electron');

let timerCounter = 0;

const SECONDS_IN_MINUTE = 60;
const MILLISECONDS_IN_SECOND = 1000;
const DEFAULT_MAIN_TIMER_MINUTES = 30;
const DEFAULT_SECONDARY_TIMER_MINUTES = 10;
const DEFAULT_NEW_TIMER_MINUTES = 5;

// Audio constants
const BEEP_COUNT = 3;
const BASE_FREQUENCY_HZ = 800;
const FREQUENCY_STEP_HZ = 100;
const MAX_VOLUME = 0.5;
const BEEP_START_DELAY_SECONDS = 0.4;
const BEEP_DURATION_SECONDS = 0.3;
const FADE_DURATION_SECONDS = 0.05;


// SVG Icons
const ICONS = {
    PLAY: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    PAUSE: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    RESET: '<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    EDIT: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    SAVE: '<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>',
    REMOVE: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    GRID: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor"/></svg>',
    LIST: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="3" rx="1.5" fill="currentColor"/><rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="currentColor"/><rect x="3" y="17" width="18" height="3" rx="1.5" fill="currentColor"/></svg>'
};

const activeTimers = new Set();
let currentView = localStorage.getItem('timerViewPreference') || 'list';

function updateViewUI() {
    const container = document.getElementById('timers-container');
    const icon = document.getElementById('view-icon');
    
    if (currentView === 'grid') {
        container.classList.add('grid-view');
        icon.innerHTML = ICONS.LIST;
    } else {
        container.classList.remove('grid-view');
        icon.innerHTML = ICONS.GRID;
    }
}

// Initial View Load
updateViewUI();

function syncRemoveButtons() {
    const isOnlyOne = activeTimers.size <= 1;
    activeTimers.forEach(timer => {
        timer.elements.removeBtn.disabled = isOnlyOne;
        timer.elements.removeBtn.style.opacity = isOnlyOne ? '0.1' : '0.4';
        timer.elements.removeBtn.style.pointerEvents = isOnlyOne ? 'none' : 'auto';
    });
}

// Descriptive Label Formatter
function formatTimeLabel(totalSeconds) {
    if (totalSeconds <= 0) return "Zero Time Timer";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];

    // Special case for exactly 1 hour or multiple hours without minutes/seconds
    if (hours > 0 && minutes === 0 && seconds === 0) {
        return `${hours} Hour Timer`;
    }

    if (hours > 0) {
        parts.push(`${hours} Hr`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} Minute`);
    }

    if (seconds > 0) {
        parts.push(`${seconds} Second`);
    }

    return `${parts.join(' ')} Timer`;
}

class Timer {
    constructor(defaultMinutes) {
        timerCounter++;
        this.id = timerCounter;
        this.defaultTimeInSeconds = defaultMinutes * SECONDS_IN_MINUTE;
        this.timeLeftInSeconds = this.defaultTimeInSeconds;
        this.intervalId = null;
        this.isRunning = false;
        this.isEditing = false;
        activeTimers.add(this);

        this.createDOM();
        this.updateDisplay();
        this.addEventListeners();
        syncRemoveButtons();
    }

    createDOM() {
        this.container = document.createElement('div');
        this.container.className = 'timer-card';
        this.container.innerHTML = `
            <button class="remove-btn" title="Remove Timer">${ICONS.REMOVE}</button>
            <div class="timer-label">${formatTimeLabel(this.defaultTimeInSeconds)}</div>
            <div class="time-display-container">
                <div class="time-display">00:00</div>
                <div class="edit-inputs" style="display: none;">
                    <input type="number" class="input-minutes" min="0" max="999"><span>:</span>
                    <input type="number" class="input-seconds" min="0" max="59">
                </div>
            </div>
            <div class="controls">
                <button class="btn start-btn" title="Start/Pause">${ICONS.PLAY}</button>
                <button class="btn reset-btn" title="Reset">${ICONS.RESET}</button>
                <button class="btn edit-btn" title="Edit/Save">${ICONS.EDIT}</button>
            </div>
        `;

        document.getElementById('timers-container').appendChild(this.container);

        this.elements = {
            removeBtn: this.container.querySelector('.remove-btn'),
            label: this.container.querySelector('.timer-label'),
            display: this.container.querySelector('.time-display'),
            displayContainer: this.container.querySelector('.time-display-container'),
            editInputs: this.container.querySelector('.edit-inputs'),
            startBtn: this.container.querySelector('.start-btn'),
            resetBtn: this.container.querySelector('.reset-btn'),
            editBtn: this.container.querySelector('.edit-btn'),
            inputMinutesElement: this.container.querySelector('.input-minutes'),
            inputSecondsElement: this.container.querySelector('.input-seconds')
        };
    }

    updateDisplay() {
        const displayMinutes = Math.floor(this.timeLeftInSeconds / SECONDS_IN_MINUTE);
        const displaySeconds = this.timeLeftInSeconds % SECONDS_IN_MINUTE;
        this.elements.display.textContent = `${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
    }

    updateLabel() {
        this.elements.label.textContent = formatTimeLabel(this.defaultTimeInSeconds);
    }

    addEventListeners() {
        this.elements.removeBtn.addEventListener('click', () => this.destroy());
        this.elements.startBtn.addEventListener('click', () => this.toggle());
        
        // Clicking digits directly enters edit mode
        this.elements.display.addEventListener('click', () => {
            if (!this.isRunning) this.enterEditMode();
        });

        this.elements.resetBtn.addEventListener('click', () => this.reset());
        
        this.elements.editBtn.addEventListener('click', () => {
            if (this.isEditing) {
                this.saveEdit();
            } else {
                this.enterEditMode();
            }
        });

        // Save on Enter key in inputs
        const handleEnter = (e) => {
            if (e.key === 'Enter') this.saveEdit();
        };
        this.elements.inputMinutesElement.addEventListener('keydown', handleEnter);
        this.elements.inputSecondsElement.addEventListener('keydown', handleEnter);
    }

    enterEditMode() {
        if (this.isRunning || this.isEditing) return;
        this.isEditing = true;
        this.pause();

        const currentMinutes = Math.floor(this.defaultTimeInSeconds / SECONDS_IN_MINUTE);
        const currentSeconds = this.defaultTimeInSeconds % SECONDS_IN_MINUTE;

        this.elements.inputMinutesElement.value = currentMinutes;
        this.elements.inputSecondsElement.value = currentSeconds;

        this.elements.display.style.display = 'none';
        this.elements.editInputs.style.display = 'flex';
        this.elements.editBtn.innerHTML = ICONS.SAVE;
        this.elements.startBtn.style.opacity = '0.3';
        this.elements.startBtn.style.pointerEvents = 'none';
        
        this.elements.inputMinutesElement.focus();
    }

    saveEdit() {
        if (!this.isEditing) return;
        
        const inputMinutes = parseInt(this.elements.inputMinutesElement.value) || 0;
        const inputSeconds = parseInt(this.elements.inputSecondsElement.value) || 0;
        
        this.defaultTimeInSeconds = (inputMinutes * SECONDS_IN_MINUTE) + inputSeconds;
        this.timeLeftInSeconds = this.defaultTimeInSeconds;
        
        this.exitEditMode();
        this.updateLabel();
        this.updateDisplay();
    }

    exitEditMode() {
        this.isEditing = false;
        this.elements.display.style.display = 'block';
        this.elements.editInputs.style.display = 'none';
        this.elements.editBtn.innerHTML = ICONS.EDIT;
        this.elements.startBtn.style.opacity = '1';
        this.elements.startBtn.style.pointerEvents = 'auto';
    }

    toggle() {
        if (this.isEditing) return;
        if (this.isRunning) {
            this.pause();
        } else {
            if (this.timeLeftInSeconds <= 0) this.reset();
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.elements.startBtn.innerHTML = ICONS.PAUSE;
        this.elements.display.classList.remove('blink');
        
        this.intervalId = setInterval(() => {
            this.timeLeftInSeconds--;
            if (this.timeLeftInSeconds <= 0) {
                this.timeLeftInSeconds = 0;
                this.updateDisplay();
                this.timeOver();
            } else {
                this.updateDisplay();
            }
        }, MILLISECONDS_IN_SECOND);
    }

    pause() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        this.elements.startBtn.innerHTML = ICONS.PLAY;
    }

    reset() {
        this.pause();
        this.timeLeftInSeconds = this.defaultTimeInSeconds;
        this.elements.display.classList.remove('blink');
        this.updateDisplay();
    }

    timeOver() {
        this.pause();
        this.elements.display.classList.add('blink');
        playAlarm();
    }
    
    destroy() {
        if (activeTimers.size <= 1) return;
        
        this.pause();
        this.container.remove();
        activeTimers.delete(this);
        syncRemoveButtons();
    }
}



// AudioContext for soft alarm sound
function playAlarm() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Play successive soft beeps
        for (let beepIndex = 0; beepIndex < BEEP_COUNT; beepIndex++) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'sine';
            const frequencyForCurrentBeep = BASE_FREQUENCY_HZ + (beepIndex * FREQUENCY_STEP_HZ);
            oscillator.frequency.setValueAtTime(frequencyForCurrentBeep, audioContext.currentTime);
            
            const startPlaybackTime = audioContext.currentTime + (beepIndex * BEEP_START_DELAY_SECONDS);
            const stopPlaybackTime = startPlaybackTime + BEEP_DURATION_SECONDS;
            
            // Fade-in
            gainNode.gain.setValueAtTime(0, startPlaybackTime);
            gainNode.gain.linearRampToValueAtTime(MAX_VOLUME, startPlaybackTime + FADE_DURATION_SECONDS);
            // Fade-out
            gainNode.gain.setValueAtTime(MAX_VOLUME, stopPlaybackTime - FADE_DURATION_SECONDS);
            gainNode.gain.linearRampToValueAtTime(0, stopPlaybackTime);
            
            oscillator.start(startPlaybackTime);
            oscillator.stop(stopPlaybackTime);
        }
    } catch (playbackError) {
        console.error("Audio playback failed", playbackError);
    }
}

// Initialize default timers
new Timer(DEFAULT_MAIN_TIMER_MINUTES);
new Timer(DEFAULT_SECONDARY_TIMER_MINUTES);

// System Time Updater
function updateSystemTime() {
    const timeDisplay = document.getElementById('system-time');
    if (timeDisplay) {
        // System format time (e.g. 4:05 PM or 16:05 depending on OS local settings)
        timeDisplay.textContent = new Date().toLocaleTimeString();
    }
}

// Start system clock
setInterval(updateSystemTime, MILLISECONDS_IN_SECOND);
updateSystemTime();

// Window controls
document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

document.getElementById('add-btn').addEventListener('click', () => {
    new Timer(DEFAULT_NEW_TIMER_MINUTES); 
});

document.getElementById('view-toggle-btn').addEventListener('click', () => {
    currentView = currentView === 'list' ? 'grid' : 'list';
    localStorage.setItem('timerViewPreference', currentView);
    updateViewUI();
});

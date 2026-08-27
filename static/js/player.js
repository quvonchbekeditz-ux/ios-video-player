// iOS Super Video Player - Player Engine & Audio Studio (player.js) - Part 1

let videoEl = null;
let currentMedia = null;
let currentPlaylist = [];
let currentPlaylistIdx = 0;
let isPlaying = false;
let showRemainingTime = false;
let lastSavedTime = 0;

// Aspect Ratio, Transforms & Zoom
let aspectMode = 'fit';
let zoomScale = 1.0;
let panX = 0, panY = 0;
let isPanning = false, panStartX = 0, panStartY = 0;
let videoRotation = 0;
let isVideoFlipped = false;

// A-B Loop
let loopA = null;
let loopB = null;

// Sleep Timer
let sleepTimerId = null;

// Video Filters
let filterValues = {
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0
};

// Web Audio API State
let audioCtx = null;
let audioSourceNode = null;
let eqBands = [];
let boostGainNode = null;
let compressorNode = null;
let audioDelayNode = null;
let isAudioInitialized = false;

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Subtitles State
let subtitleCues = [];
let currentSubtitleOffset = 0.0;
let subtitleSize = 22;
let subtitleBg = 'glass';

document.addEventListener('DOMContentLoaded', () => {
    videoEl = document.getElementById('mainVideo');
    initVideoEvents();
    initKeyboardShortcuts();
    initGestureControls();
    initEqSlidersUI();
});

// Initialize Video Element Events
function initVideoEvents() {
    if (!videoEl) return;

    videoEl.addEventListener('play', () => {
        isPlaying = true;
        updatePlayPauseUI();
        initAudioEngineIfNeeded();
    });

    videoEl.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayPauseUI();
    });

    videoEl.addEventListener('timeupdate', () => {
        updateTimelineProgress();
        checkABLoop();
        renderSubtitlesAtTime(videoEl.currentTime);
        savePlaybackProgress();
    });

    videoEl.addEventListener('progress', () => {
        updateBufferedProgress();
    });

    videoEl.addEventListener('loadedmetadata', () => {
        document.getElementById('totalDurationLabel').textContent = formatTime(videoEl.duration);
        restorePlaybackProgress();
    });

    videoEl.addEventListener('ended', () => {
        handleVideoEnded();
    });
}

// Web Audio API Initialization
function initAudioEngineIfNeeded() {
    if (isAudioInitialized || !videoEl) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        audioCtx = new AudioContextClass();
        audioSourceNode = audioCtx.createMediaElementSource(videoEl);

        // 10-Band EQ Filters
        let lastNode = audioSourceNode;
        eqBands = EQ_FREQUENCIES.map(freq => {
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.4;
            filter.gain.value = 0;
            lastNode.connect(filter);
            lastNode = filter;
            return filter;
        });

        // Boost Gain Node (up to 300%)
        boostGainNode = audioCtx.createGain();
        boostGainNode.gain.value = 1.0;
        lastNode.connect(boostGainNode);
        lastNode = boostGainNode;

        // Dynamics Compressor (Night Mode)
        compressorNode = audioCtx.createDynamicsCompressor();
        compressorNode.threshold.value = -24;
        compressorNode.knee.value = 30;
        compressorNode.ratio.value = 12;
        compressorNode.attack.value = 0.003;
        compressorNode.release.value = 0.25;

        // Connect to destination
        lastNode.connect(audioCtx.destination);
        isAudioInitialized = true;
    } catch (e) {
        console.warn('Web Audio init skipped:', e);
    }
}

// Open and Close Player
async function openPlayer(video, playlist = [], index = 0, startTime = null) {
    currentMedia = video;
    currentPlaylist = playlist.length ? playlist : [video];
    currentPlaylistIdx = index >= 0 ? index : 0;

    // Immediately record into watch history
    let hist = getStorage('history', {});
    if (!hist[video.path]) {
        hist[video.path] = {
            time: 0,
            duration: 0,
            size: video.size || 0,
            timestamp: Date.now() / 1000
        };
    } else {
        hist[video.path].timestamp = Date.now() / 1000;
    }
    setStorage('history', hist);

    const overlay = document.getElementById('playerOverlay');
    overlay.classList.remove('pointer-events-none', 'opacity-0', 'scale-95');
    overlay.classList.add('opacity-100', 'scale-100');

    document.getElementById('playerVideoTitle').textContent = video.name;
    document.getElementById('playerResBadge').textContent = (video.ext || 'HD').replace('.', '').toUpperCase();

    videoEl.src = '/api/video?path=' + encodeURIComponent(video.path);
    videoEl.load();
    
    if (startTime !== null && startTime > 0) {
        videoEl.onloadedmetadata = () => {
            videoEl.currentTime = startTime;
            videoEl.play().catch(() => {});
            showDynamicIsland('bookmark', `Xatcho'pdan ijro: ${formatTime(startTime)}`);
            videoEl.onloadedmetadata = null;
        };
    } else {
        videoEl.play().catch(() => {});
    }

    resetTransforms();
    clearABRepeat();

    loadSubtitlesForVideo(video.path);
    fetchVideoMetadata(video.path);

    showDynamicIsland('play', video.name.substring(0, 24));
}

function closePlayer() {
    const overlay = document.getElementById('playerOverlay');
    overlay.classList.remove('opacity-100', 'scale-100');
    overlay.classList.add('pointer-events-none', 'opacity-0', 'scale-95');

    if (videoEl) {
        videoEl.pause();
    }
    renderExplorer();
}

function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
        videoEl.play();
        showDynamicIsland('play', 'Ijro');
    } else {
        videoEl.pause();
        showDynamicIsland('pause', 'Pauza');
    }
}

function updatePlayPauseUI() {
    const icon = document.getElementById('playPauseIcon');
    if (icon) {
        icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
        if (window.lucide) lucide.createIcons();
    }
}

function seekRelative(seconds) {
    if (!videoEl || isNaN(videoEl.duration)) return;
    videoEl.currentTime = Math.min(videoEl.duration, Math.max(0, videoEl.currentTime + seconds));
    
    if (seconds < 0) {
        triggerRipple('rippleLeft');
    } else {
        triggerRipple('rippleRight');
    }
}

function triggerRipple(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 600);
}

function seekTimeline(e) {
    if (!videoEl || isNaN(videoEl.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = percent * videoEl.duration;
}

function handleTimelineHover(e) {
    if (!videoEl || isNaN(videoEl.duration)) return;
    const box = document.getElementById('hoverPreviewBox');
    const timeLabel = document.getElementById('hoverPreviewTime');
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const hoverTime = percent * videoEl.duration;

    box.style.left = `${e.clientX - rect.left}px`;
    box.classList.add('visible');
    timeLabel.textContent = formatTime(hoverTime);
}

function hideTimelinePreview() {
    document.getElementById('hoverPreviewBox').classList.remove('visible');
}

function updateTimelineProgress() {
    if (!videoEl || isNaN(videoEl.duration)) return;
    const cur = videoEl.currentTime;
    const dur = videoEl.duration;
    const pct = (cur / dur) * 100;

    document.getElementById('timelineProgress').style.width = `${pct}%`;
    document.getElementById('timelineThumb').style.left = `${pct}%`;

    const curLabel = document.getElementById('currentTimeLabel');
    if (showRemainingTime) {
        curLabel.textContent = '-' + formatTime(Math.max(0, dur - cur));
    } else {
        curLabel.textContent = formatTime(cur);
    }
}

function updateBufferedProgress() {
    if (!videoEl || isNaN(videoEl.duration) || videoEl.buffered.length === 0) return;
    const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
    const pct = (bufferedEnd / videoEl.duration) * 100;
    document.getElementById('timelineBuffered').style.width = `${pct}%`;
}

function toggleTimeDisplayMode() {
    showRemainingTime = !showRemainingTime;
    updateTimelineProgress();
}

function stepFrame(frames = 1) {
    if (!videoEl) return;
    videoEl.pause();
    const fps = 24.0;
    videoEl.currentTime = Math.max(0, videoEl.currentTime + (frames / fps));
    showDynamicIsland('film', `${frames > 0 ? '+' : ''}${frames} Frame`);
}


﻿// iOS Super Video Player - Player Engine (player.js) - Part 2

function toggleABRepeat() {
    if (!videoEl) return;
    const cur = videoEl.currentTime;
    const btnStatus = document.getElementById('abRepeatStatus');
    const rangeBar = document.getElementById('timelineLoopRange');

    if (loopA === null) {
        loopA = cur;
        btnStatus.textContent = 'Set B';
        btnStatus.className = 'text-[10px] text-ios-yellow font-bold';
        showDynamicIsland('repeat', `A Nuqta: ${formatTime(loopA)}`);
    } else if (loopB === null) {
        if (cur <= loopA) {
            showDynamicIsland('alert-circle', 'B nuqta A dan keyin bo\'lishi kerak');
            return;
        }
        loopB = cur;
        btnStatus.textContent = 'Active';
        btnStatus.className = 'text-[10px] text-ios-green font-bold';
        
        const dur = videoEl.duration;
        const leftPct = (loopA / dur) * 100;
        const widthPct = ((loopB - loopA) / dur) * 100;
        rangeBar.style.left = `${leftPct}%`;
        rangeBar.style.width = `${widthPct}%`;
        rangeBar.classList.remove('hidden');

        showDynamicIsland('repeat', `A-B Loop: ${formatTime(loopA)} - ${formatTime(loopB)}`);
    } else {
        clearABRepeat();
        showDynamicIsland('repeat', 'A-B Loop O\'chirildi');
    }
}

function clearABRepeat() {
    loopA = null;
    loopB = null;
    document.getElementById('abRepeatStatus').textContent = 'Off';
    document.getElementById('abRepeatStatus').className = 'text-[10px] text-white/40';
    document.getElementById('timelineLoopRange').classList.add('hidden');
}

function checkABLoop() {
    if (loopA !== null && loopB !== null && videoEl) {
        if (videoEl.currentTime >= loopB || videoEl.currentTime < loopA) {
            videoEl.currentTime = loopA;
        }
    }
}

function playNextInPlaylist() {
    if (currentPlaylistIdx < currentPlaylist.length - 1) {
        openPlayer(currentPlaylist[currentPlaylistIdx + 1], currentPlaylist, currentPlaylistIdx + 1);
    } else {
        showDynamicIsland('list-end', 'Pleylist oxiri');
    }
}

function playPreviousInPlaylist() {
    if (currentPlaylistIdx > 0) {
        openPlayer(currentPlaylist[currentPlaylistIdx - 1], currentPlaylist, currentPlaylistIdx - 1);
    }
}

let nextCountdownTimer = null;
function handleVideoEnded() {
    if (currentPlaylistIdx < currentPlaylist.length - 1) {
        const nextVideo = currentPlaylist[currentPlaylistIdx + 1];
        const card = document.getElementById('nextEpisodeCard');
        const nextTitle = document.getElementById('nextVideoTitle');
        const countdownSec = document.getElementById('nextCountdownSec');

        nextTitle.textContent = nextVideo.name;
        card.classList.remove('hidden');

        let leftSec = 5;
        countdownSec.textContent = leftSec;
        clearInterval(nextCountdownTimer);
        nextCountdownTimer = setInterval(() => {
            leftSec--;
            countdownSec.textContent = leftSec;
            if (leftSec <= 0) {
                clearInterval(nextCountdownTimer);
                card.classList.add('hidden');
                playNextInPlaylist();
            }
        }, 1000);
    }
}

function cancelNextEpisode() {
    clearInterval(nextCountdownTimer);
    document.getElementById('nextEpisodeCard').classList.add('hidden');
}

function playNextEpisodeNow() {
    clearInterval(nextCountdownTimer);
    document.getElementById('nextEpisodeCard').classList.add('hidden');
    playNextInPlaylist();
}

function changeVolume(val) {
    const num = parseFloat(val);
    if (!videoEl) return;

    if (num <= 1.0) {
        videoEl.volume = num;
        if (boostGainNode) boostGainNode.gain.value = 1.0;
    } else {
        videoEl.volume = 1.0;
        if (boostGainNode) boostGainNode.gain.value = num;
    }

    const pct = Math.round(num * 100);
    showDynamicIsland('volume-2', `Ovoz: ${pct}%`, pct);
    updateVolumeIcon(num);
}

function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    showDynamicIsland(videoEl.muted ? 'volume-x' : 'volume-2', videoEl.muted ? 'Ovoz O\'chirildi' : 'Ovoz Yoqildi');
    updateVolumeIcon(videoEl.muted ? 0 : videoEl.volume);
}

function updateVolumeIcon(vol) {
    const icon = document.getElementById('volumeIcon');
    if (!icon) return;
    if (vol === 0 || (videoEl && videoEl.muted)) {
        icon.setAttribute('data-lucide', 'volume-x');
    } else if (vol < 0.5) {
        icon.setAttribute('data-lucide', 'volume-1');
    } else {
        icon.setAttribute('data-lucide', 'volume-2');
    }
    if (window.lucide) lucide.createIcons();
}

function changeBoost(val) {
    const num = parseFloat(val);
    document.getElementById('boostValLabel').textContent = Math.round(num * 100) + '%';
    if (boostGainNode) {
        boostGainNode.gain.value = num;
    }
    showDynamicIsland('zap', `Boost: ${Math.round(num * 100)}%`);
}

function initEqSlidersUI() {
    const grid = document.getElementById('eqSlidersGrid');
    if (!grid) return;
    grid.innerHTML = '';

    EQ_FREQUENCIES.forEach((freq, idx) => {
        const label = freq >= 1000 ? (freq / 1000) + 'kHz' : freq + 'Hz';
        const col = document.createElement('div');
        col.className = 'flex flex-col items-center gap-2 h-full justify-between';
        col.innerHTML = `
            <span class="text-[10px] text-white/40 font-mono" id="eqVal${idx}">0dB</span>
            <input type="range" min="-12" max="12" step="1" value="0" orient="vertical" oninput="changeEqBand(${idx}, this.value)" class="h-28 -rotate-90 origin-center w-28">
            <span class="text-[10px] text-white/70 font-semibold">${label}</span>
        `;
        grid.appendChild(col);
    });
}

function changeEqBand(bandIdx, gainVal) {
    const g = parseFloat(gainVal);
    document.getElementById(`eqVal${bandIdx}`).textContent = `${g > 0 ? '+' : ''}${g}dB`;
    if (eqBands[bandIdx]) {
        eqBands[bandIdx].gain.value = g;
    }
}

function setEqPreset(preset) {
    document.querySelectorAll('.eq-preset-btn').forEach(btn => btn.classList.remove('active', 'bg-white/20'));
    if (window.event && window.event.target) window.event.target.classList.add('active', 'bg-white/20');

    const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
        vocal: [-2, -1, 0, 3, 6, 6, 4, 2, 0, -1],
        cinema: [4, 3, 1, -1, 2, 4, 5, 4, 3, 2],
        rock: [5, 4, 2, -1, -2, 0, 2, 4, 5, 6],
        night: [2, 2, 1, 3, 4, 4, 2, 0, -2, -4]
    };

    const gains = presets[preset] || presets.flat;
    gains.forEach((g, i) => changeEqBand(i, g));
    showDynamicIsland('sliders', `EQ: ${preset.toUpperCase()}`);
}

function changeAudioDelay(val) {
    const s = parseFloat(val);
    document.getElementById('audioDelayValLabel').textContent = `${s > 0 ? '+' : ''}${s.toFixed(1)}s`;
    currentSubtitleOffset = -s;
}

function adjustAudioDelay(delta) {
    const cur = parseFloat(document.getElementById('audioDelayValLabel').textContent);
    changeAudioDelay(cur + delta);
}

function setSpeed(rate) {
    if (!videoEl) return;
    videoEl.playbackRate = rate;
    document.getElementById('speedIndicatorBtn').textContent = rate.toFixed(1) + 'x';
    document.getElementById('customSpeedLabel').textContent = rate.toFixed(1) + 'x';
    showDynamicIsland('gauge', `Tezlik: ${rate.toFixed(1)}x`);
}


﻿// iOS Super Video Player - Player Engine (player.js) - Part 3

async function loadSubtitlesForVideo(videoPath) {
    const select = document.getElementById('subtitleSelect');
    select.innerHTML = '<option value="none">Subtitr o\'chirilgan (None)</option>';
    subtitleCues = [];

    try {
        const res = await fetch('/api/subtitles?path=' + encodeURIComponent(videoPath));
        const data = await res.json();
        
        if (data.subtitles && data.subtitles.length > 0) {
            data.subtitles.forEach((sub, idx) => {
                const opt = document.createElement('option');
                opt.value = sub.path;
                opt.textContent = sub.name;
                select.appendChild(opt);
                if (idx === 0) {
                    select.value = sub.path;
                    fetchAndParseSubtitle(sub.path);
                }
            });
        }
    } catch (e) {
        console.error('Subtitle load error:', e);
    }
}

function selectSubtitleTrack(subPath) {
    if (subPath === 'none') {
        subtitleCues = [];
        document.getElementById('subtitleText').textContent = '';
        renderTranscript([]);
    } else {
        fetchAndParseSubtitle(subPath);
    }
}

async function fetchAndParseSubtitle(subPath) {
    try {
        const res = await fetch('/api/subtitles?sub_path=' + encodeURIComponent(subPath));
        const vttText = await res.text();
        subtitleCues = parseVTT(vttText);
        renderTranscript(subtitleCues);
        showDynamicIsland('subtitles', 'Subtitr yuklandi');
    } catch (e) {
        console.error('VTT parse error:', e);
    }
}

function parseVTT(text) {
    const lines = text.split(/\r?\n/);
    const cues = [];
    let start = null, end = null, payload = [];

    const timeRegex = /((?:\d+:)?\d+:\d+(?:[\.,]\d+)?)\s*-->\s*((?:\d+:)?\d+:\d+(?:[\.,]\d+)?)/;

    lines.forEach(line => {
        const m = line.match(timeRegex);
        if (m) {
            if (start !== null && payload.length > 0) {
                cues.push({ start, end, text: payload.join(' ') });
                payload = [];
            }
            start = parseTimestamp(m[1]);
            end = parseTimestamp(m[2]);
        } else if (start !== null && line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && isNaN(line.trim())) {
            payload.push(line.trim());
        }
    });

    if (start !== null && payload.length > 0) {
        cues.push({ start, end, text: payload.join(' ') });
    }
    return cues;
}

function parseTimestamp(timeStr) {
    const parts = timeStr.replace(',', '.').split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return 0;
}

function renderSubtitlesAtTime(currentTime) {
    const textEl = document.getElementById('subtitleText');
    if (!subtitleCues.length) {
        textEl.textContent = '';
        return;
    }

    const adjustedTime = currentTime + currentSubtitleOffset;
    const activeCue = subtitleCues.find(c => adjustedTime >= c.start && adjustedTime <= c.end);

    if (activeCue) {
        textEl.textContent = activeCue.text;
        textEl.style.fontSize = subtitleSize + 'px';
        highlightActiveTranscriptCue(activeCue);
    } else {
        textEl.textContent = '';
    }
}

function renderTranscript(cues) {
    const container = document.getElementById('transcriptContainer');
    const countEl = document.getElementById('transcriptLinesCount');
    container.innerHTML = '';
    countEl.textContent = cues.length + ' ta jumla';

    if (!cues.length) {
        container.innerHTML = '<div class="text-center py-8 text-xs text-white/40">Subtitr yuklanganda barcha matnlar bu yerda ko\'rinadi.</div>';
        return;
    }

    cues.forEach((cue, idx) => {
        const row = document.createElement('div');
        row.id = `transcriptCue_${idx}`;
        row.className = 'p-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white cursor-pointer transition flex items-start gap-2.5 group';
        row.onclick = () => {
            if (videoEl) videoEl.currentTime = cue.start;
        };
        row.innerHTML = `
            <span class="text-[10px] font-mono text-ios-yellow flex-shrink-0 pt-0.5 group-hover:underline">${formatTime(cue.start)}</span>
            <span class="leading-relaxed">${cue.text}</span>
        `;
        container.appendChild(row);
    });
}

function highlightActiveTranscriptCue(cue) {
    const idx = subtitleCues.indexOf(cue);
    if (idx < 0) return;
    const el = document.getElementById(`transcriptCue_${idx}`);
    if (el && !el.classList.contains('bg-white/15')) {
        document.querySelectorAll('#transcriptContainer > div').forEach(d => d.classList.remove('bg-white/15', 'text-white'));
        el.classList.add('bg-white/15', 'text-white');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function changeSubtitleSize(size) {
    subtitleSize = parseInt(size);
    document.getElementById('subtitleText').style.fontSize = size + 'px';
}

function adjustSubSync(delta) {
    currentSubtitleOffset += delta;
    document.getElementById('subSyncLabel').textContent = `${currentSubtitleOffset > 0 ? '+' : ''}${currentSubtitleOffset.toFixed(1)}s`;
    showDynamicIsland('clock', `Subtitr sinx: ${currentSubtitleOffset.toFixed(1)}s`);
}

function uploadCustomSubtitle(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        subtitleCues = parseVTT(text);
        renderTranscript(subtitleCues);
        showDynamicIsland('subtitles', file.name);
    };
    reader.readAsText(file);
}

function applyVideoFilters() {
    if (!videoEl) return;
    const b = document.getElementById('filterBrightness').value;
    const c = document.getElementById('filterContrast').value;
    const s = document.getElementById('filterSaturation').value;

    filterValues = { brightness: b, contrast: c, saturation: s };
    videoEl.style.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function setVideoFilterPreset(preset) {
    const b = document.getElementById('filterBrightness');
    const c = document.getElementById('filterContrast');
    const s = document.getElementById('filterSaturation');

    if (preset === 'normal') {
        b.value = 1.0; c.value = 1.0; s.value = 1.0;
    } else if (preset === 'nightshift') {
        b.value = 0.95; c.value = 1.05; s.value = 1.3;
    } else if (preset === 'hdr') {
        b.value = 1.1; c.value = 1.25; s.value = 1.4;
    } else if (preset === 'bw') {
        b.value = 1.05; c.value = 1.2; s.value = 0.0;
    }
    applyVideoFilters();
    showDynamicIsland('sparkles', `Filtr: ${preset.toUpperCase()}`);
}

function resetVideoFilters() {
    setVideoFilterPreset('normal');
    resetTransforms();
}

function rotateVideo(delta = 90) {
    videoRotation = (videoRotation + delta) % 360;
    applyTransforms();
    showDynamicIsland('rotate-cw', `Burilish: ${videoRotation}°`);
}

function toggleVideoFlip() {
    isVideoFlipped = !isVideoFlipped;
    applyTransforms();
    showDynamicIsland('flip-horizontal', isVideoFlipped ? 'Ko\'zgu Yoqildi' : 'Ko\'zgu O\'chirildi');
}

function changeVideoZoom(val) {
    zoomScale = parseFloat(val);
    applyTransforms();
}

function applyTransforms() {
    if (!videoEl) return;
    const flip = isVideoFlipped ? 'scaleX(-1)' : '';
    videoEl.style.transform = `rotate(${videoRotation}deg) scale(${zoomScale}) ${flip} translate(${panX}px, ${panY}px)`;
}

function resetTransforms() {
    videoRotation = 0;
    isVideoFlipped = false;
    zoomScale = 1.0;
    panX = 0;
    panY = 0;
    applyTransforms();
}

function cycleAspectRatio() {
    const modes = ['fit', 'fill', '16-9', '4-3', '21-9', 'stretch'];
    const curIdx = modes.indexOf(aspectMode);
    aspectMode = modes[(curIdx + 1) % modes.length];

    videoEl.className = 'max-w-full max-h-full transition-all duration-200 video-' + aspectMode;
    document.getElementById('aspectRatioBtn').textContent = aspectMode.toUpperCase();
    showDynamicIsland('maximize-2', `Nisbat: ${aspectMode.toUpperCase()}`);
}

async function takeScreenshot() {
    if (!videoEl) return;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 1920;
        canvas.height = videoEl.videoHeight || 1080;
        const ctx = canvas.getContext('2d');

        if (isVideoFlipped) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/png');
        const filename = `Screenshot_${Date.now()}.png`;

        await fetch('/api/save_screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl, filename: filename })
        });

        if (navigator.clipboard && window.ClipboardItem) {
            canvas.toBlob(blob => {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
            });
        }

        showDynamicIsland('camera', 'HD Skrinshot Saqlandi!');
    } catch (e) {
        console.error('Screenshot error:', e);
    }
}

function quickAddBookmark() {
    if (!videoEl || !currentMedia) return;
    const cur = videoEl.currentTime;
    let bms = getStorage('bookmarks', []);
    bms.push({
        path: currentMedia.path,
        title: currentMedia.name,
        time: cur,
        created: Date.now() / 1000
    });
    setStorage('bookmarks', bms);
    showDynamicIsland('bookmark', `Xatcho'p: ${formatTime(cur)}`);
}

function setSleepTimer(minutes) {
    clearTimeout(sleepTimerId);
    closeModal('sleepTimerModal');

    if (minutes === 0) {
        showDynamicIsland('moon', 'Uyqu taymeri o\'chirildi');
    } else if (minutes === -1) {
        showDynamicIsland('moon', 'Video tugaganda o\'chadi');
    } else {
        showDynamicIsland('moon', `${minutes} daqiqa taymer o'rnatildi`);
        sleepTimerId = setTimeout(() => {
            if (videoEl) videoEl.pause();
            showDynamicIsland('moon', 'Uyqu vaqti bo\'ldi');
        }, minutes * 60 * 1000);
    }
}

function togglePiP() {
    if (!videoEl) return;
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
    } else if (videoEl.requestPictureInPicture) {
        videoEl.requestPictureInPicture().catch(() => {});
    }
}

function toggleFullscreen() {
    const overlay = document.getElementById('playerOverlay');
    if (!document.fullscreenElement) {
        overlay.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

function initGestureControls() {
    const viewport = document.getElementById('videoViewport');
    if (!viewport) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let dragType = null;

    viewport.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        dragType = null;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !videoEl) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!dragType && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            const rect = viewport.getBoundingClientRect();
            if (Math.abs(dy) > Math.abs(dx)) {
                dragType = startX < rect.left + rect.width / 2 ? 'brightness' : 'volume';
            } else {
                dragType = 'seek';
            }
        }

        if (dragType === 'brightness') {
            const b = Math.min(1.8, Math.max(0.5, filterValues.brightness - dy * 0.005));
            document.getElementById('filterBrightness').value = b;
            applyVideoFilters();
            showDynamicIsland('sun', `Yorqinlik: ${Math.round(b * 100)}%`);
        } else if (dragType === 'volume') {
            const v = Math.min(3.0, Math.max(0.0, videoEl.volume - dy * 0.01));
            changeVolume(v);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        dragType = null;
    });

    viewport.addEventListener('dblclick', (e) => {
        const rect = viewport.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width * 0.35) {
            seekRelative(-10);
        } else if (x > rect.width * 0.65) {
            seekRelative(10);
        } else {
            cycleAspectRatio();
        }
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        zoomScale = Math.min(3.0, Math.max(0.5, zoomScale + delta));
        applyTransforms();
        showDynamicIsland('zoom-in', `Zoom: ${Math.round(zoomScale * 100)}%`);
    }, { passive: false });
}

function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        switch (e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlay();
                break;
            case 'arrowleft':
                e.preventDefault();
                seekRelative(-10);
                break;
            case 'arrowright':
                e.preventDefault();
                seekRelative(10);
                break;
            case 'arrowup':
                e.preventDefault();
                if (videoEl) changeVolume(Math.min(3.0, videoEl.volume + 0.05));
                break;
            case 'arrowdown':
                e.preventDefault();
                if (videoEl) changeVolume(Math.max(0.0, videoEl.volume - 0.05));
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                toggleMute();
                break;
            case 's':
                e.preventDefault();
                takeScreenshot();
                break;
            case 'b':
                e.preventDefault();
                quickAddBookmark();
                break;
            case ',':
                e.preventDefault();
                stepFrame(-1);
                break;
            case '.':
                e.preventDefault();
                stepFrame(1);
                break;
            case '[':
                e.preventDefault();
                if (videoEl) setSpeed(Math.max(0.25, videoEl.playbackRate - 0.25));
                break;
            case ']':
                e.preventDefault();
                if (videoEl) setSpeed(Math.min(4.0, videoEl.playbackRate + 0.25));
                break;
            case 'a':
                e.preventDefault();
                cycleAspectRatio();
                break;
            case 'p':
                e.preventDefault();
                togglePiP();
                break;
            case '?':
                e.preventDefault();
                openModal('shortcutsModal');
                break;
            case 'escape':
                closeModal('equalizerModal');
                closeModal('videoEffectsModal');
                closeModal('speedModal');
                closeModal('sleepTimerModal');
                closeModal('themeModal');
                closeModal('mediaInfoModal');
                closeModal('shortcutsModal');
                toggleDrawer('subtitleDrawer');
                break;
        }
    });
}

async function fetchVideoMetadata(videoPath) {
    try {
        const res = await fetch('/api/metadata?path=' + encodeURIComponent(videoPath));
        const data = await res.json();
        const content = document.getElementById('mediaInfoContent');
        content.innerHTML = `
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">Fayl:</span><span class="font-semibold truncate max-w-xs">${data.filename || ''}</span></div>
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">Sifat:</span><span class="text-ios-blue font-bold">${data.resolution_label || 'HD'} (${data.width}x${data.height})</span></div>
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">FPS:</span><span>${data.fps || 24} fps</span></div>
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">Davomiyligi:</span><span>${formatTime(data.duration || 0)}</span></div>
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">Hajmi:</span><span>${formatBytes(data.size || 0)}</span></div>
            <div class="flex justify-between py-1 border-b border-white/5"><span class="text-white/50">Kodek:</span><span>${data.codec || 'H.264 / AVC'}</span></div>
            <div class="flex justify-between py-1"><span class="text-white/50">Joylashuv:</span><span class="truncate max-w-xs text-[10px] text-white/40 font-mono">${data.path || ''}</span></div>
        `;
    } catch (e) {
        console.error('Metadata error:', e);
    }
}

function openMediaInfo() {
    if (currentMedia) {
        fetchVideoMetadata(currentMedia.path);
        openModal('mediaInfoModal');
    }
}

function openMediaInfoForFile(path) {
    fetchVideoMetadata(path);
    openModal('mediaInfoModal');
}

async function revealCurrentFileInExplorer() {
    if (currentMedia) {
        await fetch('/api/open_explorer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentMedia.path })
        });
        showDynamicIsland('folder-open', 'Explorerda ochildi');
    }
}

function savePlaybackProgress() {
    if (!videoEl || !currentMedia || isNaN(videoEl.duration) || videoEl.duration === 0) return;
    if (Math.abs(videoEl.currentTime - lastSavedTime) > 3) {
        lastSavedTime = videoEl.currentTime;
        let hist = getStorage('history', {});
        hist[currentMedia.path] = {
            time: videoEl.currentTime,
            duration: videoEl.duration,
            size: currentMedia.size || 0,
            timestamp: Date.now() / 1000
        };
        setStorage('history', hist);
    }
}

function restorePlaybackProgress() {
    if (!currentMedia || !videoEl) return;
    const hist = getStorage('history', {});
    const item = hist[currentMedia.path];
    if (item && item.time > 5 && item.time < (item.duration - 10)) {
        videoEl.currentTime = item.time;
        showDynamicIsland('rotate-ccw', `Davom ettirilmoqda: ${formatTime(item.time)}`);
    }
}

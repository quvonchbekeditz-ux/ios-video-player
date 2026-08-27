// iOS Super Video Player - Main Application Logic (app.js)

let currentPath = '';
let navHistory = [];
let historyIndex = -1;
let currentFolders = [];
let currentVideos = [];
let viewMode = 'grid'; // 'grid' | 'list'
let formatFilter = 'all';
let currentSort = 'name_asc';
let isDeepScan = false;
let libraryMode = null;

function getStorage(key, defaultVal) {
    try {
        const val = localStorage.getItem('iplayer_' + key);
        return val ? JSON.parse(val) : defaultVal;
    } catch { return defaultVal; }
}

function setStorage(key, val) {
    try {
        localStorage.setItem('iplayer_' + key, JSON.stringify(val));
    } catch (e) { console.warn('Storage save error:', e); }
}

// Dynamic Island HUD
let dynamicIslandTimer = null;
function showDynamicIsland(iconName, text, progress = null, duration = 2500) {
    const island = document.getElementById('dynamicIsland');
    const icon = document.getElementById('dynamicIslandIcon');
    const label = document.getElementById('dynamicIslandText');
    const bar = document.getElementById('dynamicIslandBar');
    const prog = document.getElementById('dynamicIslandProgress');
    if (!island || !label) return;

    if (icon) icon.setAttribute('data-lucide', iconName);
    label.textContent = text;

    if (progress !== null) {
        bar.classList.remove('hidden');
        prog.style.width = Math.min(100, Math.max(0, progress)) + '%';
        island.classList.add('expanded');
    } else {
        bar.classList.add('hidden');
        island.classList.remove('expanded');
    }

    if (window.lucide) lucide.createIcons();
    island.classList.add('active');

    clearTimeout(dynamicIslandTimer);
    dynamicIslandTimer = setTimeout(() => {
        island.classList.remove('active', 'expanded');
    }, duration);
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchDrivesAndSystemFolders();
    browsePath('');
    initSearchEvents();
    initDragAndDrop();
});

function initTheme() {
    const savedTheme = getStorage('theme', 'default');
    setTheme(savedTheme, false);
}

function setTheme(themeName, showHud = true) {
    document.body.className = '';
    if (themeName !== 'default') {
        document.body.classList.add('theme-' + themeName);
    }
    setStorage('theme', themeName);
    closeModal('themeModal');
    if (showHud) {
        showDynamicIsland('palette', 'Mavzu: ' + themeName.toUpperCase());
    }
}

async function fetchDrivesAndSystemFolders() {
    try {
        const res = await fetch('/api/drives');
        const data = await res.json();
        const drivesContainer = document.getElementById('drivesList');
        drivesContainer.innerHTML = '';
        data.drives.forEach(drive => {
            const btn = document.createElement('button');
            btn.className = 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition group text-left';
            btn.onclick = () => browsePath(drive.path);
            btn.innerHTML = `<div class="flex items-center gap-2.5 min-w-0"><i data-lucide="hard-drive" class="w-4 h-4 text-ios-blue group-hover:scale-110 transition flex-shrink-0"></i><span class="truncate font-semibold">${drive.label}</span></div><div class="text-[10px] text-white/40 flex-shrink-0 ml-2 font-mono">${drive.free_gb}GB bo'sh</div>`;
            drivesContainer.appendChild(btn);
        });

        const sysContainer = document.getElementById('systemFoldersList');
        sysContainer.innerHTML = '';
        data.system_folders.forEach(folder => {
            const btn = document.createElement('button');
            btn.className = 'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition group text-left';
            btn.onclick = () => browsePath(folder.path);
            btn.innerHTML = `<i data-lucide="${folder.icon || 'folder'}" class="w-4 h-4 text-ios-purple group-hover:scale-110 transition"></i><span class="truncate font-semibold">${folder.name}</span>`;
            sysContainer.appendChild(btn);
        });
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Drives fetch error:', err);
    }
}

async function browsePath(path, pushHistory = true) {
    libraryMode = null;
    try {
        const res = await fetch('/api/browse?path=' + encodeURIComponent(path || ''));
        const data = await res.json();
        if (data.error) {
            showDynamicIsland('alert-triangle', 'Xatolik: ' + data.error);
            return;
        }

        currentPath = data.current_path;
        currentFolders = data.folders || [];
        currentVideos = data.videos || [];

        if (pushHistory) {
            navHistory = navHistory.slice(0, historyIndex + 1);
            navHistory.push(currentPath);
            historyIndex = navHistory.length - 1;
        }

        renderBreadcrumbs(currentPath);
        renderExplorer();
    } catch (err) {
        console.error('Browse error:', err);
    }
}

function navigateHome() { browsePath(''); }
function navHistoryBack() {
    if (historyIndex > 0) {
        historyIndex--;
        browsePath(navHistory[historyIndex], false);
    }
}
function navHistoryForward() {
    if (historyIndex < navHistory.length - 1) {
        historyIndex++;
        browsePath(navHistory[historyIndex], false);
    }
}

function renderBreadcrumbs(pathStr) {
    const container = document.getElementById('breadcrumbBar');
    container.innerHTML = '';
    if (!pathStr) return;

    const parts = pathStr.split(/[\\\/]/).filter(Boolean);
    let accum = '';

    parts.forEach((part, idx) => {
        if (idx === 0 && pathStr.includes(':')) {
            accum = part + '\\';
        } else {
            accum += (accum.endsWith('\\') ? '' : '\\') + part;
        }
        const thisPath = accum;

        const btn = document.createElement('button');
        btn.className = 'hover:text-white px-1.5 py-0.5 rounded-md hover:bg-white/10 transition font-medium truncate max-w-40';
        btn.textContent = part;
        btn.title = thisPath;
        btn.onclick = () => browsePath(thisPath);
        container.appendChild(btn);

        if (idx < parts.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'text-white/30';
            sep.textContent = '/';
            container.appendChild(sep);
        }
    });
}

function initSearchEvents() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    let debounceTimer = null;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.classList.toggle('hidden', !query);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(query, isDeepScan);
        }, 300);
    });
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    document.getElementById('clearSearchBtn').classList.add('hidden');
    browsePath(currentPath, false);
}

function toggleDeepScan() {
    isDeepScan = !isDeepScan;
    const btn = document.getElementById('deepScanBtn');
    if (isDeepScan) {
        btn.classList.add('bg-ios-purple/30', 'border-ios-purple/50', 'text-white');
        showDynamicIsland('folder-search', 'Deep Scan Yoqildi');
    } else {
        btn.classList.remove('bg-ios-purple/30', 'border-ios-purple/50', 'text-white');
        showDynamicIsland('folder', 'Deep Scan O\'chirildi');
    }
    const searchInput = document.getElementById('searchInput');
    if (searchInput.value.trim()) {
        performSearch(searchInput.value.trim(), isDeepScan);
    }
}

async function performSearch(query, isDeep) {
    if (!query) {
        browsePath(currentPath, false);
        return;
    }
    try {
        const res = await fetch(`/api/search?path=${encodeURIComponent(currentPath)}&query=${encodeURIComponent(query)}&deep=${isDeep ? '1' : '0'}&format=${formatFilter}`);
        const data = await res.json();
        currentVideos = data.videos || [];
        currentFolders = [];
        renderExplorer();
    } catch (err) {
        console.error('Search error:', err);
    }
}

function setFormatFilter(fmt) {
    formatFilter = fmt;
    document.querySelectorAll('.format-chip').forEach(chip => {
        const isActive = chip.textContent.trim().toLowerCase() === fmt || (fmt === 'all' && chip.textContent.trim() === 'Barchasi');
        chip.className = `format-chip px-3 py-1 rounded-full text-xs font-medium transition ${isActive ? 'bg-ios-blue text-white' : 'bg-white/5 hover:bg-white/10 text-white/70'}`;
    });
    renderExplorer();
}

function changeSort(val) {
    currentSort = val;
    renderExplorer();
}

function setViewMode(mode) {
    viewMode = mode;
    document.getElementById('viewGridBtn').className = `p-1.5 rounded-full transition ${mode === 'grid' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`;
    document.getElementById('viewListBtn').className = `p-1.5 rounded-full transition ${mode === 'list' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`;
    renderExplorer();
}

function renderExplorer() {
    const foldersSection = document.getElementById('foldersSection');
    const foldersGrid = document.getElementById('foldersGrid');
    const foldersCount = document.getElementById('foldersCount');
    
    foldersGrid.innerHTML = '';
    foldersCount.textContent = currentFolders.length;

    if (currentFolders.length === 0 || libraryMode) {
        foldersSection.classList.add('hidden');
    } else {
        foldersSection.classList.remove('hidden');
        currentFolders.forEach(folder => {
            const el = document.createElement('div');
            el.className = 'glass-panel p-3 rounded-2xl cursor-pointer flex items-center gap-2.5 hover:bg-white/15 transition active:scale-95';
            el.onclick = () => browsePath(folder.path);
            el.innerHTML = `<i data-lucide="folder" class="w-5 h-5 text-ios-blue flex-shrink-0"></i><span class="text-xs font-semibold truncate">${folder.name}</span>`;
            foldersGrid.appendChild(el);
        });
    }

    let filteredVideos = [...currentVideos];
    if (formatFilter !== 'all') {
        filteredVideos = filteredVideos.filter(v => (v.ext || '').replace('.', '').toLowerCase() === formatFilter);
    }

    filteredVideos.sort((a, b) => {
        if (currentSort === 'name_asc') return a.name.localeCompare(b.name);
        if (currentSort === 'name_desc') return b.name.localeCompare(a.name);
        if (currentSort === 'date_desc') return (b.modified || 0) - (a.modified || 0);
        if (currentSort === 'date_asc') return (a.modified || 0) - (b.modified || 0);
        if (currentSort === 'size_desc') return (b.size || 0) - (a.size || 0);
        if (currentSort === 'size_asc') return (a.size || 0) - (b.size || 0);
        return 0;
    });

    document.getElementById('videosCount').textContent = filteredVideos.length;
    document.getElementById('statusBarCount').textContent = filteredVideos.length + ' ta video';

    const emptyState = document.getElementById('emptyState');
    const videosGrid = document.getElementById('videosGrid');
    const videosList = document.getElementById('videosList');
    const listBody = document.getElementById('videosListBody');

    videosGrid.innerHTML = '';
    listBody.innerHTML = '';

    if (filteredVideos.length === 0 && currentFolders.length === 0) {
        emptyState.classList.remove('hidden');
        videosGrid.classList.add('hidden');
        videosList.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        const history = getStorage('history', {});
        const favorites = getStorage('favorites', []);

        if (viewMode === 'grid') {
            videosGrid.classList.remove('hidden');
            videosList.classList.add('hidden');
            filteredVideos.forEach((v, idx) => {
                const card = createVideoCard(v, filteredVideos, idx, history[v.path], favorites.includes(v.path));
                videosGrid.appendChild(card);
            });
        } else {
            videosGrid.classList.add('hidden');
            videosList.classList.remove('hidden');
            filteredVideos.forEach((v, idx) => {
                const row = createVideoRow(v, filteredVideos, idx, favorites.includes(v.path));
                listBody.appendChild(row);
            });
        }
    }

    if (window.lucide) lucide.createIcons();
}

function createVideoCard(video, playlist, index, historyProgress, isFavorite) {
    const card = document.createElement('div');
    card.className = 'video-card group';

    const extClean = (video.ext || '').replace('.', '').toUpperCase();
    const sizeStr = formatBytes(video.size || 0);
    const thumbUrl = '/api/thumbnail?path=' + encodeURIComponent(video.path);
    const bookmarkTime = video.bookmarkTime || null;

    let progressPercent = 0;
    if (historyProgress && historyProgress.duration > 0) {
        progressPercent = Math.min(100, Math.round((historyProgress.time / historyProgress.duration) * 100));
    }

    const safePath = video.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    card.innerHTML = `
        <div class="thumb-container">
            <img src="${thumbUrl}" class="thumb-img" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');">
            <div class="hidden flex flex-col items-center justify-center p-4 text-white/30">
                <i data-lucide="video" class="w-8 h-8 mb-1"></i>
                <span class="text-[10px] uppercase font-bold">${extClean}</span>
            </div>
            
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button onclick="event.stopPropagation(); playVideoAtIndex(${index});" class="p-3 rounded-full bg-ios-blue text-white shadow-lg hover:scale-110 active:scale-95 transition">
                    <i data-lucide="play" class="w-5 h-5 fill-white translate-x-0.5"></i>
                </button>
            </div>

            <div class="absolute top-2 left-2 flex items-center gap-1.5">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-white border border-white/10 uppercase">${extClean}</span>
                ${bookmarkTime ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ios-yellow text-black shadow-md flex items-center gap-1"><i data-lucide="bookmark" class="w-2.5 h-2.5 fill-black"></i>${formatTime(bookmarkTime)}</span>` : ''}
            </div>

            <div class="absolute top-2 right-2">
                <button onclick="event.stopPropagation(); toggleFavorite('${safePath}');" class="p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/70 hover:text-ios-red transition" title="Sevimli">
                    <i data-lucide="heart" class="w-3.5 h-3.5 ${isFavorite ? 'fill-ios-red text-ios-red' : ''}"></i>
                </button>
            </div>

            <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono text-white/90">
                ${sizeStr}
            </div>

            ${progressPercent > 0 ? `<div class="card-progress-bar" style="width: ${progressPercent}%;"></div>` : ''}
        </div>

        <div class="p-3 flex flex-col justify-between flex-1 gap-2">
            <div class="text-xs font-semibold text-white/90 line-clamp-2 leading-relaxed" title="${video.name}">${video.name}</div>
            <div class="flex items-center justify-between text-[10px] text-white/40 pt-1 border-t border-white/5">
                <span>${formatDate(video.modified)}</span>
                <span class="text-ios-blue hover:underline cursor-pointer" onclick="event.stopPropagation(); openMediaInfoForFile('${safePath}');">Info</span>
            </div>
        </div>
    `;

    card.onclick = () => openPlayer(video, playlist, index, bookmarkTime);
    return card;
}

function createVideoRow(video, playlist, index, isFavorite) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/5 transition cursor-pointer';
    const bookmarkTime = video.bookmarkTime || null;
    tr.onclick = () => openPlayer(video, playlist, index, bookmarkTime);

    const extClean = (video.ext || '').replace('.', '').toUpperCase();
    const sizeStr = formatBytes(video.size || 0);
    const safePath = video.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    tr.innerHTML = `
        <td class="p-3 pl-4 font-semibold text-white flex items-center gap-2 max-w-xs truncate">
            <i data-lucide="film" class="w-4 h-4 text-ios-purple flex-shrink-0"></i>
            <span class="truncate" title="${video.name}">${video.name}</span>
            ${bookmarkTime ? `<span class="px-1.5 py-0.5 rounded bg-ios-yellow text-black text-[10px] font-bold">${formatTime(bookmarkTime)}</span>` : ''}
        </td>
        <td class="p-3"><span class="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold uppercase">${extClean}</span></td>
        <td class="p-3 text-white/70 font-mono">${sizeStr}</td>
        <td class="p-3 text-white/50">${formatDate(video.modified)}</td>
        <td class="p-3 pr-4 text-right">
            <div class="flex items-center justify-end gap-2" onclick="event.stopPropagation()">
                <button onclick="toggleFavorite('${safePath}')" class="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-ios-red">
                    <i data-lucide="heart" class="w-3.5 h-3.5 ${isFavorite ? 'fill-ios-red text-ios-red' : ''}"></i>
                </button>
                <button onclick="openMediaInfoForFile('${safePath}')" class="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
                    <i data-lucide="info" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
}

function toggleFavorite(path) {
    let favs = getStorage('favorites', []);
    if (favs.includes(path)) {
        favs = favs.filter(p => p !== path);
        showDynamicIsland('heart-off', 'Sevimlilardan o\'chirildi');
    } else {
        favs.push(path);
        showDynamicIsland('heart', 'Sevimlilarga qo\'shildi');
    }
    setStorage('favorites', favs);
    renderExplorer();
}

function showLibraryView(type) {
    libraryMode = type;
    if (type === 'history') {
        const histObj = getStorage('history', {});
        currentVideos = Object.keys(histObj).map(p => ({
            name: p.split(/[\\\/]/).pop(),
            path: p,
            ext: '.' + p.split('.').pop(),
            size: histObj[p].size || 0,
            modified: histObj[p].timestamp || Date.now() / 1000,
            watchTime: histObj[p].time || 0,
            watchDuration: histObj[p].duration || 0
        })).sort((a, b) => (b.modified || 0) - (a.modified || 0));
        showDynamicIsland('history', 'Ko\'rish Tarixi');
    } else if (type === 'favorites') {
        const favs = getStorage('favorites', []);
        currentVideos = favs.map(p => ({
            name: p.split(/[\\\/]/).pop(),
            path: p,
            ext: '.' + p.split('.').pop(),
            size: 0,
            modified: Date.now() / 1000
        }));
        showDynamicIsland('heart', 'Sevimlilar (' + favs.length + ' ta)');
    } else if (type === 'bookmarks') {
        const bms = getStorage('bookmarks', []);
        currentVideos = bms.map(b => ({
            name: b.title || b.path.split(/[\\\/]/).pop(),
            path: b.path,
            ext: '.' + b.path.split('.').pop(),
            size: 0,
            modified: b.created || Date.now() / 1000,
            bookmarkTime: b.time || 0
        })).sort((a, b) => (b.modified || 0) - (a.modified || 0));
        showDynamicIsland('bookmark', 'Xatcho\'plar (' + bms.length + ' ta)');
    } else if (type === 'screenshots') {
        browsePath(currentPath);
        showDynamicIsland('camera', 'Skrinshotlar');
        return;
    }

    currentFolders = [];
    const titles = {
        'history': 'KO\'RISH TARIXI',
        'favorites': 'SEVIMLILAR',
        'bookmarks': 'XATCHO\'PLAR'
    };
    renderBreadcrumbs(titles[type] || type.toUpperCase());
    renderExplorer();
}

function clearHistory() {
    setStorage('history', {});
    showDynamicIsland('trash-2', 'Tarix tozalandi');
    showLibraryView('history');
}

function clearBookmarks() {
    setStorage('bookmarks', []);
    showDynamicIsland('trash-2', 'Xatcho\'plar tozalandi');
    showLibraryView('bookmarks');
}

function playAllInFolder() {
    if (currentVideos.length > 0) {
        const startT = currentVideos[0].bookmarkTime || null;
        openPlayer(currentVideos[0], currentVideos, 0, startT);
    }
}

function playVideoAtIndex(index) {
    if (currentVideos[index]) {
        const startT = currentVideos[index].bookmarkTime || null;
        openPlayer(currentVideos[index], currentVideos, index, startT);
    }
}

function initDragAndDrop() {
    const body = document.body;
    body.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    body.addEventListener('drop', (e) => {
        e.preventDefault();
        showDynamicIsland('upload-cloud', 'Fayl yuklandi');
    });
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
        return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

// Modal Helpers
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}
function closeModalOnOverlay(e, id) {
    if (e.target && e.target.id === id) {
        closeModal(id);
    }
}
function toggleDrawer(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

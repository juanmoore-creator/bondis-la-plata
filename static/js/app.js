/* ============================================================
   BONDIS — App Logic
   ============================================================ */

// --- State ---
let appData = null;
let searchIndex = null;
let lineasMap = {};
let selectedLinea = null;
let currentStops = [];
let searchQuery = "";
let autoRefreshTimer = null;
let refreshProgress = 0;
let refreshInterval = null;
let currentStop = null;
let activeTab = "home";
let globalSearchActive = false;
let globalSelectedIdx = -1;

// --- DOM Refs ---
const $ = (id) => document.getElementById(id);

const dom = {
    // Tabs
    tabHome: $("tab-home"),
    tabExplore: $("tab-explore"),
    tabBtns: document.querySelectorAll(".tab-btn"),
    
    // Home
    homeRecents: $("home-recents"),
    homeRecentsList: $("home-recents-list"),
    homeFavorites: $("home-favorites"),
    homeEmpty: $("home-empty"),
    
    // Explore
    linesScroll: $("lines-scroll"),
    searchSection: $("search-section"),
    searchInput: $("search-input"),
    searchClear: $("search-clear"),
    searchCount: $("search-count"),
    initialState: $("initial-state"),
    stopList: $("stop-list"),
    
    // Global Search
    globalSearch: $("global-search"),
    globalSearchInput: $("global-search-input"),
    globalSearchClear: $("global-search-clear"),
    globalSearchResults: $("global-search-results"),

    // Shared Arrivals
    overlay: $("arrivals-overlay"),
    btnBack: $("btn-back"),
    btnRefresh: $("btn-refresh"),
    btnFavArrivals: $("btn-fav-arrivals"),
    arrStopName: $("arr-stop-name"),
    arrZone: $("arr-zone"),
    arrBody: $("arrivals-body"),
    arrFooter: $("arrivals-footer"),
    refreshBarFill: $("refresh-bar-fill"),
    clock: $("clock"),
};

// --- Init ---
async function init() {
    startClock();
    setupTabs();
    setupArrivalsFavButton();
    setupGlobalSearch();

    try {
        const [paradasRes, searchRes] = await Promise.all([
            fetch("/static/data/paradas.json"),
            fetch("/static/data/search_index.json"),
        ]);
        if (!paradasRes.ok) throw new Error(`HTTP ${paradasRes.status}`);
        appData = await paradasRes.json();
        searchIndex = await searchRes.json();

        appData.lineas.forEach((l) => {
            lineasMap[l.codigo] = l;
        });

        renderHome();
        renderLines();

        // Restore from localStorage
        const savedLinea = localStorage.getItem("bondis_linea");
        if (savedLinea && lineasMap[savedLinea]) {
            selectLinea(savedLinea);
        }
    } catch (err) {
        console.error("Error cargando datos:", err);
        dom.initialState.innerHTML =
            '<div class="empty-state"><span class="icon">⚠️</span><p>Error cargando las paradas. Recargá la página.</p></div>';
    }

    registerSW();
}

function registerSW() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/static/sw.js");
    }
}

// --- Tabs ---
function setupTabs() {
    dom.tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tabId) {
    activeTab = tabId;
    
    // Update buttons
    dom.tabBtns.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    
    // Update pages
    dom.tabHome.classList.toggle("active", tabId === "home");
    dom.tabExplore.classList.toggle("active", tabId === "explore");
    
    if (tabId === "home") renderHome();
}

// --- Global Search ---
let globalDebounceTimer = null;

function setupGlobalSearch() {
    dom.globalSearchInput.addEventListener("input", (e) => {
        clearTimeout(globalDebounceTimer);
        const q = e.target.value;
        dom.globalSearchClear.classList.toggle("visible", q.length > 0);

        if (q.length < 2) {
            dom.globalSearchResults.classList.remove("open");
            globalSearchActive = false;
            return;
        }

        globalDebounceTimer = setTimeout(() => renderGlobalResults(q), 150);
    });

    dom.globalSearchClear.addEventListener("click", () => {
        dom.globalSearchInput.value = "";
        dom.globalSearchClear.classList.remove("visible");
        dom.globalSearchResults.classList.remove("open");
        globalSearchActive = false;
        globalSelectedIdx = -1;
        dom.globalSearchInput.focus();
    });

    dom.globalSearchInput.addEventListener("keydown", (e) => {
        if (!globalSearchActive) return;
        const items = dom.globalSearchResults.querySelectorAll(".search-result-item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            globalSelectedIdx = Math.min(globalSelectedIdx + 1, items.length - 1);
            updateHighlight(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            globalSelectedIdx = Math.max(globalSelectedIdx - 1, 0);
            updateHighlight(items);
        } else if (e.key === "Enter" && globalSelectedIdx >= 0 && items[globalSelectedIdx]) {
            e.preventDefault();
            items[globalSelectedIdx].click();
        } else if (e.key === "Escape") {
            closeGlobalSearch();
            dom.globalSearchInput.blur();
        }
    });

    dom.globalSearchInput.addEventListener("blur", () => {
        setTimeout(closeGlobalSearch, 200);
    });

    dom.globalSearchInput.addEventListener("focus", () => {
        const q = dom.globalSearchInput.value;
        if (q.length >= 2) {
            renderGlobalResults(q);
        }
    });
}

function updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle("active", i === globalSelectedIdx));
    if (items[globalSelectedIdx]) {
        items[globalSelectedIdx].scrollIntoView({ block: "nearest" });
    }
}

function closeGlobalSearch() {
    dom.globalSearchResults.classList.remove("open");
    globalSearchActive = false;
    globalSelectedIdx = -1;
}

function getTokens(text) {
    return text.split(/\s+/).filter(Boolean);
}

function renderGlobalResults(query) {
    const q = normalize(query);
    if (!q) {
        dom.globalSearchResults.classList.remove("open");
        globalSearchActive = false;
        return;
    }

    const qTokens = getTokens(q);

    const results = searchIndex.filter((s) => {
        const text = normalize(s.n) + " " + normalize(s.z);
        return qTokens.every((token) => text.includes(token));
    });

    if (results.length === 0) {
        dom.globalSearchResults.innerHTML =
            '<div class="search-result-empty">No se encontraron paradas.</div>';
        dom.globalSearchResults.classList.add("open");
        globalSearchActive = true;
        globalSelectedIdx = -1;
        return;
    }

    const top = results.slice(0, 10);
    globalSelectedIdx = -1;

    let html = "";
    top.forEach((s) => {
        const nameHighlighted = highlightTokens(s.n, qTokens);
        const lineasHtml = s.l.slice(0, 3).map((cod) => {
            const l = lineasMap[cod];
            return l
                ? `<span class="badge" style="background:${l.color}18;color:${l.color}">${shortName(l.nombre)}</span>`
                : "";
        }).join("");

        html += `
            <div class="search-result-item" data-id="${s.id}">
                <div class="search-result-top">
                    <div class="search-result-name">${nameHighlighted}</div>
                    <span class="search-result-zone">${s.z}</span>
                </div>
                <div class="search-result-badges">${lineasHtml}</div>
            </div>`;
    });

    if (results.length > 10) {
        html += `<div class="search-result-helper">${results.length} resultados — seguí escribiendo para filtrar</div>`;
    }

    dom.globalSearchResults.innerHTML = html;
    dom.globalSearchResults.classList.add("open");
    globalSearchActive = true;

    // Click handlers
    dom.globalSearchResults.querySelectorAll(".search-result-item").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.dataset.id;
            const stop = searchIndex.find((s) => s.id === id);
            if (!stop) return;
            dom.globalSearchInput.value = "";
            dom.globalSearchClear.classList.remove("visible");
            closeGlobalSearch();
            openArrivals({
                id: stop.id,
                nombre: stop.n,
                zona: stop.z,
                lineas: stop.l,
            });
        });
    });
}

function highlightTokens(text, tokens) {
    let result = escapeHtml(text);
    for (const token of tokens) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(${escaped})`, "gi");
        result = result.replace(pattern, "<mark>$1</mark>");
    }
    return result;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// --- Home (Recents + Favorites) ---
function renderRecents() {
    if (!appData) return;
    const recents = window.Recents.getAll();
    const container = dom.homeRecentsList;
    container.innerHTML = "";

    if (recents.length === 0) {
        dom.homeRecents.style.display = "none";
        return;
    }

    dom.homeRecents.style.display = "block";
    recents.forEach((r) => {
        const card = document.createElement("div");
        card.className = "recent-card";
        card.innerHTML = `
            <span class="recent-card-icon">🕐</span>
            <div class="recent-card-body">
                <div class="recent-card-name">${r.stopName}</div>
                <div class="recent-card-meta">
                    <span class="recent-card-zone">${r.zona}</span>
                    <span class="recent-card-badges">${r.lineas.slice(0, 3).map((cod) => {
                        const l = lineasMap[cod];
                        return l ? `<span class="badge" style="background:${l.color}18;color:${l.color}">${shortName(l.nombre)}</span>` : "";
                    }).join("")}</span>
                </div>
            </div>
        `;
        card.addEventListener("click", () => {
            openArrivals({
                id: r.stopId,
                nombre: r.stopName,
                zona: r.zona,
                lineas: r.lineas,
            });
        });
        container.appendChild(card);
    });
}

function renderHome() {
    if (!appData) return;

    renderRecents();
    
    const favs = window.Favorites.getAll();
    
    if (favs.length === 0) {
        dom.homeEmpty.style.display = "flex";
        dom.homeFavorites.style.display = "none";
        return;
    }
    
    dom.homeEmpty.style.display = "none";
    dom.homeFavorites.style.display = "block";
    dom.homeFavorites.innerHTML = '<div class="home-section-title">Mis Paradas</div>';
    
    favs.forEach(fav => {
        const card = document.createElement("div");
        card.className = "fav-card";
        
        let badgesHtml = "";
        fav.lineas.forEach(cod => {
            const l = lineasMap[cod];
            if (l) {
                badgesHtml += `<span class="badge" style="background:${l.color}18;color:${l.color}">${shortName(l.nombre)}</span>`;
            }
        });
        
        card.innerHTML = `
            <div class="fav-card-icon">⭐</div>
            <div class="fav-card-body">
                <div class="fav-card-name">${fav.stopName}</div>
                <div class="fav-card-zone">${fav.zona}</div>
                <div class="fav-card-lines">${badgesHtml}</div>
            </div>
            <button class="fav-card-remove" aria-label="Quitar de favoritos" data-id="${fav.stopId}">
                <i class="bi bi-x-lg"></i>
            </button>
        `;
        
        // Open arrivals on card click
        card.addEventListener("click", (e) => {
            if (e.target.closest('.fav-card-remove')) return;
            openArrivals({
                id: fav.stopId,
                nombre: fav.stopName,
                zona: fav.zona,
                lineas: fav.lineas
            });
        });
        
        // Remove button
        const removeBtn = card.querySelector('.fav-card-remove');
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            window.Favorites.remove(fav.stopId);
            renderHome();
            if (activeTab === "explore") renderStops();
        });
        
        dom.homeFavorites.appendChild(card);
    });
}

// --- Lines ---
function shortName(nombre) {
    return nombre.replace(/^LINEA\s+/, "");
}

function renderLines() {
    dom.linesScroll.innerHTML = "";
    appData.lineas.forEach((l) => {
        const btn = document.createElement("button");
        btn.className = "line-pill";
        btn.dataset.codigo = l.codigo;
        btn.style.setProperty("--line-color", l.color);
        btn.innerHTML = `<span class="dot"></span>${shortName(l.nombre)}`;
        btn.addEventListener("click", () => {
            selectLinea(l.codigo);
            localStorage.setItem("bondis_linea", l.codigo);
        });
        dom.linesScroll.appendChild(btn);
    });
}

// --- Select Line ---
function selectLinea(codLinea) {
    selectedLinea = codLinea;
    searchQuery = "";
    dom.searchInput.value = "";
    dom.searchClear.classList.remove("visible");

    const lineaInfo = lineasMap[codLinea];
    dom.searchSection.style.setProperty("--line-color", lineaInfo.color);

    Array.from(dom.linesScroll.children).forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.codigo === codLinea);
        if (btn.dataset.codigo === codLinea) {
            btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    });

    currentStops = [];
    for (const [id, info] of Object.entries(appData.paradas)) {
        if (info.lineas.includes(codLinea)) {
            currentStops.push({ id, ...info });
        }
    }

    dom.searchSection.classList.add("visible");
    dom.initialState.style.display = "none";
    dom.stopList.style.display = "block";

    renderStops();
}

// --- Text Normalization ---
function normalize(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// --- Search ---
dom.searchInput.addEventListener("input", (e) => {
    searchQuery = normalize(e.target.value);
    dom.searchClear.classList.toggle("visible", e.target.value.length > 0);
    renderStops();
});

dom.searchClear.addEventListener("click", () => {
    dom.searchInput.value = "";
    searchQuery = "";
    dom.searchClear.classList.remove("visible");
    dom.searchInput.focus();
    renderStops();
});

// --- Render Stops ---
function renderStops() {
    dom.stopList.innerHTML = "";
    if (!selectedLinea || currentStops.length === 0) return;

    let filtered = currentStops;
    if (searchQuery) {
        const qTokens = getTokens(searchQuery);
        filtered = currentStops.filter((s) => {
            const text = normalize(s.nombre) + " " + normalize(s.zona);
            return qTokens.every((token) => text.includes(token));
        });
    }

    if (searchQuery) {
        dom.searchCount.textContent = `${filtered.length} de ${currentStops.length} paradas`;
    } else {
        dom.searchCount.textContent = `${currentStops.length} paradas`;
    }

    if (filtered.length === 0) {
        dom.stopList.innerHTML =
            '<div class="empty-state"><span class="icon">🔍</span><p>No se encontraron paradas.</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    // Add frecuentes section if no search query
    if (!searchQuery) {
        const recents = window.Recents.getForLinea(selectedLinea);
        if (recents.length > 0) {
            const header = document.createElement("li");
            header.className = "zone-header";
            header.textContent = "🕐 Recientes";
            fragment.appendChild(header);

            recents.slice(0, 3).forEach((r) => {
                const li = document.createElement("li");
                li.className = "stop-item";

                const isFav = window.Favorites.has(r.stopId);
                const favIcon = isFav ? "bi-star-fill" : "bi-star";

                li.innerHTML = `
                    <button class="btn-fav ${isFav ? "is-fav" : ""}" data-id="${r.stopId}">
                        <i class="bi ${favIcon}"></i>
                    </button>
                    <div class="stop-details">
                        <div class="stop-name">${r.stopName}</div>
                    </div>
                    <span class="stop-arrow">›</span>
                `;

                const btnFav = li.querySelector(".btn-fav");
                btnFav.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const isNowFav = window.Favorites.toggle({
                        stopId: r.stopId,
                        stopName: r.stopName,
                        zona: r.zona,
                        lineas: r.lineas,
                    });
                    btnFav.classList.toggle("is-fav", isNowFav);
                    btnFav.querySelector("i").className = isNowFav ? "bi bi-star-fill" : "bi bi-star";
                    btnFav.classList.remove("bounce");
                    void btnFav.offsetWidth;
                    btnFav.classList.add("bounce");
                    renderHome();
                });

                li.addEventListener("click", () =>
                    openArrivals({
                        id: r.stopId,
                        nombre: r.stopName,
                        zona: r.zona,
                        lineas: r.lineas,
                    })
                );
                fragment.appendChild(li);
            });
        }
    }

    const byZone = {};
    filtered.forEach((s) => {
        if (!byZone[s.zona]) byZone[s.zona] = [];
        byZone[s.zona].push(s);
    });

    const recentIds = !searchQuery
        ? new Set(window.Recents.getForLinea(selectedLinea).map((r) => r.stopId))
        : new Set();

    Object.keys(byZone)
        .sort()
        .forEach((zona) => {
            const header = document.createElement("li");
            header.className = "zone-header";
            header.textContent = zona;
            fragment.appendChild(header);

            byZone[zona]
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .forEach((s) => {
                    if (recentIds.has(s.id)) return;
                    const li = document.createElement("li");
                    li.className = "stop-item";

                    const otherLines = s.lineas.filter((l) => l !== selectedLinea);
                    let badgesHtml = "";
                    otherLines.slice(0, 3).forEach((cod) => {
                        const l = lineasMap[cod];
                        if (l) {
                            badgesHtml += `<span class="badge" style="background:${l.color}18;color:${l.color}">${shortName(l.nombre)}</span>`;
                        }
                    });
                    if (otherLines.length > 3) {
                        badgesHtml += `<span class="badge" style="background:var(--surface-alt);color:var(--text-3)">+${otherLines.length - 3}</span>`;
                    }

                    const isFav = window.Favorites.has(s.id);
                    const favIcon = isFav ? "bi-star-fill" : "bi-star";
                    
                    li.innerHTML = `
                        <button class="btn-fav ${isFav ? 'is-fav' : ''}" data-id="${s.id}">
                            <i class="bi ${favIcon}"></i>
                        </button>
                        <div class="stop-details">
                            <div class="stop-name">${s.nombre}</div>
                            ${badgesHtml ? `<div class="stop-badges">${badgesHtml}</div>` : ""}
                        </div>
                        <span class="stop-arrow">›</span>
                    `;

                    // Toggle fav
                    const btnFav = li.querySelector('.btn-fav');
                    btnFav.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const isNowFav = window.Favorites.toggle({
                            stopId: s.id,
                            stopName: s.nombre,
                            zona: s.zona,
                            lineas: s.lineas
                        });
                        
                        btnFav.classList.toggle("is-fav", isNowFav);
                        btnFav.querySelector('i').className = isNowFav ? "bi bi-star-fill" : "bi bi-star";
                        
                        // Bounce animation
                        btnFav.classList.remove("bounce");
                        void btnFav.offsetWidth; // trigger reflow
                        btnFav.classList.add("bounce");
                        
                        renderHome();
                    });

                    // Open arrivals
                    li.addEventListener("click", () => openArrivals(s));
                    fragment.appendChild(li);
                });
        });

    dom.stopList.appendChild(fragment);
}

// --- Arrivals ---
function openArrivals(stop) {
    currentStop = stop;

    dom.arrStopName.textContent = stop.nombre;
    dom.arrZone.textContent = stop.zona;
    dom.arrFooter.textContent = "Cargando...";

    // Update Star button in arrivals header
    updateArrivalsFavButton();

    let skeletonHtml = '<div class="skeleton skeleton-header"></div>';
    skeletonHtml += '<div class="skeleton skeleton-card"></div>';
    skeletonHtml += '<div class="skeleton skeleton-card" style="opacity:0.6"></div>';
    dom.arrBody.innerHTML = skeletonHtml;

    window.Recents.push({
        stopId: stop.id,
        stopName: stop.nombre,
        zona: stop.zona,
        lineas: stop.lineas,
    });

    dom.overlay.classList.add("open");
    fetchAllArrivals(stop);
    startAutoRefresh(stop);
}

function updateArrivalsFavButton() {
    if (!currentStop) return;
    const isFav = window.Favorites.has(currentStop.id);
    dom.btnFavArrivals.classList.toggle("is-fav", isFav);
    dom.btnFavArrivals.querySelector('i').className = isFav ? "bi bi-star-fill" : "bi bi-star";
}

function setupArrivalsFavButton() {
    dom.btnFavArrivals.addEventListener("click", () => {
        if (!currentStop) return;
        
        const isNowFav = window.Favorites.toggle({
            stopId: currentStop.id,
            stopName: currentStop.nombre,
            zona: currentStop.zona,
            lineas: currentStop.lineas
        });
        
        updateArrivalsFavButton();
        
        // Bounce animation
        dom.btnFavArrivals.classList.remove("bounce");
        void dom.btnFavArrivals.offsetWidth;
        dom.btnFavArrivals.classList.add("bounce");
        
        renderHome();
        if (activeTab === "explore") renderStops();
    });
}

dom.btnBack.addEventListener("click", () => {
    dom.overlay.classList.remove("open");
    stopAutoRefresh();
    currentStop = null;
});

dom.btnRefresh.addEventListener("click", () => {
    if (currentStop) {
        dom.btnRefresh.classList.add("spinning");
        fetchAllArrivals(currentStop).then(() => {
            dom.btnRefresh.classList.remove("spinning");
        });
        resetRefreshProgress();
    }
});

async function fetchAllArrivals(stop) {
    const promises = stop.lineas.map(async (codLinea) => {
        try {
            const res = await fetch(
                `/api/arribos?codLinea=${codLinea}&idParada=${stop.id}`
            );
            const data = await res.json();
            return { codLinea, data };
        } catch (err) {
            return { codLinea, data: { error: err.message } };
        }
    });

    const results = await Promise.all(promises);

    if (!dom.overlay.classList.contains("open") || currentStop?.id !== stop.id) return;

    renderAllArrivals(results);
    dom.arrFooter.textContent = `Actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

function renderAllArrivals(results) {
    let html = "";

    results.forEach(({ codLinea, data }) => {
        const linea = lineasMap[codLinea];
        if (!linea) return;

        const color = linea.color;
        const name = linea.nombre;

        html += `<div class="arrival-group" style="--line-color:${color}">`;
        html += `<div class="arrival-group-header">
            <span class="dot" style="background:${color}"></span>
            <span>${name}</span>
        </div>`;

        if (data.arribos && data.arribos.length > 0) {
            data.arribos.forEach((arr) => {
                const isArriving =
                    (arr.tiempoRestanteArribo || "").includes("Llegando") ||
                    ((arr.tiempoRestanteArribo || "").includes("min") &&
                        parseInt(arr.tiempoRestanteArribo) < 5);

                html += `<div class="arrival-card" style="border-left-color:${color}">
                    <div>
                        <div class="arrival-dest-label">Destino</div>
                        <div class="arrival-dest">${arr.descripcionBandera || "—"}</div>
                    </div>
                    <div>
                        <div class="arrival-time-label">Llega en</div>
                        <div class="arrival-time ${isArriving ? "arriving" : ""}" style="color:${isArriving ? "" : color}">
                            ${arr.tiempoRestanteArribo || "—"}
                        </div>
                    </div>
                </div>`;
            });
        } else if (data.error) {
            html += `<p class="arrival-none">⚠️ No se pudieron obtener los datos.</p>`;
        } else {
            html += `<p class="arrival-none">No hay próximos arribos para esta línea.</p>`;
        }

        html += `</div>`;
    });

    if (!html) {
        html =
            '<div class="empty-state"><span class="icon">🕐</span><p>No hay información de arribos disponible.</p></div>';
    }

    dom.arrBody.innerHTML = html;
}

// --- Auto Refresh ---
const REFRESH_INTERVAL_MS = 30000;

function startAutoRefresh(stop) {
    stopAutoRefresh();
    resetRefreshProgress();

    refreshInterval = setInterval(() => {
        refreshProgress += (100 / (REFRESH_INTERVAL_MS / 1000));
        if (refreshProgress >= 100) refreshProgress = 100;
        dom.refreshBarFill.style.width = refreshProgress + "%";
    }, 1000);

    autoRefreshTimer = setInterval(() => {
        if (dom.overlay.classList.contains("open") && currentStop) {
            fetchAllArrivals(currentStop);
            resetRefreshProgress();
        }
    }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
    clearInterval(autoRefreshTimer);
    clearInterval(refreshInterval);
    autoRefreshTimer = null;
    refreshInterval = null;
    refreshProgress = 0;
    dom.refreshBarFill.style.width = "0%";
}

function resetRefreshProgress() {
    refreshProgress = 0;
    dom.refreshBarFill.style.width = "0%";
}

// --- Clock ---
function startClock() {
    function tick() {
        dom.clock.textContent = new Date().toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
    }
    tick();
    setInterval(tick, 1000);
}

// --- Install Prompt ---
const INSTALL_DISMISSED_KEY = "bondis_install_dismissed";
let deferredPrompt = null;

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches;
}

function shouldShowInstallBanner() {
    if (isInstalled()) return false;
    if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return false;
    return true;
}

function createInstallBanner() {
    if (!shouldShowInstallBanner()) return;

    const banner = document.createElement("div");
    banner.className = "install-banner";
    banner.id = "install-banner";

    if (isIOS()) {
        banner.innerHTML = `
            <div class="install-banner-content">
                <div class="install-banner-icon"><i class="bi bi-box-arrow-up"></i></div>
                <div class="install-banner-text">
                    <strong>Instalá BONDIS</strong>
                    <span>Tocá <i class="bi bi-share"></i> Compartir → Agregar a Inicio</span>
                </div>
                <button class="install-banner-close" aria-label="Cerrar">&times;</button>
            </div>
        `;
    } else {
        banner.innerHTML = `
            <div class="install-banner-content">
                <div class="install-banner-icon"><i class="bi bi-download"></i></div>
                <div class="install-banner-text">
                    <strong>Instalá BONDIS</strong>
                    <span>Sin conexión. Más rápido. Como una app.</span>
                </div>
                <button class="install-banner-btn">Instalar</button>
                <button class="install-banner-close" aria-label="Cerrar">&times;</button>
            </div>
        `;

        const installBtn = banner.querySelector(".install-banner-btn");
        installBtn.addEventListener("click", async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const result = await deferredPrompt.userChoice;
                if (result.outcome === "accepted") banner.remove();
                deferredPrompt = null;
            }
        });
    }

    banner.querySelector(".install-banner-close").addEventListener("click", () => {
        banner.remove();
        localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    });

    document.body.appendChild(banner);
}

// Listen for beforeinstallprompt (Android Chrome)
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    createInstallBanner();
});

// For iOS: show banner on load if not installed
if (isIOS() && shouldShowInstallBanner()) {
    // Small delay to let the app render first
    setTimeout(createInstallBanner, 3000);
}

// Also try for Android if beforeinstallprompt didn't fire after a while
setTimeout(() => {
    if (!deferredPrompt && !isIOS() && shouldShowInstallBanner()) {
        createInstallBanner();
    }
}, 5000);

// --- Bootstrap ---
init();

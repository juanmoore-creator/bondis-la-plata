/* ============================================================
   BONDIS — Favorites Data Layer
   Pure localStorage CRUD. No DOM, no UI.
   ============================================================ */

const RECENTS_KEY = "bondis_recents";
const VISITS_KEY = "bondis_visits";
const MAX_RECENTS = 10;

const STORAGE_KEY = "bondis_favorites";

function _load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function _save(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
}

window.Favorites = {
    /** @returns {{ stopId: string, stopName: string, zona: string, lineas: string[] }[]} */
    getAll() {
        return _load();
    },

    /** Add a stop to favorites (newest first) */
    add(stop) {
        const favs = _load();
        if (favs.some((f) => f.stopId === stop.stopId)) return;
        favs.unshift({
            stopId: stop.stopId,
            stopName: stop.stopName,
            zona: stop.zona,
            lineas: stop.lineas,
        });
        _save(favs);
    },

    /** Remove a stop by ID */
    remove(stopId) {
        const favs = _load().filter((f) => f.stopId !== stopId);
        _save(favs);
    },

    /** Toggle favorite. Returns true if now favorited, false if removed. */
    toggle(stop) {
        if (this.has(stop.stopId)) {
            this.remove(stop.stopId);
            return false;
        }
        this.add(stop);
        return true;
    },

    /** Check if a stop is favorited */
    has(stopId) {
        return _load().some((f) => f.stopId === stopId);
    },
};

/* ============================================================
   BONDIS — Recents & Frecuentes Data Layer
   ============================================================ */

function _loadRecents() {
    try {
        return JSON.parse(localStorage.getItem(RECENTS_KEY)) || [];
    } catch {
        return [];
    }
}

function _saveRecents(recents) {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

function _loadVisits() {
    try {
        return JSON.parse(localStorage.getItem(VISITS_KEY)) || {};
    } catch {
        return {};
    }
}

function _saveVisits(visits) {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

window.Recents = {
    /** Add a stop to recents (most recent first, max 10, no duplicates) */
    push(stop) {
        const recents = _loadRecents().filter((r) => r.stopId !== stop.stopId);
        recents.unshift({
            stopId: stop.stopId,
            stopName: stop.stopName,
            zona: stop.zona,
            lineas: stop.lineas,
        });
        if (recents.length > MAX_RECENTS) recents.pop();
        _saveRecents(recents);

        const visits = _loadVisits();
        visits[stop.stopId] = (visits[stop.stopId] || 0) + 1;
        _saveVisits(visits);
    },

    /** Get all recents (most recent first) */
    getAll() {
        return _loadRecents();
    },

    /** Get recents filtered by a specific line */
    getForLinea(codLinea) {
        return _loadRecents().filter((r) => r.lineas.includes(codLinea));
    },

    /** Get top N most visited stops */
    getFrecuentes(limit) {
        const visits = _loadVisits();
        const scored = Object.entries(visits)
            .map(([stopId, count]) => ({ stopId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit || 5);
        const recents = _loadRecents();
        return scored
            .map((s) => recents.find((r) => r.stopId === s.stopId))
            .filter(Boolean);
    },
};

// app.js — shared logic used by every page (home, fans, broadcast).
// Handles: artist selector state (saved in localStorage), nav highlighting,
// and small fetch helpers so each page's inline script stays short.

const API = ''; // same origin. Change if you host frontend/backend separately.

// --- Artist selection, persisted across page loads ---
function getSelectedArtistId() {
  return localStorage.getItem('fanline_artist_id');
}
function setSelectedArtistId(id) {
  localStorage.setItem('fanline_artist_id', id);
}

// --- Populate any <select id="artistSelect"> on the page, restore last choice ---
async function initArtistSelector(onChange) {
  const res = await fetch(`${API}/api/artists`);
  const artists = await res.json();
  const select = document.getElementById('artistSelect');
  if (!select) return artists;

  select.innerHTML = artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  let selectedId = getSelectedArtistId();
  if (!selectedId || !artists.find(a => a.id == selectedId)) {
    selectedId = artists[0] ? artists[0].id : null;
  }
  if (selectedId) {
    select.value = selectedId;
    setSelectedArtistId(selectedId);
  }

  select.addEventListener('change', (e) => {
    setSelectedArtistId(e.target.value);
    if (onChange) onChange(e.target.value, artists);
  });

  if (onChange) onChange(selectedId, artists);
  return artists;
}

async function createArtist(name, code) {
  const res = await fetch(`${API}/api/artists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code })
  });
  return res.json();
}

async function fetchFans(artistId) {
  const res = await fetch(`${API}/api/fans/${artistId}`);
  return res.json();
}

async function fetchBroadcasts(artistId) {
  const res = await fetch(`${API}/api/broadcasts/${artistId}`);
  return res.json();
}

async function sendBroadcastRequest(artistId, message) {
  const res = await fetch(`${API}/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistId, message })
  });
  return res.json();
}

// --- Toast helper (needs <div id="toast"></div> on the page) ---
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- Nav highlighting: adds "active" class to the link matching current page ---
function highlightNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}
document.addEventListener('DOMContentLoaded', highlightNav);

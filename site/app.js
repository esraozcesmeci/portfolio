// ---------------------------------------------------------------------------
// Link Directory — Client-side Application
// ---------------------------------------------------------------------------

/** @type {Array<{url: string, type: string, title: string, description: string, image: string|null}>} */
let allLinks = [];

/** @type {HTMLElement} */
let container;

/** @type {HTMLElement} */
let noResults;

/** @type {HTMLInputElement} */
let searchInput;

/** @type {number|null} */
let debounceTimer = null;

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

/**
 * Creates a single card element for a link preview.
 * @param {object} link - LinkPreview object
 * @returns {HTMLAnchorElement}
 */
function createCard(link) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = link.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('role', 'listitem');

  if (link.image) {
    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = link.image;
    img.alt = link.title;
    card.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    card.appendChild(placeholder);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = link.title;
  body.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'card-description';
  desc.textContent = link.description;
  body.appendChild(desc);

  card.appendChild(body);
  return card;
}


/**
 * Clears the container and renders cards for the given links.
 * Shows/hides the no-results message based on whether the list is empty.
 * @param {object[]} links - Array of LinkPreview objects
 */
function renderCards(links) {
  container.innerHTML = '';

  for (const link of links) {
    container.appendChild(createCard(link));
  }

  noResults.hidden = links.length > 0;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Returns the currently selected category radio value.
 * @returns {string} "all", "video", or "news"
 */
function getSelectedCategory() {
  const checked = document.querySelector('input[name="category"]:checked');
  return checked ? checked.value : 'all';
}

/**
 * Filters the full dataset by the current search text and selected category.
 * @returns {object[]} Filtered array of LinkPreview objects
 */
function filterLinks() {
  const query = searchInput.value.trim().toLowerCase();
  const category = getSelectedCategory();

  return allLinks.filter((link) => {
    const matchesCategory = category === 'all' || link.type === category;
    const matchesSearch =
      !query ||
      link.title.toLowerCase().includes(query) ||
      link.description.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Debounced search input handler.
 */
function onSearchInput() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    renderCards(filterLinks());
  }, 200);
}

/**
 * Category radio change handler.
 */
function onCategoryChange() {
  renderCards(filterLinks());
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Fetches link data, stores the dataset, renders cards, and binds event listeners.
 */
async function init() {
  container = document.getElementById('link-list');
  noResults = document.getElementById('no-results');
  searchInput = document.getElementById('search-input');

  try {
    const response = await fetch('links-data.json');
    if (!response.ok) {
      throw new Error(`Failed to load links data (${response.status})`);
    }
    allLinks = await response.json();
  } catch (err) {
    container.innerHTML =
      '<p style="text-align:center;color:#c00;padding:2rem;">Unable to load link data. Please try again later.</p>';
    console.error('init error:', err);
    return;
  }

  renderCards(allLinks);

  // Bind event listeners
  searchInput.addEventListener('input', onSearchInput);

  const radios = document.querySelectorAll('input[name="category"]');
  for (const radio of radios) {
    radio.addEventListener('change', onCategoryChange);
  }
}

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');

  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
    toggle.textContent = '☀️';
  }

  toggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    toggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  init();
});

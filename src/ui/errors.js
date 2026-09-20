// The page-level error banner.
//
// Deliberately coarse: this is for "the whole board could not refresh", not for one block
// failing. Per-block error states are EPIC-4 story E4-2.

export function showError(msg){ const b = document.getElementById('errorBanner'); b.textContent = msg; b.classList.add('show'); }

export function clearError(){ document.getElementById('errorBanner').classList.remove('show'); }

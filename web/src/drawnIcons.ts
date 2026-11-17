// Icons Tabler doesn't have, drawn in its style: a 24px grid, 2px round strokes, 2px padding.
// SVG children of a `<svg viewBox="0 0 24 24">` with the stroke set by the caller.
export const DRAWN_ICONS: Record<string, string> = {
  butter:
    '<path d="M3 18h18"/><path d="M6 18v-5h9v5"/><path d="M6 13l3 -3h9l-3 3"/><path d="M18 10v5l-3 3"/>',
  sugar:
    '<rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><rect x="8.5" y="4.5" width="7" height="7" rx="1.5"/><path d="M7.5 16.5v.01"/><path d="M16.5 16.5v.01"/><path d="M12 8v.01"/>',
  can: '<path d="M6 6a6 2 0 1 0 12 0a6 2 0 1 0 -12 0"/><path d="M6 6v12a6 2 0 0 0 12 0v-12"/><path d="M6 10a6 2 0 0 0 12 0"/><path d="M6 14a6 2 0 0 0 12 0"/>',
  jar: '<rect x="7" y="3" width="10" height="3" rx="1"/><path d="M8 6v1a3 3 0 0 0 -2 2.8v9.2a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2v-9.2a3 3 0 0 0 -2 -2.8v-1"/><path d="M12 12.5c-1 1.2 -1.5 2 -1.5 2.7a1.5 1.5 0 0 0 3 0c0 -.7 -.5 -1.5 -1.5 -2.7z"/>',
  // Six long grains, scattered every which way.
  rice: '<path d="M4.5 8l5.5 -2.5"/><path d="M13 4l5.5 3"/><path d="M8.5 11.5l2.5 5"/><path d="M13.5 11l6 1.5"/><path d="M4 18l4.5 2"/><path d="M13 19.5l5.5 -3"/>',
  potato:
    '<ellipse cx="12" cy="12" rx="8.5" ry="6" transform="rotate(-30 12 12)"/><path d="M9 11v.01"/><path d="M14 9v.01"/><path d="M13 15v.01"/>',
  onion:
    '<path d="M12 4c-3 3 -7 5 -7 10a7 6 0 0 0 14 0c0 -5 -4 -7 -7 -10"/><path d="M12 4v-1"/><path d="M12 8c-1.5 2 -3 4 -3 7"/><path d="M12 8c1.5 2 3 4 3 7"/><path d="M10 21h4"/>',
  tomato:
    '<path d="M5 13a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M9 6.5l3 1.5l3 -1.5"/><path d="M12 8v-4"/>',
  soap: '<path d="M5 12h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-2a3 3 0 0 1 3 -3z"/><path d="M7 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M14 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M17 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  sponge:
    '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M3 11h18"/><path d="M8 14.5v.01"/><path d="M12 15.5v.01"/><path d="M16 14v.01"/>',
  'dish-soap':
    '<path d="M8 9h8a1 1 0 0 1 1 1v9a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-9a1 1 0 0 1 1 -1z"/><path d="M10 9v-3h4v3"/><path d="M12 6v-3h3"/><path d="M12 13c-1 1.2 -1.5 2 -1.5 2.7a1.5 1.5 0 0 0 3 0c0 -.7 -.5 -1.5 -1.5 -2.7z"/>',
  tissue:
    '<path d="M4 12h16v7a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M9 12c0 -3 1.5 -6 3 -8c1.5 2 3 5 3 8"/>',
  toilet:
    '<rect x="4" y="3" width="7" height="8" rx="1"/><path d="M4 11h16a6 6 0 0 1 -6 6h-4a6 6 0 0 1 -6 -6z"/><path d="M8.5 17l-.5 4h8l-.5 -4"/>',
  pantry:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 12h16"/><path d="M7 12v-4h3v4"/><path d="M13 12v-5h4v5"/><path d="M7 21v-5h4v5"/><path d="M15 21v-3h2v3"/>',
  attic: '<path d="M3 20h18l-9 -15z"/><path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>',
  cabinet:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18"/><path d="M10 11v2"/><path d="M14 11v2"/>',
}

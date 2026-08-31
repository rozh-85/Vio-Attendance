/**
 * One place for everything Vio-branded.
 *
 * The on-screen logo, the browser favicon and the logo printed on the PDF
 * report all come from here, so the brand only ever has to be changed once.
 * The colours mirror the `--color-brand-*` tokens in `src/index.css`.
 */

export const BRAND_NAME = 'Vio';
export const APP_NAME = 'Vio Attendance';

/** Vio red, and the two steps either side of it used across the UI. */
export const BRAND = {
  red: '#A5292B',
  redDark: '#841F21',
  redTint: '#FBF3F3',
  redLine: '#EDC5C6',
} as const;

/** The logo file in `public/`. Replace that file to swap in official artwork. */
export const LOGO_SRC = '/vio-logo.svg';

/**
 * The same mark as inline SVG markup.
 *
 * The PDF report is printed from a document this app writes into a new window,
 * where an external `<img>` may not have loaded by the time the print dialog
 * opens — an inline mark always prints.
 */
export function logoSvgMarkup(size = 46, radius = 10): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${BRAND_NAME}">
  <rect width="512" height="512" rx="${(radius / size) * 512}" fill="#FFFFFF"/>
  <text x="256" y="344" fill="${BRAND.red}" text-anchor="middle"
        font-family="'Arial Black','Arial Bold','Helvetica Neue',Arial,Helvetica,sans-serif"
        font-size="252" font-weight="900" letter-spacing="-8">${BRAND_NAME}</text>
</svg>`;
}

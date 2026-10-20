// Self-hosted Barlow (was Google Fonts) so text renders the same offline and no request goes to Google.
// Latin + Latin Extended covers accented exercise names. The Latin files load at once; the Latin Extended ones (fonts.css, with a
// unicode-range) are not requested by the page until an accented or other extended character is on screen (the service worker still
// precaches them after load, for offline use).
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './fonts.css';

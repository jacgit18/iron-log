/** The Google Form that collects feedback. The Settings panel stays hidden while this is empty. */
export const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf2L4zou2aktKh8wEFQz8GJP3dAAT3IvQTUJLcSoSotJJMJNA/viewform';

/** True only for an https link, so a typo in the constant never renders a broken or unsafe link. */
export function feedbackLink(url: string = FEEDBACK_FORM_URL): string | null {
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

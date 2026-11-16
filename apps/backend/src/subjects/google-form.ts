import { BadRequestException } from '@nestjs/common';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const INVALID = 'Enter a valid Google Form link (docs.google.com/forms or forms.gle)';
const MAX_REDIRECTS = 3;

function parse(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    throw new BadRequestException(INVALID);
  }
}

const isFormPage = (url: URL) =>
  url.protocol === 'https:' &&
  url.hostname === 'docs.google.com' &&
  url.pathname.startsWith('/forms/');

const isShortLink = (url: URL) =>
  url.protocol === 'https:' &&
  url.hostname === 'forms.gle' &&
  /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);

/**
 * `forms.gle` short links (what Google's "Send" button copies) redirect to the
 * real form. Only Google's own hosts are ever requested, and each redirect
 * hop is checked before it is followed, so this cannot be used to reach
 * other servers.
 */
async function resolveShortLink(start: URL, fetchImpl: Fetch) {
  let current = start;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadRequestException(
        'Could not open that forms.gle link. Paste the full docs.google.com/forms link instead.'
      );
    }
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location)
      break;
    const next = new URL(location, current);
    if (isFormPage(next)) return next;
    if (!isShortLink(next)) break;
    current = next;
  }
  throw new BadRequestException(
    'That forms.gle link does not lead to a Google Form. Paste the full docs.google.com/forms link instead.'
  );
}

/**
 * Turns any shareable Google Form link into its embeddable student view.
 * Accepts docs.google.com/forms links (including /edit) and forms.gle short links.
 */
export async function embeddableGoogleFormUrl(
  value: string,
  fetchImpl: Fetch = fetch
) {
  let url = parse(value);
  if (isShortLink(url)) url = await resolveShortLink(url, fetchImpl);
  else if (!isFormPage(url)) throw new BadRequestException(INVALID);
  if (url.pathname.endsWith('/edit'))
    url.pathname = `${url.pathname.slice(0, -5)}/viewform`;
  url.hash = '';
  url.searchParams.delete('usp');
  url.searchParams.set('embedded', 'true');
  return url.toString();
}

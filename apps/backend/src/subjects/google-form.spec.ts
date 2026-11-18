import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embeddableGoogleFormUrl } from './google-form';

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

test('turns an edit link into the embedded student view', async () => {
  const url = await embeddableGoogleFormUrl(
    'https://docs.google.com/forms/d/abc123/edit#responses'
  );
  assert.equal(url, 'https://docs.google.com/forms/d/abc123/viewform?embedded=true');
});

test('resolves forms.gle short links without leaving Google', async () => {
  const requested: string[] = [];
  const url = await embeddableGoogleFormUrl('https://forms.gle/AbC123xyz', async (target) => {
    requested.push(target);
    return redirect('https://docs.google.com/forms/d/e/1FAIpQL/viewform?usp=send_form');
  });
  assert.deepEqual(requested, ['https://forms.gle/AbC123xyz']);
  assert.equal(url, 'https://docs.google.com/forms/d/e/1FAIpQL/viewform?embedded=true');
});

test('refuses short links that redirect anywhere else', async () => {
  await assert.rejects(
    embeddableGoogleFormUrl('https://forms.gle/AbC123xyz', async () =>
      redirect('https://evil.example/forms/x')
    ),
    /does not lead to a Google Form/
  );
});

test('never fetches non-Google links', async () => {
  for (const link of [
    'http://docs.google.com/forms/d/x/viewform',
    'https://docs.google.com.evil.example/forms/d/x',
    'https://forms.gle.evil.example/x',
    'https://example.com/forms/x',
    'not a url',
  ])
    await assert.rejects(
      embeddableGoogleFormUrl(link, async () => {
        throw new Error('must not fetch');
      }),
      /valid Google Form link/,
      link
    );
});

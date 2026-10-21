export async function handle({ event, resolve }) {
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      if (['/cards', '/table'].includes(event.url.pathname)) html = html.replace('<html>', '<html lang="en">');
      if (event.url.pathname === '/table') html = html.replace('<body>', '<body class="bg-gray-50 text-gray-900">');
      return html;
    },
  });
}

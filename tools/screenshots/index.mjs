/* Regenerate the README screenshots from the real app.

     cd tools/screenshots && npm install && npx playwright install chromium
     node index.mjs                 # capture everything, then compose
     node index.mjs capture edit    # only some capture jobs (hero, edit, metro, layers, flows, challenges, budget,
                                    # modals, tour, mobile, thin)
     node index.mjs compose hero    # only some composites (see compose.mjs)

   Needs `cwebp` for the WebP output. Set CHROME_PATH to use an existing Chromium instead of Playwright's. */
import { serve, launch, setUrl } from './lib.mjs';
import { jobs } from './capture.mjs';
import { compose } from './compose.mjs';

const [mode = 'all', ...names] = process.argv.slice(2);
if (!['all', 'capture', 'compose'].includes(mode)) { console.error('usage: node index.mjs [all|capture|compose] [names…]'); process.exit(1); }

const { server, url } = await serve();
setUrl(url);
const browser = await launch();
try {
  if (mode !== 'compose') {
    for (const name of names.length && mode === 'capture' ? names : Object.keys(jobs)) {
      if (!jobs[name]) throw new Error(`unknown capture job "${name}"`);
      console.log('capture', name);
      await jobs[name](browser);
    }
  }
  if (mode !== 'capture') await compose(browser, mode === 'compose' ? names : []);
} finally {
  await browser.close();
  server.close();
}

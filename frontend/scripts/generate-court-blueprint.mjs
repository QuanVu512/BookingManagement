import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const output = path.join(root, '.temp/court-blueprint');
const frontend = path.join(root, 'frontend');
const read = (file) => fs.readFile(file, 'utf8');

async function compileFolder(folder) {
  const entries = await fs.readdir(path.join(frontend, folder));
  for (const name of entries.filter((entry) => /\.tsx?$/.test(entry))) {
    const source = path.join(frontend, folder, name);
    const destination = path.join(
      output,
      folder,
      name.replace(/\.tsx?$/, '.mjs'),
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const result = ts
      .transpileModule(await read(source), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      })
      .outputText.replace(
        /from ['"]next\/image['"]/g,
        `from '${pathToFileURL(path.join(output, 'image.mjs')).href}'`,
      )
      .replace(
        /from (['"])(\.[^'"]+)\1/g,
        (_, quote, target) =>
          `from ${quote}${target.endsWith('.json') ? target.replace('.json', '.mjs') : target + '.mjs'}${quote}`,
      );
    await fs.writeFile(destination, result);
  }
}

async function embedImages(html) {
  const matches = [
    ...new Set(
      [
        ...html.matchAll(/(?:src|srcSet)="(\/(?:courts|products)\/[^" ]+)"/g),
      ].map((match) => match[1]),
    ),
  ];
  for (const url of matches) {
    const content = await fs.readFile(path.join(frontend, 'public', url));
    const mime = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
    html = html.replaceAll(
      url,
      `data:${mime};base64,${content.toString('base64')}`,
    );
  }
  return html;
}

async function prepareModules() {
  await fs.mkdir(output, { recursive: true });
  const config = await read(path.join(frontend, 'data/court-booking.json'));
  await fs.mkdir(path.join(output, 'data'), { recursive: true });
  await fs.writeFile(
    path.join(output, 'data/court-booking.mjs'),
    `export default ${config};`,
  );
  await fs.writeFile(
    path.join(output, 'image.mjs'),
    "import React from 'react'; export default function Image({src, alt, fill, sizes, priority, ...props}) { return React.createElement('img',{...props,src,alt,style:fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}); }",
  );
  for (const folder of ['data', 'lib', 'components/court-detail'])
    await compileFolder(folder);
}

async function renderBlueprint() {
  const config = await read(path.join(frontend, 'data/court-booking.json'));
  const { CourtBookingPreview } = await import(
    pathToFileURL(
      path.join(output, 'components/court-detail/court-booking-preview.mjs'),
    ).href
  );
  const markup = renderToStaticMarkup(React.createElement(CourtBookingPreview));
  const html = await embedImages(
    markup.replace(/<link rel="preload"[^>]+>/g, ''),
  );
  const css = await read(path.join(frontend, 'public/court-booking.css'));
  const model = (await read(path.join(output, 'lib/court-booking.mjs')))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, '');
  const courtModule = await import(
    pathToFileURL(path.join(output, 'data/courts.mjs')).href
  );
  const runtime = await read(
    path.join(frontend, 'scripts/court-blueprint-runtime.js'),
  );
  const script = `const config=${config};\n${model}\nconst court=${JSON.stringify(courtModule.FALLBACK_COURTS[0])};\n${runtime}`;
  const document = `<!doctype html>\n<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Center Court Pro 1 — SMASH ARENA</title><style>html,body{margin:0;padding:0} ${css}</style></head><body>${html}<script>${script}</script></body></html>\n`;
  return document;
}

async function main() {
  await prepareModules();
  const document = await renderBlueprint();
  await fs.writeFile(
    path.join(root, 'pickleball-booking-detail.html'),
    document,
  );
  console.log(
    'Blueprint exported with inline CSS, embedded local photos, and shared pricing logic.',
  );
}

await main();

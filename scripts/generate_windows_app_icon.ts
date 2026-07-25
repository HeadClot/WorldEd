/** Builds a multi-size Windows .ico from the 512px chrome icon using png-to-ico. */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pngToIco from 'png-to-ico';

const sourcePath = resolve(process.cwd(), 'public/android-chrome-512x512.png');
const destinationPath = resolve(process.cwd(), 'public/app_icon.ico');
const icoBuffer = await pngToIco(sourcePath);
writeFileSync(destinationPath, icoBuffer);
console.log(`Wrote ${destinationPath} (${icoBuffer.length} bytes)`);

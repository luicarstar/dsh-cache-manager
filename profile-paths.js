import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function dshHomeDir(){return resolve(process.env.DSH_HOME || fileURLToPath(new URL('../../../',import.meta.url)));}
export function profileDir(){return resolve(process.env.DSH_PROFILE_DIR || join(dshHomeDir(),'profiles','desktop'));}
export function profileNodeModules(){const p=join(profileDir(),'node_modules');return existsSync(p)?p:undefined;}

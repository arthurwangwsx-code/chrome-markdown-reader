import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const archive = path.join('releases', `chrome-markdown-reader-v${packageJson.version}-chrome.zip`);
const files = unzipSync(new Uint8Array(await readFile(archive)));
const names = Object.keys(files);
const failures = [];

const forbidden = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:tests?|coverage|quality|参考工程)(\/|$)/i,
  /\.map$/i,
  /\.(?:pem|key|p12|pfx|log)$/i,
  /(^|\/)node_modules(\/|$)/i,
];
for (const name of names) if (forbidden.some((rule) => rule.test(name))) failures.push(`forbidden archive entry: ${name}`);

if (!files['manifest.json']) failures.push('manifest.json is missing');
else {
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (manifest.manifest_version !== 3) failures.push('release is not Manifest V3');
  if (manifest.version !== packageJson.version) failures.push(`manifest version ${manifest.version} != package version ${packageJson.version}`);
  const permissions = new Set([...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])]);
  for (const permission of ['debugger', 'cookies', 'history', 'nativeMessaging']) {
    if (permissions.has(permission)) failures.push(`forbidden permission: ${permission}`);
  }
  const hosts = [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])];
  if (hosts.some((host) => host === '<all_urls>' || /^https?:\/\/\*\//.test(host))) failures.push('release requests broad web host access');
}

if (!names.some((name) => name.startsWith('icons/icon128.'))) failures.push('128px product icon missing');
if (!names.includes('modules/content.js')) failures.push('content module missing');

console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', archive, entries: names.length, failures }, null, 2));
if (failures.length) process.exit(1);

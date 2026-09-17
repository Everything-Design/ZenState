// One-time migration for legacy 5.8.4-test clients with an implicit test channel.
// Run after release:check. --live verifies the published feed without installing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { createRequire } = require('node:module');
// Use the updater's SemVer class; another installed major is not interchangeable.
const updaterRequire = createRequire(require.resolve('electron-updater'));
const semver = updaterRequire('semver');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');

const stable = '5.8.4';
const bridge = 'v5.8.4-test.8';
const root = path.resolve(__dirname, '../dist/release-5.8.4');
const output = path.join(root, 'test-channel-bridge');
const live = process.argv.includes('--live');
const responses = new Map();
const feed = `<feed>${[`v${stable}`, bridge].map(tag =>
  `<entry><title>${tag}</title><link href="https://github.com/Everything-Design/ZenState/releases/tag/${tag}"/><content>Update to ${stable}</content></entry>`
).join('')}</feed>`;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  process.env.TEST_UPDATER_ARCH = 'x64';
  const results = [];
  for (const [platform, folder, suffix] of [['win32', 'windows', ''], ['darwin', 'mac', '-mac'], ['linux', 'linux', '-linux']]) {
    const raw = fs.readFileSync(path.join(root, folder, `latest${suffix}.yml`), 'utf8');
    const manifest = yaml.load(raw);
    assert.equal(manifest.version, stable);
    for (const file of manifest.files) assert.equal(path.basename(file.url), file.url);
    // GitHubProvider merges parsed metadata after its discovered tag. This tag
    // sends downloads to the stable release, preserving exact verified hashes.
    const bridgeRaw = yaml.dump({ ...manifest, tag: `v${stable}` });
    const bridgeFile = `test${suffix}.yml`;
    if (!live) fs.writeFileSync(path.join(output, bridgeFile), bridgeRaw);
    for (const repo of ['ZenState', 'ZenState_V3']) {
      for (const version of ['5.8.2', '5.8.3', ...Array.from({ length: 7 }, (_, i) => `5.8.4-test.${i + 1}`), stable]) {
        const legacy = version.includes('-test.') && Number(version.split('.').at(-1)) <= 5;
        const requests = [];
        const provider = new GitHubProvider({ provider: 'github', owner: 'Everything-Design', repo }, {
          channel: legacy ? null : 'latest', allowPrerelease: legacy,
          currentVersion: new semver.SemVer(version), fullChangelog: false,
        }, { platform, executor: { async request(options) {
          const url = new URL(options.path, `https://${options.hostname}`);
          requests.push(url.href);
          if (live) {
            if (!responses.has(url.href)) {
              const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(20000) });
              assert.equal(response.status, 200, url.href);
              responses.set(url.href, await response.text());
            }
            return responses.get(url.href);
          }
          if (url.pathname.endsWith('.atom')) return feed;
          if (url.pathname.endsWith('/latest')) return JSON.stringify({ tag_name: `v${stable}` });
          const expected = `/releases/download/${legacy ? bridge : `v${stable}`}/${legacy ? bridgeFile : `latest${suffix}.yml`}`;
          assert.ok(url.pathname.endsWith(expected), url.href);
          return legacy ? bridgeRaw : raw;
        } } });
        const info = await provider.getLatestVersion();
        assert.equal(info.version, stable);
        assert.equal(info.tag, `v${stable}`);
        assert.equal(semver.gt(info.version, version), version !== stable);
        const files = provider.resolveFiles(info);
        assert.equal(files.length, manifest.files.length);
        files.forEach((file, i) => {
          assert.equal(file.url.href, `https://github.com/Everything-Design/${repo}/releases/download/v${stable}/${manifest.files[i].url}`);
          assert.deepEqual(file.info, manifest.files[i]);
        });
        if (legacy) assert.ok(requests.some(url => new URL(url).pathname.endsWith(`/${bridge}/${bridgeFile}`)), JSON.stringify({ version, platform, requests }));
        results.push({ platform, repo, from: version, to: info.version, legacy, passed: true });
      }
    }
  }
  fs.writeFileSync(path.join(output, live ? 'live-validation.json' : 'validation.json'), JSON.stringify(results, null, 2));
  console.log(`${results.length} ${live ? 'live' : 'fixture'} provider checks passed; manifests preserve the verified stable files and hashes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

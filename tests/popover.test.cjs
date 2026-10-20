const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../dist/main/tray.js');
const localRequire = createRequire(file);
const windows = { exports: {} };
vm.runInNewContext(fs.readFileSync(localRequire.resolve('./windows'), 'utf8'), {
  module: windows, exports: windows.exports, process,
  require: name => name === 'electron' ? {} : localRequire(name),
});
const { POPOVER_WIDTH, POPOVER_HEIGHT } = windows.exports;

test('popup fits the tray display and does not shrink across repeated opens on Mac, Windows or Linux', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    for (const workArea of [
      { x: 0, y: 25, width: 1440, height: 850 },
      { x: -1280, y: -200, width: 1280, height: 600 },
      { x: 1920, y: 25, width: 1024, height: 480 },
    ]) {
      const trayBounds = { x: workArea.x + workArea.width - 40, y: platform === 'darwin' ? workArea.y - 25 : workArea.y + workArea.height, width: 24, height: 25 };
      const icon = { isEmpty: () => false, resize() { return this; }, setTemplateImage() {} };
      const electron = {
        app: { isPackaged: false },
        nativeImage: { createFromPath: () => icon },
        Tray: class { setToolTip() {} on() {} setContextMenu() {} getBounds() { return trayBounds; } },
        Menu: { buildFromTemplate: () => [] },
        screen: { getDisplayMatching: () => ({ workArea }) },
      };
      const module = { exports: {} };
      vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module, exports: module.exports, __dirname: path.dirname(file), process: { platform }, global: {}, console,
        require: name => name === 'electron' ? electron : name === './windows' ? windows.exports : localRequire(name),
      });
      module.exports.createTray({ onClick() {}, onStatusChange() {}, onOpenDashboard() {} });
      const bounds = [];
      const window = { setBounds: value => bounds.push(value) };
      for (let i = 0; i < 20; i++) module.exports.positionPopover(window);
      for (const value of bounds) {
        assert.equal(value.width, POPOVER_WIDTH);
        assert.equal(value.height, Math.min(POPOVER_HEIGHT, workArea.height - 16));
        assert.ok(value.x >= workArea.x + 8);
        assert.ok(value.y >= workArea.y + 8);
        assert.ok(value.x + value.width <= workArea.x + workArea.width - 8);
        assert.ok(value.y + value.height <= workArea.y + workArea.height - 8);
        assert.deepEqual(value, bounds[0]);
      }
    }
  }
});
